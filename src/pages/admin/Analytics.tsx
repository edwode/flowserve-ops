import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Users,
  Clock,
  DollarSign,
  Target,
  Award,
  AlertTriangle,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82ca9d"];

interface RevenueLossData {
  totalLoss: number;
  confirmedLoss: number;
  unconfirmedLoss: number;
  byCategory: { category: string; amount: number }[];
  byReason: { reason: string; count: number; amount: number }[];
  byDate: { date: string; amount: number; count: number }[];
}

interface EventOption {
  id: string;
  name: string;
}

export default function Analytics() {
  const { toast } = useToast();
  const { formatPrice } = useTenantCurrency();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("7");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("all");

  const [peakHours, setPeakHours] = useState<any[]>([]);
  const [popularItems, setPopularItems] = useState<any[]>([]);
  const [stationEfficiency, setStationEfficiency] = useState<any[]>([]);
  const [waiterPerformance, setWaiterPerformance] = useState<any[]>([]);
  const [revenueTrends, setRevenueTrends] = useState<any[]>([]);
  const [categoryPerformance, setCategoryPerformance] = useState<any[]>([]);
  const [revenueLossData, setRevenueLossData] = useState<RevenueLossData>({
    totalLoss: 0,
    confirmedLoss: 0,
    unconfirmedLoss: 0,
    byCategory: [],
    byReason: [],
    byDate: [],
  });

  useEffect(() => {
    fetchTenantId();
  }, []);

  useEffect(() => {
    if (tenantId) {
      fetchEventsInRange();
    }
  }, [tenantId, dateRange]);

  useEffect(() => {
    if (tenantId) {
      fetchAllAnalytics();
    }
  }, [tenantId, dateRange, selectedEventId]);

  const fetchEventsInRange = async () => {
    const { start, end } = getDateRange();
    const { data, error } = await supabase
      .from("events")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .gte("event_date", start)
      .lte("event_date", end)
      .order("event_date", { ascending: false });

    if (!error && data) {
      setEvents(data);
      // Reset to "all" if current selection is not in the new list
      if (selectedEventId !== "all" && !data.find(e => e.id === selectedEventId)) {
        setSelectedEventId("all");
      }
    }
  };

  const fetchTenantId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (profile) {
      setTenantId(profile.tenant_id);
    }
  };

  const getDateRange = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(dateRange));
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
  };

  const fetchAllAnalytics = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      await Promise.all([
        fetchPeakHours(start, end),
        fetchPopularItems(start, end),
        fetchStationEfficiency(start, end),
        fetchWaiterPerformance(start, end),
        fetchRevenueTrends(start, end),
        fetchCategoryPerformance(start, end),
        fetchRevenueLoss(start, end),
      ]);
    } catch (error: any) {
      toast({
        title: "Error loading analytics",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRevenueLoss = async (start: string, end: string) => {
    // Fetch returns with order items and menu items for category info
    let query = supabase
      .from("order_returns")
      .select(`
        id,
        reason,
        refund_amount,
        created_at,
        order_items (
          price,
          quantity,
          order_id,
          menu_items (
            category
          )
        )
      `)
      .eq("tenant_id", tenantId)
      .gte("created_at", start)
      .lte("created_at", end);

    const { data: returns, error } = await query;

    if (error || !returns) return;

    // If event filter is applied, get order IDs for that event
    let eventOrderIds: Set<string> | null = null;
    if (selectedEventId !== "all") {
      const { data: eventOrders } = await supabase
        .from("orders")
        .select("id")
        .eq("event_id", selectedEventId);
      eventOrderIds = new Set(eventOrders?.map(o => o.id) || []);
    }

    // Filter returns by event if needed
    const filteredReturns = eventOrderIds
      ? returns.filter((ret: any) => eventOrderIds!.has(ret.order_items?.order_id))
      : returns;

    let totalLoss = 0;
    let confirmedLoss = 0;
    const categoryMap = new Map<string, number>();
    const reasonMap = new Map<string, { count: number; amount: number }>();
    const dateMap = new Map<string, { amount: number; count: number }>();

    filteredReturns.forEach((ret: any) => {
      const itemPrice = ret.order_items?.price || 0;
      const quantity = ret.order_items?.quantity || 1;
      const calculatedAmount = itemPrice * quantity;
      const amount = ret.refund_amount || calculatedAmount;
      const category = ret.order_items?.menu_items?.category || "Unknown";
      const reason = ret.reason || "Unspecified";
      const dateKey = new Date(ret.created_at).toLocaleDateString();

      totalLoss += calculatedAmount;
      if (ret.refund_amount) {
        confirmedLoss += ret.refund_amount;
      }

      // By category
      categoryMap.set(category, (categoryMap.get(category) || 0) + amount);

      // By reason
      const existingReason = reasonMap.get(reason) || { count: 0, amount: 0 };
      reasonMap.set(reason, {
        count: existingReason.count + 1,
        amount: existingReason.amount + amount,
      });

      // By date
      const existingDate = dateMap.get(dateKey) || { amount: 0, count: 0 };
      dateMap.set(dateKey, {
        amount: existingDate.amount + amount,
        count: existingDate.count + 1,
      });
    });

    setRevenueLossData({
      totalLoss,
      confirmedLoss,
      unconfirmedLoss: totalLoss - confirmedLoss,
      byCategory: Array.from(categoryMap.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      byReason: Array.from(reasonMap.entries())
        .map(([reason, data]) => ({ reason, ...data }))
        .sort((a, b) => b.amount - a.amount),
      byDate: Array.from(dateMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    });
  };

  const fetchPeakHours = async (start: string, end: string) => {
    // Build query for orders with optional event filter
    let query = supabase
      .from("orders")
      .select("id, created_at, total_amount")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("created_at", start)
      .lte("created_at", end);

    if (selectedEventId !== "all") {
      query = query.eq("event_id", selectedEventId);
    }

    const { data: orders, error } = await query;

    if (!error && orders) {
      // Group by hour
      const hourMap = new Map<number, { orders: number; revenue: number }>();
      orders.forEach((order: any) => {
        const hour = new Date(order.created_at).getHours();
        const existing = hourMap.get(hour) || { orders: 0, revenue: 0 };
        hourMap.set(hour, {
          orders: existing.orders + 1,
          revenue: existing.revenue + parseFloat(order.total_amount || 0),
        });
      });

      setPeakHours(
        Array.from(hourMap.entries())
          .map(([hour, data]) => ({
            hour: `${hour}:00`,
            orders: data.orders,
            revenue: data.revenue,
          }))
          .sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
      );
    }
  };

  const fetchPopularItems = async (start: string, end: string) => {
    // Get orders with optional event filter
    let ordersQuery = supabase
      .from("orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("created_at", start)
      .lte("created_at", end);

    if (selectedEventId !== "all") {
      ordersQuery = ordersQuery.eq("event_id", selectedEventId);
    }

    const { data: orders } = await ordersQuery;
    if (!orders || orders.length === 0) {
      setPopularItems([]);
      return;
    }

    const orderIds = orders.map(o => o.id);

    // Get order items for those orders
    const { data: orderItems, error } = await supabase
      .from("order_items")
      .select(`
        menu_item_id,
        quantity,
        price,
        order_id,
        menu_items (
          name,
          category
        )
      `)
      .in("order_id", orderIds);

    if (!error && orderItems) {
      const itemMap = new Map<string, any>();
      orderItems.forEach((item: any) => {
        const existing = itemMap.get(item.menu_item_id) || {
          item_id: item.menu_item_id,
          item_name: item.menu_items?.name || "Unknown",
          category: item.menu_items?.category || "Unknown",
          total_quantity: 0,
          total_revenue: 0,
          order_count: new Set(),
        };
        existing.total_quantity += item.quantity;
        existing.total_revenue += item.price * item.quantity;
        existing.order_count.add(item.order_id);
        itemMap.set(item.menu_item_id, existing);
      });

      setPopularItems(
        Array.from(itemMap.values())
          .map(item => ({
            ...item,
            order_count: item.order_count.size,
            avg_price: item.total_revenue / item.total_quantity,
          }))
          .sort((a, b) => b.total_quantity - a.total_quantity)
          .slice(0, 10)
      );
    }
  };

  const fetchStationEfficiency = async (start: string, end: string) => {
    // Get orders with optional event filter
    let ordersQuery = supabase
      .from("orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .gte("created_at", start)
      .lte("created_at", end);

    if (selectedEventId !== "all") {
      ordersQuery = ordersQuery.eq("event_id", selectedEventId);
    }

    const { data: orders } = await ordersQuery;
    if (!orders || orders.length === 0) {
      setStationEfficiency([]);
      return;
    }

    const orderIds = orders.map(o => o.id);

    // Get order items with ready_at for those orders
    const { data: orderItems, error } = await supabase
      .from("order_items")
      .select("station_type, created_at, ready_at")
      .in("order_id", orderIds)
      .not("ready_at", "is", null);

    if (!error && orderItems) {
      const stationMap = new Map<string, any>();
      orderItems.forEach((item: any) => {
        const prepTime = (new Date(item.ready_at).getTime() - new Date(item.created_at).getTime()) / 60000; // minutes
        const existing = stationMap.get(item.station_type) || {
          station_type: item.station_type,
          total_items: 0,
          total_prep_time: 0,
          items_on_time: 0,
          items_delayed: 0,
        };
        existing.total_items += 1;
        existing.total_prep_time += prepTime;
        if (prepTime <= 10) {
          existing.items_on_time += 1;
        } else {
          existing.items_delayed += 1;
        }
        stationMap.set(item.station_type, existing);
      });

      setStationEfficiency(
        Array.from(stationMap.values()).map(station => ({
          ...station,
          avg_prep_time_minutes: station.total_prep_time / station.total_items,
          efficiency_percentage: (station.items_on_time / station.total_items) * 100,
        }))
      );
    }
  };

  const fetchWaiterPerformance = async (start: string, end: string) => {
    // Get orders with optional event filter
    let ordersQuery = supabase
      .from("orders")
      .select(`
        id,
        waiter_id,
        total_amount,
        created_at,
        paid_at,
        profiles!orders_waiter_id_fkey (
          full_name
        )
      `)
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("created_at", start)
      .lte("created_at", end);

    if (selectedEventId !== "all") {
      ordersQuery = ordersQuery.eq("event_id", selectedEventId);
    }

    const { data: orders, error } = await ordersQuery;

    if (!error && orders) {
      const waiterMap = new Map<string, any>();
      orders.forEach((order: any) => {
        const existing = waiterMap.get(order.waiter_id) || {
          waiter_id: order.waiter_id,
          waiter_name: order.profiles?.full_name || "Unknown",
          total_orders: 0,
          total_revenue: 0,
          total_turnover_time: 0,
        };
        existing.total_orders += 1;
        existing.total_revenue += parseFloat(order.total_amount || 0);
        if (order.paid_at) {
          existing.total_turnover_time += (new Date(order.paid_at).getTime() - new Date(order.created_at).getTime()) / 60000;
        }
        waiterMap.set(order.waiter_id, existing);
      });

      setWaiterPerformance(
        Array.from(waiterMap.values()).map(waiter => ({
          ...waiter,
          avg_order_value: waiter.total_revenue / waiter.total_orders,
          avg_table_turnover_minutes: waiter.total_turnover_time / waiter.total_orders,
        }))
      );
    }
  };

  const fetchRevenueTrends = async (start: string, end: string) => {
    let query = supabase
      .from("orders")
      .select("id, created_at, total_amount, table_number")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("created_at", start)
      .lte("created_at", end);

    if (selectedEventId !== "all") {
      query = query.eq("event_id", selectedEventId);
    }

    const { data: orders, error } = await query;

    if (!error && orders) {
      const dateMap = new Map<string, any>();
      orders.forEach((order: any) => {
        const dateKey = new Date(order.created_at).toLocaleDateString();
        const existing = dateMap.get(dateKey) || {
          date: dateKey,
          total_orders: 0,
          total_revenue: 0,
          tables: new Set(),
        };
        existing.total_orders += 1;
        existing.total_revenue += parseFloat(order.total_amount || 0);
        if (order.table_number) existing.tables.add(order.table_number);
        dateMap.set(dateKey, existing);
      });

      setRevenueTrends(
        Array.from(dateMap.values())
          .map(item => ({
            date: item.date,
            revenue: item.total_revenue,
            orders: item.total_orders,
            avgOrder: item.total_revenue / item.total_orders,
          }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      );
    }
  };

  const fetchCategoryPerformance = async (start: string, end: string) => {
    // Get orders with optional event filter
    let ordersQuery = supabase
      .from("orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("created_at", start)
      .lte("created_at", end);

    if (selectedEventId !== "all") {
      ordersQuery = ordersQuery.eq("event_id", selectedEventId);
    }

    const { data: orders } = await ordersQuery;
    if (!orders || orders.length === 0) {
      setCategoryPerformance([]);
      return;
    }

    const orderIds = orders.map(o => o.id);

    // Get order items for those orders
    const { data: orderItems, error } = await supabase
      .from("order_items")
      .select(`
        quantity,
        price,
        menu_items (
          category
        )
      `)
      .in("order_id", orderIds);

    if (!error && orderItems) {
      const categoryMap = new Map<string, number>();
      let grandTotal = 0;

      orderItems.forEach((item: any) => {
        const revenue = item.price * item.quantity;
        const category = item.menu_items?.category || "Unknown";
        categoryMap.set(category, (categoryMap.get(category) || 0) + revenue);
        grandTotal += revenue;
      });

      setCategoryPerformance(
        Array.from(categoryMap.entries())
          .map(([name, value]) => ({
            name,
            value,
            percentage: grandTotal > 0 ? (value / grandTotal) * 100 : 0,
          }))
          .sort((a, b) => b.value - a.value)
      );
    }
  };

  const totalRevenue = revenueTrends.reduce((sum, item) => sum + item.revenue, 0);
  const totalOrders = revenueTrends.reduce((sum, item) => sum + item.orders, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Simple linear forecast for next 7 days
  const forecastRevenue = () => {
    if (revenueTrends.length < 2) return 0;
    const recentTrend = revenueTrends.slice(-7);
    const avgDailyRevenue =
      recentTrend.reduce((sum, item) => sum + item.revenue, 0) / recentTrend.length;
    return avgDailyRevenue * 7;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <TrendingUp className="w-16 h-16 mx-auto mb-4 animate-pulse" />
          <p className="text-xl">Loading Analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive insights and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label>Time Range:</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="14">Last 14 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label>Event:</Label>
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={fetchAllAnalytics}>Refresh</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {dateRange} days period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">Completed orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${avgOrderValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Per order</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">7-Day Forecast</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${forecastRevenue().toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Projected revenue</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Popular Items</TabsTrigger>
          <TabsTrigger value="staff">Staff Performance</TabsTrigger>
          <TabsTrigger value="stations">Station Efficiency</TabsTrigger>
          <TabsTrigger value="losses">Revenue Loss</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trends & Forecast</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#8884d8"
                      name="Revenue"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgOrder"
                      stroke="#82ca9d"
                      name="Avg Order"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Peak Hours Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={peakHours}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="orders" fill="#8884d8" name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Category Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryPerformance}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.percentage.toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryPerformance.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daily Orders Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="#82ca9d"
                      name="Orders"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Selling Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {popularItems.map((item, index) => (
                  <div
                    key={item.item_id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-semibold">{item.item_name}</p>
                        <p className="text-sm text-muted-foreground">{item.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{item.total_quantity} sold</p>
                      <p className="text-sm text-muted-foreground">
                        ${parseFloat(item.total_revenue).toFixed(2)} revenue
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Waiter Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {waiterPerformance.map((waiter, index) => (
                  <div
                    key={waiter.waiter_id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent text-accent-foreground font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-semibold">{waiter.waiter_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {waiter.total_orders} orders • ${parseFloat(waiter.total_revenue).toFixed(2)} revenue
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">
                        ${parseFloat(waiter.avg_order_value).toFixed(2)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Avg order • {parseFloat(waiter.avg_table_turnover_minutes).toFixed(0)}m turnover
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stations" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stationEfficiency.map((station) => (
              <Card key={station.station_type}>
                <CardHeader>
                  <CardTitle className="capitalize">
                    {station.station_type.replace("_", " ")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Items</p>
                      <p className="text-2xl font-bold">{station.total_items}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Prep Time</p>
                      <p className="text-2xl font-bold">
                        {parseFloat(station.avg_prep_time_minutes).toFixed(1)}m
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">On Time</p>
                      <p className="text-2xl font-bold text-green-600">
                        {station.items_on_time}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Delayed</p>
                      <p className="text-2xl font-bold text-red-600">
                        {station.items_delayed}
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Efficiency Rate</span>
                      <span className="text-xl font-bold">
                        {parseFloat(station.efficiency_percentage || 0).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{
                          width: `${Math.min(parseFloat(station.efficiency_percentage || 0), 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="losses" className="space-y-4">
          {/* Revenue Loss KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue Loss</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {formatPrice(revenueLossData.totalLoss)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dateRange} days period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Confirmed Losses</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(revenueLossData.confirmedLoss)}</div>
                <p className="text-xs text-muted-foreground">Recorded in system</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Confirmation</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">
                  {formatPrice(revenueLossData.unconfirmedLoss)}
                </div>
                <p className="text-xs text-muted-foreground">Awaiting cashier confirmation</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Loss by Category */}
            <Card>
              <CardHeader>
                <CardTitle>Losses by Category</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueLossData.byCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={revenueLossData.byCategory}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.category}: ${formatPrice(entry.amount)}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="amount"
                        nameKey="category"
                      >
                        {revenueLossData.byCategory.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatPrice(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    No revenue loss data for this period
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Loss Trend Over Time */}
            <Card>
              <CardHeader>
                <CardTitle>Loss Trend Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueLossData.byDate.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={revenueLossData.byDate}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => formatPrice(value)} />
                      <Legend />
                      <Bar dataKey="amount" fill="#ef4444" name="Loss Amount" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    No revenue loss data for this period
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Loss by Reason Table */}
          <Card>
            <CardHeader>
              <CardTitle>Losses by Reason</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueLossData.byReason.length > 0 ? (
                <div className="space-y-3">
                  {revenueLossData.byReason.map((item, index) => (
                    <div
                      key={item.reason}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-full font-bold text-white"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-semibold">{item.reason}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.count} {item.count === 1 ? "return" : "returns"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-destructive">{formatPrice(item.amount)}</p>
                        <p className="text-sm text-muted-foreground">
                          {revenueLossData.totalLoss > 0
                            ? ((item.amount / revenueLossData.totalLoss) * 100).toFixed(1)
                            : 0}
                          % of total
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  No revenue loss data for this period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
