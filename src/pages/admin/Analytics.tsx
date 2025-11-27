import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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

export default function Analytics() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("7");
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [peakHours, setPeakHours] = useState<any[]>([]);
  const [popularItems, setPopularItems] = useState<any[]>([]);
  const [stationEfficiency, setStationEfficiency] = useState<any[]>([]);
  const [waiterPerformance, setWaiterPerformance] = useState<any[]>([]);
  const [revenueTrends, setRevenueTrends] = useState<any[]>([]);
  const [categoryPerformance, setCategoryPerformance] = useState<any[]>([]);

  useEffect(() => {
    fetchTenantId();
  }, []);

  useEffect(() => {
    if (tenantId) {
      fetchAllAnalytics();
    }
  }, [tenantId, dateRange]);

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

  const fetchPeakHours = async (start: string, end: string) => {
    const { data, error } = await supabase.rpc("get_peak_hours_analysis", {
      _start_date: start,
      _end_date: end,
      _tenant_id: tenantId,
    });

    if (!error && data) {
      setPeakHours(
        data.map((item: any) => ({
          hour: `${item.hour}:00`,
          orders: parseInt(item.order_count),
          revenue: parseFloat(item.total_revenue || 0),
        }))
      );
    }
  };

  const fetchPopularItems = async (start: string, end: string) => {
    const { data, error } = await supabase.rpc("get_popular_items", {
      _start_date: start,
      _end_date: end,
      _tenant_id: tenantId,
      _limit: 10,
    });

    if (!error && data) {
      setPopularItems(data);
    }
  };

  const fetchStationEfficiency = async (start: string, end: string) => {
    const { data, error } = await supabase.rpc("get_station_efficiency", {
      _start_date: start,
      _end_date: end,
      _tenant_id: tenantId,
    });

    if (!error && data) {
      setStationEfficiency(data);
    }
  };

  const fetchWaiterPerformance = async (start: string, end: string) => {
    const { data, error } = await supabase.rpc("get_waiter_performance", {
      _start_date: start,
      _end_date: end,
      _tenant_id: tenantId,
    });

    if (!error && data) {
      setWaiterPerformance(data);
    }
  };

  const fetchRevenueTrends = async (start: string, end: string) => {
    const { data, error } = await supabase.rpc("get_revenue_trends", {
      _start_date: start,
      _end_date: end,
      _tenant_id: tenantId,
    });

    if (!error && data) {
      setRevenueTrends(
        data.map((item: any) => ({
          date: new Date(item.date).toLocaleDateString(),
          revenue: parseFloat(item.total_revenue || 0),
          orders: parseInt(item.total_orders),
          avgOrder: parseFloat(item.avg_order_value || 0),
        }))
      );
    }
  };

  const fetchCategoryPerformance = async (start: string, end: string) => {
    const { data, error } = await supabase.rpc("get_category_performance", {
      _start_date: start,
      _end_date: end,
      _tenant_id: tenantId,
    });

    if (!error && data) {
      setCategoryPerformance(
        data.map((item: any) => ({
          name: item.category,
          value: parseFloat(item.total_revenue || 0),
          percentage: parseFloat(item.percentage_of_total || 0),
        }))
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
        <div className="flex items-center gap-4">
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
      </Tabs>
    </div>
  );
}
