import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, LogOut, Plus, Minus, DollarSign, X, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  station_type: string;
}

interface CartItem extends MenuItem {
  quantity: number;
}

interface OrderItem {
  id: string;
  status: string;
  station_type: string;
  menu_item_name: string;
  quantity: number;
}

interface Order {
  id: string;
  order_number: string;
  table_number: string;
  guest_name: string | null;
  total_amount: number;
  status: string;
  created_at: string;
  waiter_name?: string | null;
  items?: OrderItem[];
}

const Bar = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, tenantId, loading: authLoading } = useAuthGuard();
  const { formatPrice } = useTenantCurrency();
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [guestName, setGuestName] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pos" | "transfer">("cash");
  const [processing, setProcessing] = useState(false);
  const [activeEvent, setActiveEvent] = useState<string>("");
  const [userName, setUserName] = useState<string | null>(null);

  // Fetch user profile name
  useEffect(() => {
    const fetchUserName = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      if (data?.full_name) setUserName(data.full_name);
    };
    fetchUserName();
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchData();
    }
  }, [authLoading, user]);

  // Separate effect for realtime subscription that depends on activeEvent
  useEffect(() => {
    if (!activeEvent) return;
    
    const channel = supabase
      .channel('bar-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          fetchOrders(activeEvent);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items'
        },
        () => {
          fetchOrders(activeEvent);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeEvent]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      // First check if user has an assigned event
      const { data: profile } = await supabase
        .from('profiles')
        .select('event_id')
        .eq('id', user.id)
        .single();

      let eventId: string | null = null;

      if (profile?.event_id) {
        // Use user's assigned event
        eventId = profile.event_id;
      } else {
        // Fall back to finding an active event with bar menu items
        const { data: eventsWithBarItems } = await supabase
          .from('menu_items')
          .select('event_id')
          .in('station_type', ['bar', 'mixologist'])
          .eq('is_available', true)
          .not('event_id', 'is', null)
          .limit(1);

        if (eventsWithBarItems && eventsWithBarItems.length > 0) {
          // Verify the event is active
          const { data: activeEvent } = await supabase
            .from('events')
            .select('id')
            .eq('id', eventsWithBarItems[0].event_id)
            .eq('is_active', true)
            .single();
          
          if (activeEvent) {
            eventId = activeEvent.id;
          }
        }

        // Final fallback: get any active event
        if (!eventId) {
          const { data: events } = await supabase
            .from('events')
            .select('id')
            .eq('is_active', true)
            .order('event_date', { ascending: false })
            .limit(1);

          if (events && events.length > 0) {
            eventId = events[0].id;
          }
        }
      }

      if (eventId) {
        setActiveEvent(eventId);
        await fetchMenuItems(eventId);
        await fetchOrders(eventId);
      }
    } catch (error: any) {
      toast({
        title: "Error loading data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMenuItems = async (eventId: string) => {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('event_id', eventId)
        .in('station_type', ['bar', 'mixologist'])
        .eq('is_available', true)
        .order('category', { ascending: true });

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading menu",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchOrders = async (eventId?: string) => {
    if (!user) return;

    const eid = eventId || activeEvent;
    if (!eid) return;

    try {
      // Fetch orders that have bar or mixologist items (exclude paid orders)
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items!inner (
            id,
            station_type,
            status,
            quantity,
            menu_items (
              name
            )
          ),
          profiles!orders_waiter_id_fkey (
            full_name
          )
        `)
        .eq('event_id', eid)
        .in('order_items.station_type', ['bar', 'mixologist'])
        .neq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      // Remove duplicates since an order might have multiple bar items
      const uniqueOrders = data?.reduce((acc: Order[], order: any) => {
        if (!acc.find(o => o.id === order.id)) {
          // Filter only bar/mixologist items
          const barItems = order.order_items
            .filter((item: any) => ['bar', 'mixologist'].includes(item.station_type))
            .map((item: any) => ({
              id: item.id,
              status: item.status,
              station_type: item.station_type,
              menu_item_name: item.menu_items?.name || 'Unknown',
              quantity: item.quantity,
            }));
          
          acc.push({
            id: order.id,
            order_number: order.order_number,
            table_number: order.table_number,
            guest_name: order.guest_name,
            total_amount: order.total_amount,
            status: order.status,
            created_at: order.created_at,
            waiter_name: order.profiles?.full_name || null,
            items: barItems,
          });
        }
        return acc;
      }, []) || [];
      
      setOrders(uniqueOrders);
    } catch (error: any) {
      toast({
        title: "Error loading orders",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => i.id !== itemId);
    });
  };

  const clearCart = () => {
    setCart([]);
    setGuestName("");
  };

  const getTotalAmount = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Add items before creating an order",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      if (!user || !tenantId) throw new Error("Not authenticated");

      // Generate order number
      const { data: orderNumber, error: orderNumError } = await supabase
        .rpc('generate_order_number', { _event_id: activeEvent });

      if (orderNumError) throw orderNumError;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          event_id: activeEvent,
          waiter_id: user.id,
          tenant_id: tenantId,
          table_number: 'BAR',
          guest_name: guestName || null,
          status: 'served',
          total_amount: getTotalAmount(),
          served_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cart.map(item => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        price: item.price,
        station_type: item.station_type as "drink_dispenser" | "meal_dispenser" | "mixologist" | "bar",
        tenant_id: tenantId,
        status: 'served' as "served",
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Order created",
        description: `Order ${orderNumber} ready for payment`,
      });

      clearCart();
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error creating order",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!paymentDialog) return;

    setProcessing(true);
    try {
      if (!user || !tenantId) throw new Error("Not authenticated");

      // Create payment
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id: paymentDialog.id,
          amount: paymentDialog.total_amount,
          payment_method: paymentMethod,
          tenant_id: tenantId,
          confirmed_by: user.id,
        });

      if (paymentError) throw paymentError;

      // Update order status
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', paymentDialog.id);

      if (orderError) throw orderError;

      toast({
        title: "Payment processed",
        description: `Order ${paymentDialog.order_number} completed`,
      });

      setPaymentDialog(null);
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

  const handleMarkItemReady = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation(); // Prevent opening payment dialog
    
    try {
      const { error } = await supabase
        .from('order_items')
        .update({ 
          status: 'ready',
          ready_at: new Date().toISOString(),
          assigned_to: user?.id
        })
        .eq('id', itemId);

      if (error) throw error;

      toast({
        title: "Item marked ready",
        description: "The order item has been marked as ready",
      });

      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error updating item",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/auth');
  };

  const groupedMenuItems = menuItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  if (loading || authLoading) {
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
            <h1 className="text-xl font-bold">Bar Station</h1>
            <p className="text-sm text-muted-foreground">
              {userName ? `${userName} • ` : ''}Quick service & payment
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 p-4">
        {/* Left Side - Menu & Cart */}
        <div className="space-y-4">
          {/* Guest Name */}
          <Card className="p-4">
            <Label>Guest Name (Optional)</Label>
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Customer name..."
              className="mt-2"
            />
          </Card>

          {/* Menu Items */}
          <Card className="p-4">
            <h2 className="font-semibold mb-3">Menu</h2>
            {Object.keys(groupedMenuItems).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No bar menu items available for this event
              </div>
            ) : (
              <Tabs defaultValue={Object.keys(groupedMenuItems)[0]} className="w-full">
                <TabsList className="w-full flex-wrap h-auto gap-1">
                  {Object.keys(groupedMenuItems).map(category => (
                    <TabsTrigger key={category} value={category} className="flex-1 min-w-fit">
                      {category}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {Object.entries(groupedMenuItems).map(([category, items]) => (
                  <TabsContent key={category} value={category} className="space-y-2 mt-4">
                    {items.map(item => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 border rounded-md hover:bg-accent/5 cursor-pointer"
                        onClick={() => addToCart(item)}
                      >
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatPrice(item.price)}
                          </div>
                        </div>
                        <Button size="sm">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </Card>

          {/* Cart */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Current Order</h2>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart}>
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Add items to start an order
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatPrice(item.price)} × {item.quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeFromCart(item.id)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-semibold">{item.quantity}</span>
                      <Button
                        size="sm"
                        onClick={() => addToCart(item)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="border-t border-border pt-3 mt-3">
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total:</span>
                    <span>{formatPrice(getTotalAmount())}</span>
                  </div>
                </div>

                <Button
                  className="w-full h-12"
                  onClick={handleCreateOrder}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Order'
                  )}
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Right Side - Pending Payments */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-3">Pending Payments</h2>
            <div className="space-y-3">
              {orders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pending payments
                </div>
              ) : (
                orders.map(order => {
                  const hasPendingItems = order.items?.some(item => item.status === 'pending' || item.status === 'dispatched');
                  
                  return (
                    <Card
                      key={order.id}
                      className={`p-3 transition-colors ${hasPendingItems ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:bg-accent/5'}`}
                      onClick={() => !hasPendingItems && setPaymentDialog(order)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-semibold">{order.order_number}</div>
                          <div className="text-sm text-muted-foreground">
                            {order.guest_name || (order.table_number === 'BAR' ? 'Walk-in' : order.waiter_name || 'Unknown')}
                          </div>
                        </div>
                        <Badge variant="secondary">{order.status}</Badge>
                      </div>
                      
                      {/* Show order items with mark ready buttons for pending items */}
                      {hasPendingItems && (
                        <div className="space-y-2 mb-3 pt-2 border-t border-border">
                          {order.items?.filter(item => item.status === 'pending' || item.status === 'dispatched').map(item => (
                            <div key={item.id} className="flex items-center justify-between gap-2">
                              <div className="flex-1 text-sm">
                                <span className="font-medium">{item.quantity}x</span>{' '}
                                <span>{item.menu_item_name}</span>
                                <Badge variant="outline" className="ml-2 text-xs">{item.status}</Badge>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                onClick={(e) => handleMarkItemReady(e, item.id)}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Ready
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleTimeString()}
                        </span>
                        <span className="text-lg font-bold">
                          {formatPrice(order.total_amount)}
                        </span>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-center py-4 border-y border-border">
              <div className="text-sm text-muted-foreground mb-1">
                {paymentDialog?.order_number}
              </div>
              <div className="text-3xl font-bold">
                {paymentDialog ? formatPrice(paymentDialog.total_amount) : ''}
              </div>
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
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialog(null)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button onClick={handleProcessPayment} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Confirm Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Bar;
