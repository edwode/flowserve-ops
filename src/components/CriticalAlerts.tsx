import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Package, X } from "lucide-react";
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
    // Filter by tables in assigned zones if zoneIds provided
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

    // If zone filtering is enabled and we have table numbers
    if (zoneIds && zoneIds.length > 0 && tableNumbers.length > 0) {
      delayedOrdersQuery = delayedOrdersQuery.in('orders.table_number', tableNumbers);
    } else if (zoneIds && zoneIds.length > 0 && tableNumbers.length === 0) {
      // No tables in assigned zones, skip delayed order check
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

    // If zone filtering, get menu items allocated to those zones
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

    // Check for recent returns - filter by tables in assigned zones
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
      // No tables in assigned zones, no returns to show
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

    setAlerts(newAlerts);
  };

  const dismissAlert = (id: string) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'delayed_order':
        return <Clock className="w-5 h-5" />;
      case 'out_of_stock':
        return <Package className="w-5 h-5" />;
      case 'return':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getAlertVariant = (severity: string) => {
    if (severity === 'high') return 'destructive';
    return 'default';
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md space-y-2 animate-slide-in-right">
      {alerts.slice(0, 5).map((alert) => (
        <Alert
          key={alert.id}
          variant={getAlertVariant(alert.severity)}
          className="shadow-xl border-2 animate-fade-in backdrop-blur-sm bg-background/95"
        >
          <div className="flex items-start gap-3">
            {getAlertIcon(alert.type)}
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <AlertTitle className="text-sm font-bold">{alert.title}</AlertTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => dismissAlert(alert.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <AlertDescription className="text-xs">
                {alert.message}
              </AlertDescription>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                </Badge>
                {alert.severity === 'high' && (
                  <Badge variant="destructive" className="text-xs animate-pulse">
                    Urgent
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Alert>
      ))}
      {alerts.length > 5 && (
        <p className="text-xs text-center text-muted-foreground">
          +{alerts.length - 5} more alerts
        </p>
      )}
    </div>
  );
};
