import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrderItem {
  id: string;
  quantity: number;
  notes: string | null;
  status: string;
  created_at: string;
  dispatched_at: string | null;
  order_id: string;
  menu_item_id: string;
  menu_items: {
    id: string;
    name: string;
    price: number;
  };
  orders: {
    order_number: string;
    table_number: string;
    guest_name: string | null;
    profiles: {
      full_name: string | null;
    };
  };
}

interface OrderReturn {
  id: string;
  reason: string;
  created_at: string;
  order_item_id: string;
  order_items: {
    quantity: number;
    menu_items: {
      name: string;
    };
    orders: {
      order_number: string;
      table_number: string;
    };
  };
}

const Station = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, tenantId, loading: authLoading } = useAuthGuard();
  const { formatPrice } = useTenantCurrency();
  const [loading, setLoading] = useState(true);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [returns, setReturns] = useState<OrderReturn[]>([]);
  const [stationType, setStationType] = useState<"drink_dispenser" | "meal_dispenser" | "mixologist" | "bar" | "">("");
  const [outOfStockItem, setOutOfStockItem] = useState<{ id: string; name: string } | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [userName, setUserName] = useState<string | null>(null);
  const [userZoneIds, setUserZoneIds] = useState<string[]>([]);
  const [userZoneNames, setUserZoneNames] = useState<string[]>([]);

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

  // Group order items by table name
  const groupedOrders = useMemo(() => {
    const groups: Record<string, OrderItem[]> = {};
    
    orderItems.forEach((item) => {
      const tableName = item.orders.table_number || 'No Table';
      if (!groups[tableName]) {
        groups[tableName] = [];
      }
      groups[tableName].push(item);
    });

    // Sort tables by the earliest order time within each group
    const sortedEntries = Object.entries(groups).sort((a, b) => {
      const earliestA = Math.min(...a[1].map(o => new Date(o.created_at).getTime()));
      const earliestB = Math.min(...b[1].map(o => new Date(o.created_at).getTime()));
      return earliestA - earliestB;
    });

    return sortedEntries;
  }, [orderItems]);

  // Auto-expand all table groups initially and when new tables appear
  useEffect(() => {
    const allTableNames = new Set(groupedOrders.map(([tableName]) => tableName));
    setExpandedTables((prev) => {
      const newSet = new Set(prev);
      allTableNames.forEach((name) => newSet.add(name));
      return newSet;
    });
  }, [groupedOrders]);

  const toggleTableExpanded = (tableName: string) => {
    setExpandedTables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tableName)) {
        newSet.delete(tableName);
      } else {
        newSet.add(tableName);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (!authLoading && user && tenantId) {
      fetchStationData();
    }
  }, [authLoading, user, tenantId]);

  // Set up real-time subscriptions only after we have zone info
  useEffect(() => {
    if (!stationType || userZoneIds.length === 0) return;
    
    const channel = supabase
      .channel('station-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items'
        },
        () => {
          fetchOrderItems();
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
  }, [stationType, userZoneIds]);

  const fetchStationData = async () => {
    if (!user || !tenantId) return;

    try {
      // Get user role to determine station type
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .single();

      if (!userRole) {
        navigate('/setup');
        return;
      }

      // Map role to station type
      const roleToStation: Record<string, "drink_dispenser" | "meal_dispenser" | "mixologist" | "bar"> = {
        'drink_dispenser': 'drink_dispenser',
        'meal_dispenser': 'meal_dispenser',
        'mixologist': 'mixologist',
        'bar_staff': 'bar',
      };

      const station = roleToStation[userRole.role as keyof typeof roleToStation];
      if (!station) {
        toast({
          title: "Invalid role",
          description: "Your role is not assigned to a station",
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      }

      // Fetch user's assigned zones from zone_role_assignments with zone names
      const { data: zoneAssignments } = await supabase
        .from('zone_role_assignments')
        .select('zone_id, zones(name)')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId);

      const zoneIds = zoneAssignments?.map(z => z.zone_id) || [];
      const zoneNames = zoneAssignments?.map(z => (z.zones as any)?.name).filter(Boolean) || [];
      setUserZoneIds(zoneIds);
      setUserZoneNames(zoneNames);

      setStationType(station);
      await fetchOrderItems(station, zoneIds);
      await fetchReturns(station, zoneIds);
    } catch (error: any) {
      toast({
        title: "Error loading station",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderItems = async (station?: "drink_dispenser" | "meal_dispenser" | "mixologist" | "bar", zoneIds?: string[]) => {
    const type = station || stationType;
    const zones = zoneIds || userZoneIds;
    if (!type) return;

    try {
      // If user has no zone assignments, show no orders
      if (zones.length === 0) {
        setOrderItems([]);
        return;
      }

      // First get table numbers in user's assigned zones
      const { data: tablesInZones } = await supabase
        .from('tables')
        .select('table_number, event_id')
        .in('zone_id', zones);

      if (!tablesInZones || tablesInZones.length === 0) {
        setOrderItems([]);
        return;
      }

      // Get unique table_number + event_id combinations
      const tableNumbers = [...new Set(tablesInZones.map(t => t.table_number))];

      const { data, error } = await supabase
        .from('order_items')
        .select(`
          id,
          quantity,
          notes,
          status,
          created_at,
          dispatched_at,
          order_id,
          menu_item_id,
          menu_items (id, name, price),
          orders (
            order_number,
            table_number,
            guest_name,
            event_id,
            profiles (full_name)
          )
        `)
        .eq('station_type', type)
        .in('status', ['pending', 'dispatched'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Filter order items to only those where order.table_number + event_id match tables in user's zones
      const filteredItems = (data || []).filter(item => {
        const order = item.orders as any;
        return tablesInZones.some(
          t => t.table_number === order.table_number && t.event_id === order.event_id
        );
      });

      setOrderItems(filteredItems);
    } catch (error: any) {
      toast({
        title: "Error loading orders",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchReturns = async (station?: "drink_dispenser" | "meal_dispenser" | "mixologist" | "bar", zoneIds?: string[]) => {
    const type = station || stationType;
    const zones = zoneIds || userZoneIds;
    if (!type) return;

    try {
      // If user has no zone assignments, show no returns
      if (zones.length === 0) {
        setReturns([]);
        return;
      }

      // First get table numbers in user's assigned zones
      const { data: tablesInZones } = await supabase
        .from('tables')
        .select('table_number, event_id')
        .in('zone_id', zones);

      if (!tablesInZones || tablesInZones.length === 0) {
        setReturns([]);
        return;
      }

      const { data, error } = await supabase
        .from('order_returns')
        .select(`
          id,
          reason,
          created_at,
          order_item_id,
          order_items!inner (
            station_type,
            quantity,
            menu_items (name),
            orders (order_number, table_number, event_id)
          )
        `)
        .eq('order_items.station_type', type)
        .is('confirmed_at', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Filter returns to only those where order.table_number + event_id match tables in user's zones
      const filteredReturns = (data || []).filter(returnItem => {
        const order = (returnItem.order_items as any).orders;
        return tablesInZones.some(
          t => t.table_number === order.table_number && t.event_id === order.event_id
        );
      });

      setReturns(filteredReturns);
    } catch (error: any) {
      toast({
        title: "Error loading returns",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleMarkReady = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('order_items')
        .update({
          status: 'ready',
          ready_at: new Date().toISOString(),
          assigned_to: user?.id,
        })
        .eq('id', itemId);

      if (error) throw error;

      toast({
        title: "Item marked ready",
        description: "Waiter has been notified",
      });

      fetchOrderItems();
    } catch (error: any) {
      toast({
        title: "Error updating status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleOutOfStock = async (menuItemId: string, menuItemName: string) => {
    setOutOfStockItem({ id: menuItemId, name: menuItemName });
  };

  const confirmOutOfStock = async () => {
    if (!outOfStockItem) return;

    try {
      // Mark menu item as unavailable
      const { error: menuError } = await supabase
        .from('menu_items')
        .update({ is_available: false })
        .eq('id', outOfStockItem.id);

      if (menuError) throw menuError;

      // Reject all pending order items for this menu item
      const { error: itemsError } = await supabase
        .from('order_items')
        .update({ status: 'rejected' })
        .eq('menu_item_id', outOfStockItem.id)
        .in('status', ['pending', 'dispatched']);

      if (itemsError) throw itemsError;

      toast({
        title: "Item marked out of stock",
        description: "All pending orders have been rejected",
      });

      setOutOfStockItem(null);
      fetchOrderItems();
    } catch (error: any) {
      toast({
        title: "Error marking out of stock",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleConfirmReturn = async (returnId: string, orderItemId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update the order_returns record
      const { error: returnError } = await supabase
        .from('order_returns')
        .update({
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.id,
        })
        .eq('id', returnId);

      if (returnError) throw returnError;

      // Update the order_item status to 'returned'
      const { error: itemError } = await supabase
        .from('order_items')
        .update({
          status: 'returned',
        })
        .eq('id', orderItemId);

      if (itemError) throw itemError;

      toast({
        title: "Return confirmed",
        description: "Item has been removed and cashier has been notified",
      });

      fetchReturns();
      fetchOrderItems();
    } catch (error: any) {
      toast({
        title: "Error confirming return",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/auth');
  };

  const getStationName = () => {
    const names: Record<string, string> = {
      'drink_dispenser': 'Drink Station',
      'meal_dispenser': 'Meal Station',
      'mixologist': 'Mixologist Station',
      'bar': 'Bar Station',
    };
    return names[stationType] || 'Station';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-pending text-pending-foreground';
      case 'dispatched':
        return 'bg-accent text-accent-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

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
            <h1 className="text-xl font-bold">{getStationName()}</h1>
            <p className="text-sm text-muted-foreground">
              {userName ? `${userName} • ` : ''}{userZoneNames.length > 0 ? `${userZoneNames.join(', ')} • ` : ''}{orderItems.length} pending orders
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

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Pending Returns */}
        {returns.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Returns to Confirm ({returns.length})
            </h2>
            {returns.map((returnItem) => (
              <Card key={returnItem.id} className="p-4 border-destructive/50">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">
                        {returnItem.order_items.orders.order_number}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Table {returnItem.order_items.orders.table_number}
                      </div>
                    </div>
                    <Badge variant="destructive">Return</Badge>
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">{returnItem.order_items.menu_items.name}</div>
                    <div className="text-muted-foreground">Qty: {returnItem.order_items.quantity}</div>
                    <div className="mt-2 text-destructive">Reason: {returnItem.reason}</div>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handleConfirmReturn(returnItem.id, returnItem.order_item_id)}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Confirm Return
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Order Items - Grouped by Table */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Active Orders</h2>
          
          {orderItems.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No pending orders</p>
            </Card>
          ) : (
            groupedOrders.map(([tableName, items]) => (
              <Collapsible
                key={tableName}
                open={expandedTables.has(tableName)}
                onOpenChange={() => toggleTableExpanded(tableName)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full p-4 flex items-center justify-between bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-3">
                        {expandedTables.has(tableName) ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className="font-semibold">Table {tableName}</span>
                        <Badge variant="secondary">{items.length} item{items.length !== 1 ? 's' : ''}</Badge>
                      </div>
                      {!expandedTables.has(tableName) && (
                        <Badge className="bg-pending text-pending-foreground">
                          {items.filter(i => i.status === 'pending').length} pending
                        </Badge>
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="divide-y divide-border">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="p-4 hover:bg-accent/5 transition-colors"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-semibold text-lg">
                                  {item.orders.order_number}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {item.orders.guest_name && `${item.orders.guest_name}`}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Waiter: {item.orders.profiles?.full_name || 'Unknown'}
                                </div>
                              </div>
                              <Badge className={getStatusColor(item.status)}>
                                {item.status}
                              </Badge>
                            </div>

                            <div className="border-t border-border pt-3">
                              <div className="font-medium">{item.menu_items.name}</div>
                              <div className="text-sm text-muted-foreground">
                                Quantity: {item.quantity} • {formatPrice(item.menu_items.price)} each
                              </div>
                              {item.notes && (
                                <div className="text-sm text-muted-foreground mt-1">
                                  Notes: {item.notes}
                                </div>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground">
                              Ordered: {new Date(item.created_at).toLocaleTimeString()}
                            </div>

                            <div className="flex gap-2">
                              <Button
                                className="flex-1"
                                onClick={() => handleMarkReady(item.id)}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Mark Ready
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleOutOfStock(item.menu_item_id, item.menu_items.name)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Out of Stock
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
        </div>
      </div>

      {/* Out of Stock Confirmation Dialog */}
      <AlertDialog open={!!outOfStockItem} onOpenChange={(open) => !open && setOutOfStockItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Item Out of Stock?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark "{outOfStockItem?.name}" as unavailable for the event and reject all pending orders for this item. Waiters will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmOutOfStock}>
              Confirm Out of Stock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Station;
