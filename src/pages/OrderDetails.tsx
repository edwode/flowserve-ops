import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, CheckCircle, AlertTriangle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  notes: string | null;
  status: string;
  station_type: string;
  created_at: string;
  dispatched_at: string | null;
  ready_at: string | null;
  menu_items: {
    name: string;
    category: string;
  };
}

interface Order {
  id: string;
  order_number: string;
  table_number: string;
  guest_name: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  dispatched_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  paid_at: string | null;
  reservation_name?: string | null;
}

interface Payment {
  payment_method: string;
  amount: number;
  created_at: string;
}

const OrderDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { formatPrice } = useTenantCurrency();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [returnDialog, setReturnDialog] = useState<{ item: OrderItem } | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
      
      const channel = supabase
        .channel(`order-${id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${id}`
          },
          () => {
            fetchOrderDetails();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'order_items',
            filter: `order_id=eq.${id}`
          },
          () => {
            fetchOrderDetails();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [id]);

  const fetchOrderDetails = async () => {
    try {
      // Fetch order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();

      if (orderError) throw orderError;

      // Fetch reservation name from table if table_number exists
      let reservationName: string | null = null;
      if (orderData?.table_number) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', (await supabase.auth.getUser()).data.user?.id)
          .single();

        if (profile?.tenant_id) {
          const { data: tableData } = await supabase
            .from('tables')
            .select('reservation_name')
            .eq('tenant_id', profile.tenant_id)
            .eq('table_number', orderData.table_number)
            .maybeSingle();

          reservationName = tableData?.reservation_name || null;
        }
      }

      setOrder({ ...orderData, reservation_name: reservationName });

      // Fetch order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          id,
          quantity,
          price,
          notes,
          status,
          station_type,
          created_at,
          dispatched_at,
          ready_at,
          menu_items (name, category)
        `)
        .eq('order_id', id)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;
      setOrderItems(itemsData || []);

      // Fetch payments
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('payment_method, amount, created_at')
        .eq('order_id', id);

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData || []);
    } catch (error: any) {
      toast({
        title: "Error loading order",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkServed = async () => {
    if (!order) return;

    try {
      // Exclude rejected/returned items from the check - they won't be served
      const activeItems = orderItems.filter(item => 
        item.status !== 'rejected' && item.status !== 'returned'
      );
      const allReady = activeItems.length > 0 && activeItems.every(item => 
        item.status === 'ready' || item.status === 'served'
      );

      if (!allReady) {
        toast({
          title: "Cannot mark as served",
          description: "Not all items are ready yet",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({
          status: 'served',
          served_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (error) throw error;

      // Update all items to served
      const { error: itemsError } = await supabase
        .from('order_items')
        .update({ status: 'served' })
        .eq('order_id', order.id)
        .in('status', ['ready']);

      if (itemsError) throw itemsError;

      toast({
        title: "Order marked as served",
        description: "Order is now ready for payment",
      });

      fetchOrderDetails();
    } catch (error: any) {
      toast({
        title: "Error updating order",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReportReturn = async () => {
    if (!returnDialog || !returnReason.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a reason for the return",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) throw new Error("No tenant found");

      const { error } = await supabase
        .from('order_returns')
        .insert({
          order_item_id: returnDialog.item.id,
          reported_by: user.id,
          tenant_id: profile.tenant_id,
          reason: returnReason,
        });

      if (error) throw error;

      // Update item status to returned
      const { error: itemError } = await supabase
        .from('order_items')
        .update({ status: 'returned' })
        .eq('id', returnDialog.item.id);

      if (itemError) throw itemError;

      toast({
        title: "Return reported",
        description: "Station and cashier have been notified",
      });

      setReturnDialog(null);
      setReturnReason("");
      fetchOrderDetails();
    } catch (error: any) {
      toast({
        title: "Error reporting return",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-pending text-pending-foreground';
      case 'dispatched':
        return 'bg-accent text-accent-foreground';
      case 'ready':
        return 'bg-success text-success-foreground';
      case 'served':
        return 'bg-secondary text-secondary-foreground';
      case 'paid':
        return 'bg-muted text-muted-foreground';
      case 'rejected':
      case 'returned':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const getStationName = (type: string) => {
    const names: Record<string, string> = {
      'drink_dispenser': 'Drinks',
      'meal_dispenser': 'Meals',
      'mixologist': 'Cocktails',
      'bar': 'Bar',
    };
    return names[type] || type;
  };

  const groupedItems = orderItems.reduce((acc, item) => {
    const station = item.station_type;
    if (!acc[station]) acc[station] = [];
    acc[station].push(item);
    return acc;
  }, {} as Record<string, OrderItem[]>);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Order not found</p>
          <Button className="mt-4" onClick={() => navigate('/waiter')}>
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }

  // Exclude rejected/returned items from the check - they won't be served
  const activeItems = orderItems.filter(item => 
    item.status !== 'rejected' && item.status !== 'returned'
  );
  const allReady = activeItems.length > 0 && activeItems.every(item => 
    item.status === 'ready' || item.status === 'served'
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/waiter')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{order.order_number}</h1>
            <p className="text-sm text-muted-foreground">
              Table {order.table_number}
              {order.reservation_name && ` • ${order.reservation_name}`}
              {order.guest_name && ` • ${order.guest_name}`}
            </p>
          </div>
          <Badge className={getStatusColor(order.status)} variant="secondary">
            {order.status}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Order Summary */}
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Amount</span>
              <span className="text-2xl font-bold">{formatPrice(order.total_amount)}</span>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Created:</span>
                <div>{new Date(order.created_at).toLocaleTimeString()}</div>
              </div>
              {order.ready_at && (
                <div>
                  <span className="text-muted-foreground">Ready:</span>
                  <div>{new Date(order.ready_at).toLocaleTimeString()}</div>
                </div>
              )}
              {order.served_at && (
                <div>
                  <span className="text-muted-foreground">Served:</span>
                  <div>{new Date(order.served_at).toLocaleTimeString()}</div>
                </div>
              )}
              {order.paid_at && (
                <div>
                  <span className="text-muted-foreground">Paid:</span>
                  <div>{new Date(order.paid_at).toLocaleTimeString()}</div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Payment Information */}
        {payments.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Payment Details</h3>
            <div className="space-y-2">
              {payments.map((payment, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground capitalize">
                    {payment.payment_method}
                  </span>
                  <span className="font-semibold">{formatPrice(payment.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Items by Station */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Items by Station</h2>
          
          {Object.entries(groupedItems).map(([station, items]) => (
            <Card key={station} className="p-4">
              <h3 className="font-semibold mb-3 text-primary">
                {getStationName(station)}
              </h3>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="border-l-2 border-primary/30 pl-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-medium">{item.menu_items.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Qty: {item.quantity} • {formatPrice(item.price)} each
                        </div>
                        {item.notes && (
                          <div className="text-sm text-muted-foreground mt-1">
                            Notes: {item.notes}
                          </div>
                        )}
                      </div>
                      <Badge className={getStatusColor(item.status)} variant="secondary">
                        {item.status}
                      </Badge>
                    </div>

                    {/* Item Actions */}
                    {item.status === 'served' && order.status !== 'paid' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setReturnDialog({ item })}
                      >
                        <AlertTriangle className="mr-2 h-3 w-3" />
                        Report Return
                      </Button>
                    )}

                    {/* Timestamps */}
                    <div className="text-xs text-muted-foreground mt-2 space-y-1">
                      {item.dispatched_at && (
                        <div>Dispatched: {new Date(item.dispatched_at).toLocaleTimeString()}</div>
                      )}
                      {item.ready_at && (
                        <div>Ready: {new Date(item.ready_at).toLocaleTimeString()}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Fixed Bottom Actions */}
      {(order.status === 'ready' || (order.status === 'pending' && allReady) || (order.status === 'dispatched' && allReady)) && allReady && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg p-4">
          <Button
            className="w-full h-12"
            onClick={handleMarkServed}
          >
            <CheckCircle className="mr-2 h-5 w-5" />
            Mark Order as Served
          </Button>
        </div>
      )}

      {/* Return Dialog */}
      <Dialog open={!!returnDialog} onOpenChange={(open) => !open && setReturnDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Item Return</DialogTitle>
            <DialogDescription>
              {returnDialog?.item.menu_items.name} (Qty: {returnDialog?.item.quantity})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for Return</Label>
              <Textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g., Cold food, wrong order, customer complaint..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReturnDialog(null)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReportReturn}
              disabled={processing || !returnReason.trim()}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reporting...
                </>
              ) : (
                'Report Return'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderDetails;
