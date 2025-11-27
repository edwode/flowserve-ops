import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineStorage } from "@/lib/offlineStorage";
import { offlineQueue } from "@/lib/offlineQueue";

interface Order {
  id: string;
  order_number: string;
  table_number: string;
  guest_name: string;
  status: string;
  total_amount: number;
  created_at: string;
}

const Waiter = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOnline } = useOnlineStatus();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingCache, setUsingCache] = useState(false);

  useEffect(() => {
    fetchOrders();
    
    // Subscribe to realtime updates only when online
    let channel: any = null;
    if (isOnline) {
      channel = supabase
        .channel('waiter-orders')
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
        .subscribe();
    }

    // Listen for sync requests
    const handleProcessRequest = (event: CustomEvent) => {
      const { request, resolve } = event.detail;
      processQueuedRequest(request).then(resolve);
    };

    window.addEventListener('process-queued-request', handleProcessRequest as EventListener);

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      window.removeEventListener('process-queued-request', handleProcessRequest as EventListener);
    };
  }, [isOnline]);

  const fetchOrders = async () => {
    try {
      // Try to load from cache first if offline
      if (!isOnline) {
        const cachedOrders = OfflineStorage.getOrders();
        if (cachedOrders) {
          setOrders(cachedOrders);
          setUsingCache(true);
          setLoading(false);
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('waiter_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      const ordersData = data || [];
      setOrders(ordersData);
      setUsingCache(false);
      
      // Cache the orders for offline use
      OfflineStorage.saveOrders(ordersData);
    } catch (error: any) {
      // If online request fails, try cache
      const cachedOrders = OfflineStorage.getOrders();
      if (cachedOrders) {
        setOrders(cachedOrders);
        setUsingCache(true);
        toast({
          title: "Using cached data",
          description: "Showing previously loaded orders",
        });
      } else {
        toast({
          title: "Error fetching orders",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const processQueuedRequest = async (request: any): Promise<boolean> => {
    try {
      if (request.type === 'order') {
        // Process order creation
        const { error } = await supabase
          .from('orders')
          .insert(request.data);
        
        if (error) throw error;
        
        // Refresh orders
        await fetchOrders();
        return true;
      } else if (request.type === 'update') {
        // Process order update
        const { error } = await supabase
          .from('orders')
          .update(request.data.updates)
          .eq('id', request.data.id);
        
        if (error) throw error;
        
        // Refresh orders
        await fetchOrders();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to process queued request:', error);
      return false;
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
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
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
            <h1 className="text-xl font-bold">Waiter Station</h1>
            <p className="text-sm text-muted-foreground">Manage your orders</p>
          </div>
          <div className="flex items-center gap-2">
            <OfflineIndicator />
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Create Order Button */}
        <Button
          size="lg"
          className="w-full h-16 text-lg gap-2"
          onClick={() => navigate('/waiter/new-order')}
        >
          <Plus className="h-6 w-6" />
          Create New Order
        </Button>

        {/* Orders List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Orders</h2>
            {usingCache && (
              <Badge variant="outline" className="text-xs">
                Cached Data
              </Badge>
            )}
          </div>
          
          {orders.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No orders yet. Create your first order!</p>
            </Card>
          ) : (
            orders.map((order) => (
              <Card
                key={order.id}
                className="p-4 cursor-pointer hover:bg-accent/5 transition-colors"
                onClick={() => navigate(`/waiter/order/${order.id}`)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-lg">{order.order_number}</div>
                    <div className="text-sm text-muted-foreground">
                      Table {order.table_number} • {order.guest_name}
                    </div>
                  </div>
                  <Badge className={getStatusColor(order.status)}>
                    {order.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {new Date(order.created_at).toLocaleTimeString()}
                  </span>
                  <span className="font-semibold">
                    ${order.total_amount.toFixed(2)}
                  </span>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Waiter;
