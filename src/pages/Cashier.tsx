import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, DollarSign, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Order {
  id: string;
  order_number: string;
  table_number: string;
  guest_name: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  served_at: string | null;
  profiles: {
    full_name: string | null;
  };
}

interface OrderReturn {
  id: string;
  reason: string;
  refund_amount: number | null;
  created_at: string;
  confirmed_at: string | null;
  order_items: {
    quantity: number;
    price: number;
    menu_items: {
      name: string;
    };
    orders: {
      order_number: string;
      table_number: string;
      total_amount: number;
    };
  };
  profiles: {
    full_name: string | null;
  };
}

const Cashier = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<OrderReturn[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pos" | "transfer" | "split">("cash");
  const [splitAmounts, setSplitAmounts] = useState({
    cash: "",
    pos: "",
    transfer: "",
  });
  const [paymentNotes, setPaymentNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchData();
    
    const channel = supabase
      .channel('cashier-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          fetchOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_returns'
        },
        () => {
          fetchReturns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    await Promise.all([fetchOrders(), fetchReturns()]);
    setLoading(false);
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          table_number,
          guest_name,
          status,
          total_amount,
          created_at,
          served_at,
          profiles!orders_waiter_id_fkey (full_name)
        `)
        .in('status', ['served', 'ready'])
        .order('served_at', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading orders",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchReturns = async () => {
    try {
      const { data, error } = await supabase
        .from('order_returns')
        .select(`
          id,
          reason,
          refund_amount,
          created_at,
          confirmed_at,
          order_items!inner (
            quantity,
            price,
            menu_items (name),
            orders (order_number, table_number, total_amount)
          ),
          profiles!order_returns_reported_by_fkey (full_name)
        `)
        .not('confirmed_at', 'is', null)
        .order('confirmed_at', { ascending: false });

      if (error) throw error;
      setReturns(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading returns",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleOpenPayment = (order: Order) => {
    setSelectedOrder(order);
    setPaymentMethod("cash");
    setSplitAmounts({ cash: "", pos: "", transfer: "" });
    setPaymentNotes("");
  };

  const handleConfirmPayment = async () => {
    if (!selectedOrder) return;

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

      let paymentAmount = selectedOrder.total_amount;
      
      // Handle split payment
      if (paymentMethod === "split") {
        const cash = parseFloat(splitAmounts.cash || "0");
        const pos = parseFloat(splitAmounts.pos || "0");
        const transfer = parseFloat(splitAmounts.transfer || "0");
        const total = cash + pos + transfer;

        if (Math.abs(total - selectedOrder.total_amount) > 0.01) {
          toast({
            title: "Invalid split amounts",
            description: `Total must equal $${selectedOrder.total_amount.toFixed(2)}`,
            variant: "destructive",
          });
          setProcessing(false);
          return;
        }

        // Create multiple payment records for split
        const payments = [];
        if (cash > 0) payments.push({ method: 'cash', amount: cash });
        if (pos > 0) payments.push({ method: 'pos', amount: pos });
        if (transfer > 0) payments.push({ method: 'transfer', amount: transfer });

        for (const payment of payments) {
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              order_id: selectedOrder.id,
              amount: payment.amount,
              payment_method: payment.method as "cash" | "pos" | "transfer",
              tenant_id: profile.tenant_id,
              confirmed_by: user.id,
              notes: paymentNotes || null,
            });

          if (paymentError) throw paymentError;
        }
      } else {
        // Single payment method
        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            order_id: selectedOrder.id,
            amount: paymentAmount,
            payment_method: paymentMethod,
            tenant_id: profile.tenant_id,
            confirmed_by: user.id,
            notes: paymentNotes || null,
          });

        if (paymentError) throw paymentError;
      }

      // Update order status to paid
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', selectedOrder.id);

      if (orderError) throw orderError;

      toast({
        title: "Payment confirmed",
        description: `Order ${selectedOrder.order_number} marked as paid`,
      });

      setSelectedOrder(null);
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error processing payment",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveRefund = async (returnItem: OrderReturn) => {
    try {
      const refundAmount = returnItem.refund_amount || 
        (returnItem.order_items.price * returnItem.order_items.quantity);

      const { error } = await supabase
        .from('order_returns')
        .update({ refund_amount: refundAmount })
        .eq('id', returnItem.id);

      if (error) throw error;

      toast({
        title: "Refund approved",
        description: `$${refundAmount.toFixed(2)} will be refunded`,
      });

      fetchReturns();
    } catch (error: any) {
      toast({
        title: "Error approving refund",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'bg-success text-success-foreground';
      case 'served':
        return 'bg-accent text-accent-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const getSplitTotal = () => {
    const cash = parseFloat(splitAmounts.cash || "0");
    const pos = parseFloat(splitAmounts.pos || "0");
    const transfer = parseFloat(splitAmounts.transfer || "0");
    return cash + pos + transfer;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-bold">Cashier Station</h1>
            <p className="text-sm text-muted-foreground">
              {orders.length} pending payments
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <Tabs defaultValue="payments" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payments">
              Payments ({orders.length})
            </TabsTrigger>
            <TabsTrigger value="returns">
              Returns ({returns.length})
            </TabsTrigger>
          </TabsList>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-3">
            {orders.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No pending payments</p>
              </Card>
            ) : (
              orders.map((order) => (
                <Card
                  key={order.id}
                  className="p-4 hover:bg-accent/5 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-lg">
                          {order.order_number}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Table {order.table_number}
                          {order.guest_name && ` • ${order.guest_name}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Waiter: {order.profiles?.full_name || 'Unknown'}
                        </div>
                      </div>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <div>
                        <div className="text-2xl font-bold">
                          ${order.total_amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {order.served_at 
                            ? `Served: ${new Date(order.served_at).toLocaleTimeString()}`
                            : `Ordered: ${new Date(order.created_at).toLocaleTimeString()}`
                          }
                        </div>
                      </div>
                      <Button onClick={() => handleOpenPayment(order)}>
                        <DollarSign className="mr-2 h-4 w-4" />
                        Process Payment
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Returns Tab */}
          <TabsContent value="returns" className="space-y-3">
            {returns.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No confirmed returns</p>
              </Card>
            ) : (
              returns.map((returnItem) => (
                <Card
                  key={returnItem.id}
                  className="p-4 border-destructive/50"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold">
                          {returnItem.order_items.orders.order_number}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Table {returnItem.order_items.orders.table_number}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Reported by: {returnItem.profiles?.full_name || 'Unknown'}
                        </div>
                      </div>
                      <Badge variant="destructive">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Return
                      </Badge>
                    </div>

                    <div className="border-t border-border pt-3">
                      <div className="font-medium">
                        {returnItem.order_items.menu_items.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Qty: {returnItem.order_items.quantity} • 
                        ${returnItem.order_items.price.toFixed(2)} each
                      </div>
                      <div className="text-sm text-destructive mt-2">
                        Reason: {returnItem.reason}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <div className="text-lg font-bold">
                        Refund: $
                        {(returnItem.refund_amount || 
                          returnItem.order_items.price * returnItem.order_items.quantity
                        ).toFixed(2)}
                      </div>
                      {!returnItem.refund_amount && (
                        <Button
                          variant="outline"
                          onClick={() => handleApproveRefund(returnItem)}
                        >
                          Approve Refund
                        </Button>
                      )}
                      {returnItem.refund_amount && (
                        <Badge variant="secondary">Approved</Badge>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Payment Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Order {selectedOrder?.order_number} • Table {selectedOrder?.table_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-center py-4 border-y border-border">
              <div className="text-3xl font-bold">
                ${selectedOrder?.total_amount.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">Total Amount</div>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value: any) => setPaymentMethod(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS/Card</SelectItem>
                  <SelectItem value="transfer">Bank Transfer</SelectItem>
                  <SelectItem value="split">Split Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "split" && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md">
                <Label className="text-sm font-semibold">Split Payment Details</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="w-20 text-sm">Cash:</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={splitAmounts.cash}
                      onChange={(e) => setSplitAmounts(prev => ({ ...prev, cash: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-20 text-sm">POS:</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={splitAmounts.pos}
                      onChange={(e) => setSplitAmounts(prev => ({ ...prev, pos: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-20 text-sm">Transfer:</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={splitAmounts.transfer}
                      onChange={(e) => setSplitAmounts(prev => ({ ...prev, transfer: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="font-semibold">Total:</span>
                    <span className={`font-bold ${
                      Math.abs(getSplitTotal() - (selectedOrder?.total_amount || 0)) < 0.01
                        ? 'text-success'
                        : 'text-destructive'
                    }`}>
                      ${getSplitTotal().toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Add payment notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedOrder(null)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmPayment} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Payment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cashier;
