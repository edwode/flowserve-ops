import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, Bell, ChevronDown, ChevronUp, Clock, Package, RefreshCw, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CriticalAlert {
  id: string;
  type: 'urgent_order' | 'out_of_stock' | 'delayed_order' | 'return';
  title: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  metadata?: any;
}

interface CriticalAlertsProps {
  eventId: string;
  tenantId: string;
  zoneIds?: string[];
}

export const CriticalAlerts = ({ eventId, tenantId, zoneIds }: CriticalAlertsProps) => {
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const [tableNumbers, setTableNumbers] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Fetch tables in assigned zones
  useEffect(() => {
    const fetchZoneTables = async () => {
      if (!zoneIds || zoneIds.length === 0) {
        setTableNumbers([]);
        return;
      }

      const { data } = await supabase
        .from('tables')
        .select('table_number')
        .eq('event_id', eventId)
        .in('zone_id', zoneIds);

      setTableNumbers(data?.map(t => t.table_number) || []);
    };

    fetchZoneTables();
  }, [eventId, zoneIds]);

  useEffect(() => {
    checkForAlerts();

    // Poll for alerts every 30 seconds
    const interval = setInterval(checkForAlerts, 30000);

    // Subscribe to real-time changes
    const ordersChannel = supabase
      .channel('critical-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        () => checkForAlerts()
      )
      .subscribe();

    const menuChannel = supabase
      .channel('critical-menu')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'menu_items',
        },
        () => checkForAlerts()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(menuChannel);
    };
  }, [eventId, tenantId, tableNumbers]);

  const checkForAlerts = async () => {
    const newAlerts: CriticalAlert[] = [];

    // Check for delayed orders (>15 minutes in pending/dispatched)
    let delayedOrdersQuery = supabase
      .from('order_items')
      .select(`
        id,
        created_at,
        status,
        orders!inner(order_number, table_number, event_id)
      `)
      .eq('tenant_id', tenantId)
      .eq('orders.event_id', eventId)
      .in('status', ['pending', 'dispatched'])
      .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

    if (zoneIds && zoneIds.length > 0 && tableNumbers.length > 0) {
      delayedOrdersQuery = delayedOrdersQuery.in('orders.table_number', tableNumbers);
    } else if (zoneIds && zoneIds.length > 0 && tableNumbers.length === 0) {
      setAlerts([]);
      return;
    }

    const { data: delayedOrders } = await delayedOrdersQuery;

    if (delayedOrders && delayedOrders.length > 0) {
      delayedOrders.forEach((order: any) => {
        newAlerts.push({
          id: `delay-${order.id}`,
          type: 'delayed_order',
          title: 'Delayed Order',
          message: `Order ${order.orders.order_number} (Table ${order.orders.table_number}) has been pending for over 15 minutes`,
          severity: 'high',
          timestamp: order.created_at,
          metadata: order,
        });
      });
    }

    // Check for out of stock items
    let outOfStockQuery = supabase
      .from('menu_items')
      .select('id, name, category')
      .eq('tenant_id', tenantId)
      .eq('event_id', eventId)
      .eq('is_available', false);

    if (zoneIds && zoneIds.length > 0) {
      const { data: zoneAllocations } = await supabase
        .from('inventory_zone_allocations')
        .select('menu_item_id')
        .eq('event_id', eventId)
        .in('zone_id', zoneIds);

      const menuItemIds = zoneAllocations?.map(za => za.menu_item_id) || [];
      if (menuItemIds.length > 0) {
        outOfStockQuery = outOfStockQuery.in('id', menuItemIds);
      }
    }

    const { data: outOfStock } = await outOfStockQuery;

    if (outOfStock && outOfStock.length > 0) {
      outOfStock.forEach((item) => {
        newAlerts.push({
          id: `stock-${item.id}`,
          type: 'out_of_stock',
          title: 'Out of Stock',
          message: `${item.name} (${item.category}) is currently unavailable`,
          severity: 'medium',
          timestamp: new Date().toISOString(),
          metadata: item,
        });
      });
    }

    // Check for recent returns
    let returnsQuery = supabase
      .from('order_returns')
      .select(`
        id,
        reason,
        created_at,
        order_items!inner(
          menu_items(name),
          orders!inner(table_number, event_id)
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('order_items.orders.event_id', eventId)
      .is('confirmed_at', null)
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

    if (zoneIds && zoneIds.length > 0 && tableNumbers.length > 0) {
      returnsQuery = returnsQuery.in('order_items.orders.table_number', tableNumbers);
    } else if (zoneIds && zoneIds.length > 0 && tableNumbers.length === 0) {
      setAlerts(newAlerts);
      return;
    }

    const { data: returns } = await returnsQuery;

    if (returns && returns.length > 0) {
      returns.forEach((ret: any) => {
        newAlerts.push({
          id: `return-${ret.id}`,
          type: 'return',
          title: 'Unconfirmed Return',
          message: `${ret.order_items?.menu_items?.name || 'Item'} - ${ret.reason}`,
          severity: 'medium',
          timestamp: ret.created_at,
          metadata: ret,
        });
      });
    }

    // Filter out dismissed alerts, but only keep dismissals for alerts that still exist
    const newAlertIds = new Set(newAlerts.map(a => a.id));
    setDismissedIds(prev => {
      const validDismissed = new Set<string>();
      prev.forEach(id => {
        if (newAlertIds.has(id)) {
          validDismissed.add(id);
        }
      });
      return validDismissed;
    });

    setAlerts(newAlerts);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await checkForAlerts();
    setIsRefreshing(false);
  };

  const dismissAlert = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  };

  const dismissAll = () => {
    setDismissedIds(new Set(alerts.map(a => a.id)));
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'delayed_order':
        return <Clock className="w-4 h-4 shrink-0" />;
      case 'out_of_stock':
        return <Package className="w-4 h-4 shrink-0" />;
      case 'return':
        return <AlertTriangle className="w-4 h-4 shrink-0" />;
      default:
        return <AlertTriangle className="w-4 h-4 shrink-0" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'high') return 'bg-destructive/10 border-destructive/30 text-destructive';
    return 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400';
  };

  // Filter out dismissed alerts for display
  const visibleAlerts = alerts.filter(a => !dismissedIds.has(a.id));
  const highSeverityCount = visibleAlerts.filter(a => a.severity === 'high').length;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Bell className={`h-5 w-5 ${highSeverityCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                {visibleAlerts.length > 0 && (
                  <span className={`absolute -top-1 -right-1 h-4 w-4 rounded-full text-[10px] flex items-center justify-center text-white font-bold ${highSeverityCount > 0 ? 'bg-destructive animate-pulse' : 'bg-amber-500'}`}>
                    {visibleAlerts.length}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-sm">Critical Alerts</h3>
                <p className="text-xs text-muted-foreground">
                  {visibleAlerts.length === 0 
                    ? 'No active alerts' 
                    : `${visibleAlerts.length} active alert${visibleAlerts.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRefresh();
                }}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="border-t border-border">
            {visibleAlerts.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">All clear! No critical alerts.</p>
              </div>
            ) : (
              <>
                {visibleAlerts.length > 1 && (
                  <div className="px-4 py-2 border-b border-border bg-muted/30">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={dismissAll}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Dismiss All
                    </Button>
                  </div>
                )}
                <div className="max-h-[300px] overflow-y-auto">
                  <div className="divide-y divide-border">
                    {visibleAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-3 ${getSeverityColor(alert.severity)} border-l-4 animate-fade-in`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {getAlertIcon(alert.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{alert.title}</span>
                                {alert.severity === 'high' && (
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 animate-pulse">
                                    Urgent
                                  </Badge>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 shrink-0 hover:bg-background/50"
                                onClick={() => dismissAlert(alert.id)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <p className="text-xs mt-1 opacity-90 break-words">
                              {alert.message}
                            </p>
                            <span className="text-[10px] opacity-70 mt-1 block">
                              {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
