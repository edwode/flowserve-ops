import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, LogOut, ChevronDown, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineStorage } from "@/lib/offlineStorage";
import { offlineQueue } from "@/lib/offlineQueue";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Order {
  id: string;
  order_number: string;
  table_number: string;
  guest_name: string;
  status: string;
  total_amount: number;
  created_at: string;
}

const STATUS_PRIORITY: Record<string, number> = {
  pending: 1,
  dispatched: 2,
  ready: 3,
  served: 4,
  paid: 5,
  rejected: 6,
  returned: 7,
};

const Waiter = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOnline } = useOnlineStatus();
  const { user, loading: authLoading } = useAuthGuard();
  const { formatPrice } = useTenantCurrency();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingCache, setUsingCache] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
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

  // Group orders by table and sort by status priority
  const groupedOrders = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    
    orders.forEach((order) => {
      const tableKey = order.table_number || 'No Table';
      if (!groups[tableKey]) {
        groups[tableKey] = [];
      }
      groups[tableKey].push(order);
    });

    // Sort orders within each group by status priority
    Object.keys(groups).forEach((tableKey) => {
      groups[tableKey].sort((a, b) => {
        const priorityA = STATUS_PRIORITY[a.status] || 99;
        const priorityB = STATUS_PRIORITY[b.status] || 99;
        return priorityA - priorityB;
      });
    });

    // Sort table groups by the highest priority order in each group
    const sortedTableKeys = Object.keys(groups).sort((a, b) => {
      const highestPriorityA = Math.min(...groups[a].map(o => STATUS_PRIORITY[o.status] || 99));
      const highestPriorityB = Math.min(...groups[b].map(o => STATUS_PRIORITY[o.status] || 99));
      return highestPriorityA - highestPriorityB;
    });

    return { groups, sortedTableKeys };
  }, [orders]);

  // Initialize all tables as expanded - add any new tables that appear
  useEffect(() => {
    if (groupedOrders.sortedTableKeys.length > 0) {
      setExpandedTables((prev) => {
        const next = new Set(prev);
        groupedOrders.sortedTableKeys.forEach((key) => {
          if (!prev.has(key)) {
            next.add(key);
          }
        });
        // If this is the first load (no tables were expanded), expand all
        if (prev.size === 0) {
          return new Set(groupedOrders.sortedTableKeys);
        }
        return next;
      });
    }
  }, [groupedOrders.sortedTableKeys]);

  const toggleTable = (tableKey: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableKey)) {
        next.delete(tableKey);
      } else {
        next.add(tableKey);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchOrders();
    }
    
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
  }, [isOnline, authLoading, user]);

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
        return 'bg-served text-served-foreground';
      case 'paid':
        return 'bg-paid text-paid-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/auth');
  };

  console.log('[Waiter] Render state:', { loading, authLoading, user: user?.id });

  if (loading || authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--background))' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ minHeight: '-webkit-fill-available', backgroundColor: 'hsl(var(--background))' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-bold">Waiter Station</h1>
            <p className="text-sm text-muted-foreground">
              {userName ? `Welcome, ${userName}` : 'Manage your orders'}
            </p>
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
            <div className="space-y-3">
              {groupedOrders.sortedTableKeys.map((tableKey) => {
                const tableOrders = groupedOrders.groups[tableKey];
                const isExpanded = expandedTables.has(tableKey);
                const pendingCount = tableOrders.filter(o => o.status === 'pending').length;

                return (
                  <Collapsible
                    key={tableKey}
                    open={isExpanded}
                    onOpenChange={() => toggleTable(tableKey)}
                  >
                    <Card className="overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <button className="w-full p-3 flex items-center justify-between bg-muted/50 hover:bg-muted transition-colors text-left">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                            <span className="font-semibold">Table {tableKey}</span>
                            <Badge variant="secondary" className="text-xs">
                              {tableOrders.length} order{tableOrders.length !== 1 ? 's' : ''}
                            </Badge>
                            {pendingCount > 0 && (
                              <Badge className="bg-pending text-pending-foreground text-xs">
                                {pendingCount} pending
                              </Badge>
                            )}
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="divide-y divide-border">
                          {tableOrders.map((order) => (
                            <div
                              key={order.id}
                              className="p-4 cursor-pointer hover:bg-accent/5 transition-colors"
                              onClick={() => navigate(`/waiter/order/${order.id}`)}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <div className="font-semibold">{order.order_number}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {order.guest_name}
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
                                  {formatPrice(order.total_amount)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Waiter;
