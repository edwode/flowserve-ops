import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, CheckCircle2, Truck, ChefHat } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface OrderItem {
  id: string;
  order_id: string;
  status: string;
  created_at: string;
  dispatched_at: string | null;
  ready_at: string | null;
  menu_items: {
    name: string;
    station_type: string;
  };
  orders: {
    order_number: string;
    table_number: string | null;
    guest_name: string | null;
  };
}

interface LiveOrderTrackingProps {
  eventId: string;
  tenantId: string;
  zoneIds?: string[];
}

export const LiveOrderTracking = ({ eventId, tenantId, zoneIds }: LiveOrderTrackingProps) => {
  const [activeOrders, setActiveOrders] = useState<OrderItem[]>([]);
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
    fetchActiveOrders();

    const channel = supabase
      .channel('live-order-tracking')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        () => {
          fetchActiveOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, tenantId, tableNumbers]);

  const fetchActiveOrders = async () => {
    let query = supabase
      .from('order_items')
      .select(`
        id,
        order_id,
        status,
        created_at,
        dispatched_at,
        ready_at,
        menu_items!inner(name, station_type),
        orders!inner(order_number, table_number, guest_name, event_id)
      `)
      .eq('tenant_id', tenantId)
      .eq('orders.event_id', eventId)
      .in('status', ['pending', 'dispatched'])
      .order('created_at', { ascending: false })
      .limit(20);

    // If zone filtering is enabled and we have table numbers
    if (zoneIds && zoneIds.length > 0 && tableNumbers.length > 0) {
      query = query.in('orders.table_number', tableNumbers);
    } else if (zoneIds && zoneIds.length > 0 && tableNumbers.length === 0) {
      // No tables in assigned zones, show empty
      setActiveOrders([]);
      return;
    }

    const { data } = await query;

    if (data) {
      setActiveOrders(data as any);
    }
  };

  const getStatusProgress = (status: string) => {
    switch (status) {
      case 'pending':
        return 25;
      case 'dispatched':
        return 75;
      case 'ready':
        return 100;
      default:
        return 0;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'dispatched':
        return <ChefHat className="w-4 h-4" />;
      case 'ready':
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <Truck className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500';
      case 'dispatched':
        return 'bg-blue-500';
      case 'ready':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getTimeSinceCreation = (createdAt: string) => {
    const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (minutes > 15) return 'text-destructive';
    if (minutes > 10) return 'text-orange-500';
    return 'text-muted-foreground';
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {activeOrders.map((order) => (
          <Card
            key={order.id}
            className="p-4 border-l-4 transition-all duration-300 animate-fade-in hover:shadow-lg"
            style={{
              borderLeftColor: order.status === 'pending' ? '#eab308' : '#3b82f6',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {order.orders.order_number}
                  </Badge>
                  {order.orders.table_number && (
                    <Badge variant="secondary">
                      Table {order.orders.table_number}
                    </Badge>
                  )}
                  {order.orders.guest_name && (
                    <span className="text-sm text-muted-foreground">
                      {order.orders.guest_name}
                    </span>
                  )}
                </div>

                <p className="font-semibold">{order.menu_items.name}</p>

                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={`${getStatusColor(order.status)} text-white`}
                  >
                    <div className="flex items-center gap-1">
                      {getStatusIcon(order.status)}
                      <span className="capitalize">{order.status}</span>
                    </div>
                  </Badge>
                  <span className={`text-xs ${getTimeSinceCreation(order.created_at)}`}>
                    {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                  </span>
                </div>

                <Progress
                  value={getStatusProgress(order.status)}
                  className="h-1.5 animate-scale-in"
                />
              </div>

              <div className="text-right space-y-1">
                <Badge variant="outline" className="text-xs">
                  {order.menu_items.station_type.replace('_', ' ')}
                </Badge>
              </div>
            </div>
          </Card>
        ))}

        {activeOrders.length === 0 && (
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-2" />
            <p className="text-muted-foreground">All orders completed</p>
          </Card>
        )}
      </div>
    </div>
  );
};
