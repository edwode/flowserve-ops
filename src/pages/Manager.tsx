import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, TrendingUp, AlertTriangle, Clock, DollarSign, Activity, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FloorMap } from "@/components/FloorMap";
import { CriticalAlerts } from "@/components/CriticalAlerts";
import { LiveOrderTracking } from "@/components/LiveOrderTracking";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface Event {
  id: string;
  name: string;
  event_date: string;
}

interface Zone {
  id: string;
  name: string;
}

interface OrderStats {
  pending: number;
  dispatched: number;
  ready: number;
  served: number;
  paid: number;
}

interface StationStats {
  station_type: string;
  pending: number;
  dispatched: number;
  ready: number;
  avg_time_minutes: number;
}

interface OutOfStockItem {
  id: string;
  name: string;
  category: string;
  station_type: string;
}

interface PerformanceMetrics {
  avgOrderToReady: number;
  avgOrderToServed: number;
  avgOrderToPaid: number;
  totalOrders: number;
  totalRevenue: number;
}

const Manager = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, tenantId, loading: authLoading } = useAuthGuard();
  const { formatPrice } = useTenantCurrency();
  const [loading, setLoading] = useState(true);
  const [assignedEvent, setAssignedEvent] = useState<Event | null>(null);
  const [assignedZones, setAssignedZones] = useState<Zone[]>([]);
  const [userName, setUserName] = useState<string | null>(null);

  // Fetch user profile and assigned event/zones
  useEffect(() => {
    const fetchUserAssignments = async () => {
      if (!user || !tenantId) return;

      try {
        // Fetch profile with assigned event
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, event_id')
          .eq('id', user.id)
          .single();

        if (profile?.full_name) setUserName(profile.full_name);

        // Fetch assigned zones from zone_role_assignments
        const { data: zoneAssignments } = await supabase
          .from('zone_role_assignments')
          .select('zone_id, zones(id, name)')
          .eq('user_id', user.id)
          .eq('role', 'event_manager');

        if (zoneAssignments && zoneAssignments.length > 0) {
          const zones = zoneAssignments
            .map((za: any) => za.zones)
            .filter(Boolean) as Zone[];
          setAssignedZones(zones);
        }

        // Fetch assigned event details
        if (profile?.event_id) {
          const { data: eventData } = await supabase
            .from('events')
            .select('id, name, event_date')
            .eq('id', profile.event_id)
            .single();

          if (eventData) {
            setAssignedEvent(eventData);
          }
        }
      } catch (error: any) {
        console.error("Error fetching user assignments:", error);
        toast({
          title: "Error loading assignments",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading && user && tenantId) {
      fetchUserAssignments();
    }
  }, [authLoading, user, tenantId]);

  const [orderStats, setOrderStats] = useState<OrderStats>({
    pending: 0,
    dispatched: 0,
    ready: 0,
    served: 0,
    paid: 0,
  });
  const [stationStats, setStationStats] = useState<StationStats[]>([]);
  const [outOfStock, setOutOfStock] = useState<OutOfStockItem[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    avgOrderToReady: 0,
    avgOrderToServed: 0,
    avgOrderToPaid: 0,
    totalOrders: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    if (assignedEvent && assignedZones.length > 0) {
      fetchDashboardData();
      
      // Set up real-time subscriptions
      const channel = supabase
        .channel('manager-dashboard')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders'
          },
          () => {
            fetchDashboardData();
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
            fetchDashboardData();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'menu_items'
          },
          () => {
            fetchOutOfStock();
          }
        )
        .subscribe();

      // Refresh data every 30 seconds
      const interval = setInterval(() => {
        fetchDashboardData();
      }, 30000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
      };
    }
  }, [assignedEvent, assignedZones]);

  const zoneIds = assignedZones.map(z => z.id);

  const fetchDashboardData = async () => {
    await Promise.all([
      fetchOrderStats(),
      fetchStationStats(),
      fetchOutOfStock(),
      fetchMetrics(),
    ]);
  };

  const fetchOrderStats = async () => {
    if (!assignedEvent || zoneIds.length === 0) return;
    
    try {
      // Get tables in assigned zones first
      const { data: zoneTables } = await supabase
        .from('tables')
        .select('table_number')
        .eq('event_id', assignedEvent.id)
        .in('zone_id', zoneIds);

      const tableNumbers = zoneTables?.map(t => t.table_number) || [];
      
      if (tableNumbers.length === 0) {
        setOrderStats({ pending: 0, dispatched: 0, ready: 0, served: 0, paid: 0 });
        return;
      }

      const { data, error } = await supabase
        .from('orders')
        .select('status')
        .eq('event_id', assignedEvent.id)
        .in('table_number', tableNumbers);

      if (error) throw error;

      const stats: OrderStats = {
        pending: 0,
        dispatched: 0,
        ready: 0,
        served: 0,
        paid: 0,
      };

      data?.forEach((order) => {
        if (stats.hasOwnProperty(order.status)) {
          stats[order.status as keyof OrderStats]++;
        }
      });

      setOrderStats(stats);
    } catch (error: any) {
      console.error("Error fetching order stats:", error);
    }
  };

  const fetchStationStats = async () => {
    if (!assignedEvent || zoneIds.length === 0) return;
    
    try {
      // Get tables in assigned zones first
      const { data: zoneTables } = await supabase
        .from('tables')
        .select('table_number')
        .eq('event_id', assignedEvent.id)
        .in('zone_id', zoneIds);

      const tableNumbers = zoneTables?.map(t => t.table_number) || [];
      
      if (tableNumbers.length === 0) {
        setStationStats([]);
        return;
      }

      const { data, error } = await supabase
        .from('order_items')
        .select(`
          station_type,
          status,
          created_at,
          ready_at,
          orders!inner (event_id, table_number)
        `)
        .eq('orders.event_id', assignedEvent.id)
        .in('orders.table_number', tableNumbers);

      if (error) throw error;

      // Group by station
      const stationMap: Record<string, {
        pending: number;
        dispatched: number;
        ready: number;
        times: number[];
      }> = {};

      data?.forEach((item: any) => {
        const station = item.station_type;
        if (!stationMap[station]) {
          stationMap[station] = { pending: 0, dispatched: 0, ready: 0, times: [] };
        }

        if (item.status === 'pending') stationMap[station].pending++;
        if (item.status === 'dispatched') stationMap[station].dispatched++;
        if (item.status === 'ready') stationMap[station].ready++;

        // Calculate time if ready
        if (item.ready_at && item.created_at) {
          const timeMs = new Date(item.ready_at).getTime() - new Date(item.created_at).getTime();
          stationMap[station].times.push(timeMs / 1000 / 60); // Convert to minutes
        }
      });

      const stats: StationStats[] = Object.entries(stationMap).map(([station, data]) => ({
        station_type: station,
        pending: data.pending,
        dispatched: data.dispatched,
        ready: data.ready,
        avg_time_minutes: data.times.length > 0
          ? data.times.reduce((a, b) => a + b, 0) / data.times.length
          : 0,
      }));

      setStationStats(stats);
    } catch (error: any) {
      console.error("Error fetching station stats:", error);
    }
  };

  const fetchOutOfStock = async () => {
    if (!assignedEvent || zoneIds.length === 0) return;
    
    try {
      // Get menu items for the event that are allocated to assigned zones
      const { data: zoneAllocations } = await supabase
        .from('inventory_zone_allocations')
        .select('menu_item_id')
        .eq('event_id', assignedEvent.id)
        .in('zone_id', zoneIds);

      const menuItemIds = zoneAllocations?.map(za => za.menu_item_id) || [];

      // If no zone allocations, fall back to event-level menu items
      let query = supabase
        .from('menu_items')
        .select('id, name, category, station_type')
        .eq('event_id', assignedEvent.id)
        .eq('is_available', false);

      if (menuItemIds.length > 0) {
        query = query.in('id', menuItemIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      setOutOfStock(data || []);
    } catch (error: any) {
      console.error("Error fetching out of stock:", error);
    }
  };

  const fetchMetrics = async () => {
    if (!assignedEvent || zoneIds.length === 0) return;
    
    try {
      // Get tables in assigned zones first
      const { data: zoneTables } = await supabase
        .from('tables')
        .select('table_number')
        .eq('event_id', assignedEvent.id)
        .in('zone_id', zoneIds);

      const tableNumbers = zoneTables?.map(t => t.table_number) || [];
      
      if (tableNumbers.length === 0) {
        setMetrics({
          avgOrderToReady: 0,
          avgOrderToServed: 0,
          avgOrderToPaid: 0,
          totalOrders: 0,
          totalRevenue: 0,
        });
        return;
      }

      const { data, error } = await supabase
        .from('orders')
        .select('created_at, ready_at, served_at, paid_at, total_amount')
        .eq('event_id', assignedEvent.id)
        .in('table_number', tableNumbers);

      if (error) throw error;

      const readyTimes: number[] = [];
      const servedTimes: number[] = [];
      const paidTimes: number[] = [];
      let totalRevenue = 0;

      data?.forEach((order) => {
        if (order.ready_at && order.created_at) {
          const time = (new Date(order.ready_at).getTime() - new Date(order.created_at).getTime()) / 1000 / 60;
          readyTimes.push(time);
        }
        if (order.served_at && order.created_at) {
          const time = (new Date(order.served_at).getTime() - new Date(order.created_at).getTime()) / 1000 / 60;
          servedTimes.push(time);
        }
        if (order.paid_at && order.created_at) {
          const time = (new Date(order.paid_at).getTime() - new Date(order.created_at).getTime()) / 1000 / 60;
          paidTimes.push(time);
        }
        if (order.total_amount) {
          totalRevenue += order.total_amount;
        }
      });

      setMetrics({
        avgOrderToReady: readyTimes.length > 0 ? readyTimes.reduce((a, b) => a + b, 0) / readyTimes.length : 0,
        avgOrderToServed: servedTimes.length > 0 ? servedTimes.reduce((a, b) => a + b, 0) / servedTimes.length : 0,
        avgOrderToPaid: paidTimes.length > 0 ? paidTimes.reduce((a, b) => a + b, 0) / paidTimes.length : 0,
        totalOrders: data?.length || 0,
        totalRevenue,
      });
    } catch (error: any) {
      console.error("Error fetching metrics:", error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/auth');
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

  const getBottleneckLevel = (pending: number, dispatched: number) => {
    const total = pending + dispatched;
    if (total > 10) return 'high';
    if (total > 5) return 'medium';
    return 'low';
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show message if no event or zones assigned
  if (!assignedEvent || assignedZones.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold mb-2">No Assignments Found</h1>
        <p className="text-muted-foreground text-center mb-4">
          You have not been assigned to an event or zones yet. Please contact your admin.
        </p>
        <Button onClick={handleSignOut} variant="outline">
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    );
  }

  const totalActive = orderStats.pending + orderStats.dispatched + orderStats.ready + orderStats.served;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary animate-pulse" />
            <div className="flex-1">
              <h1 className="text-xl font-bold">
                {userName ? `${userName}'s Dashboard` : 'Real-Time Dashboard'}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="font-medium">
                  {assignedEvent.name}
                </Badge>
                {assignedZones.map(zone => (
                  <Badge key={zone.id} variant="secondary" className="text-xs">
                    {zone.name}
                  </Badge>
                ))}
                <Badge variant="secondary" className="text-xs animate-pulse">
                  Live
                </Badge>
              </div>
            </div>
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
        {/* Tabs Navigation */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="live-orders">Live Orders</TabsTrigger>
            <TabsTrigger value="floor-map">Floor Map</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-4">
        {/* Critical Alerts Card */}
        {assignedEvent && tenantId && (
          <CriticalAlerts 
            eventId={assignedEvent.id} 
            tenantId={tenantId} 
            zoneIds={zoneIds}
          />
        )}

        {/* Performance Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 transition-all duration-300 hover:shadow-lg animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="h-4 w-4" />
              Total Orders
            </div>
            <div className="text-2xl font-bold">{metrics.totalOrders}</div>
          </Card>

          <Card className="p-4 transition-all duration-300 hover:shadow-lg animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="h-4 w-4" />
              Revenue
            </div>
            <div className="text-2xl font-bold">{formatPrice(metrics.totalRevenue)}</div>
          </Card>

          <Card className="p-4 transition-all duration-300 hover:shadow-lg animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="h-4 w-4" />
              Avg to Ready
            </div>
            <div className="text-2xl font-bold">{metrics.avgOrderToReady.toFixed(1)}m</div>
          </Card>

          <Card className="p-4 transition-all duration-300 hover:shadow-lg animate-fade-in" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="h-4 w-4" />
              Avg to Paid
            </div>
            <div className="text-2xl font-bold">{metrics.avgOrderToPaid.toFixed(1)}m</div>
          </Card>
        </div>

        {/* Order Status Overview */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Order Status Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-pending">{orderStats.pending}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">{orderStats.dispatched}</div>
              <div className="text-sm text-muted-foreground">Dispatched</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-success">{orderStats.ready}</div>
              <div className="text-sm text-muted-foreground">Ready</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{orderStats.served}</div>
              <div className="text-sm text-muted-foreground">Served</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-muted-foreground">{orderStats.paid}</div>
              <div className="text-sm text-muted-foreground">Paid</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Active Orders</span>
              <span className="font-semibold">{totalActive} / {metrics.totalOrders}</span>
            </div>
            <Progress value={(totalActive / metrics.totalOrders) * 100} className="transition-all duration-500" />
          </div>
        </Card>

        {/* Station Bottlenecks */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Station Performance</h2>
          <div className="space-y-3">
            {stationStats.map((station) => {
              const bottleneck = getBottleneckLevel(station.pending, station.dispatched);
              const total = station.pending + station.dispatched;
              
              return (
                <div key={station.station_type} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{getStationName(station.station_type)}</span>
                      {bottleneck === 'high' && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Bottleneck
                        </Badge>
                      )}
                      {bottleneck === 'medium' && (
                        <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-700">
                          Busy
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Avg: {station.avg_time_minutes.toFixed(1)}m
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Pending:</span>
                      <span className="ml-1 font-semibold text-pending">{station.pending}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Working:</span>
                      <span className="ml-1 font-semibold text-accent">{station.dispatched}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Ready:</span>
                      <span className="ml-1 font-semibold text-success">{station.ready}</span>
                    </div>
                  </div>
                  <Progress 
                    value={total > 0 ? ((station.dispatched + station.ready) / total) * 100 : 0} 
                    className="mt-2 transition-all duration-500"
                  />
                </div>
              );
            })}
            
            {stationStats.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                No station activity yet
              </div>
            )}
          </div>
        </Card>

        {/* Out of Stock Alerts */}
        {outOfStock.length > 0 && (
          <Card className="p-4 border-destructive/50 animate-fade-in">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 animate-pulse" />
              Out of Stock Items ({outOfStock.length})
            </h2>
            <div className="space-y-2">
              {outOfStock.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 bg-destructive/10 rounded-md animate-fade-in"
                >
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.category} • {getStationName(item.station_type)}
                    </div>
                  </div>
                  <Badge variant="destructive">Unavailable</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
        </TabsContent>

        {/* Live Orders Tab */}
        <TabsContent value="live-orders" className="mt-4">
          {assignedEvent && tenantId && (
            <LiveOrderTracking 
              eventId={assignedEvent.id} 
              tenantId={tenantId} 
              zoneIds={zoneIds}
            />
          )}
        </TabsContent>

        {/* Floor Map Tab */}
        <TabsContent value="floor-map" className="mt-4">
          {assignedEvent && tenantId && (
            <Card className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Staff Location Tracking
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Real-time positions of active staff members in your zones
                </p>
              </div>
              <FloorMap eventId={assignedEvent.id} tenantId={tenantId} />
            </Card>
          )}
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Manager;
