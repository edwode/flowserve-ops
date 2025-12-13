import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, TrendingUp, DollarSign, Users, ShoppingCart, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Event {
  id: string;
  name: string;
  event_date: string;
}

interface EventSummary {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  paidOrders: number;
  pendingOrders: number;
}

interface TopItem {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
}

interface WaiterPerformance {
  waiter_name: string;
  orders_count: number;
  total_revenue: number;
  avg_order_value: number;
}

interface HourlySales {
  hour: number;
  orders: number;
  revenue: number;
}

interface CashierPerformance {
  cashier_name: string;
  payments_count: number;
  total_collected: number;
  avg_payment: number;
}

type ReportCardId = 'topItems' | 'waiterPerformance' | 'hourlySales' | 'cashierPerformance';

interface ReportCardState {
  id: ReportCardId;
  title: string;
  isOpen: boolean;
}

export function AdminReports() {
  const { toast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [summary, setSummary] = useState<EventSummary>({
    totalOrders: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    paidOrders: 0,
    pendingOrders: 0,
  });
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [waiterPerformance, setWaiterPerformance] = useState<WaiterPerformance[]>([]);
  const [hourlySales, setHourlySales] = useState<HourlySales[]>([]);
  const [cashierPerformance, setCashierPerformance] = useState<CashierPerformance[]>([]);
  
  const [reportCards, setReportCards] = useState<ReportCardState[]>([
    { id: 'topItems', title: 'Top Selling Items', isOpen: true },
    { id: 'waiterPerformance', title: 'Waiter Performance', isOpen: true },
    { id: 'cashierPerformance', title: 'Top Sales per Cashier', isOpen: true },
    { id: 'hourlySales', title: 'Sales by Hour', isOpen: true },
  ]);

  const toggleCard = (id: ReportCardId) => {
    setReportCards(prev => prev.map(card => 
      card.id === id ? { ...card, isOpen: !card.isOpen } : card
    ));
  };

  const moveCard = (id: ReportCardId, direction: 'up' | 'down') => {
    setReportCards(prev => {
      const index = prev.findIndex(card => card.id === id);
      if (index === -1) return prev;
      if (direction === 'up' && index === 0) return prev;
      if (direction === 'down' && index === prev.length - 1) return prev;
      
      const newCards = [...prev];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      [newCards[index], newCards[swapIndex]] = [newCards[swapIndex], newCards[index]];
      return newCards;
    });
  };
  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      fetchReports();
    }
  }, [selectedEvent]);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, name, event_date')
        .order('event_date', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
      
      if (data && data.length > 0) {
        setSelectedEvent(data[0].id);
      }
    } catch (error: any) {
      toast({
        title: "Error loading events",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchReports = async () => {
    await Promise.all([
      fetchEventSummary(),
      fetchTopItems(),
      fetchWaiterPerformance(),
      fetchHourlySales(),
      fetchCashierPerformance(),
    ]);
  };

  const fetchEventSummary = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('status, total_amount')
        .eq('event_id', selectedEvent);

      if (error) throw error;

      const totalOrders = data?.length || 0;
      const totalRevenue = data?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
      const paidOrders = data?.filter(o => o.status === 'paid').length || 0;
      const pendingOrders = data?.filter(o => o.status !== 'paid').length || 0;

      setSummary({
        totalOrders,
        totalRevenue,
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        paidOrders,
        pendingOrders,
      });
    } catch (error: any) {
      console.error("Error fetching summary:", error);
    }
  };

  const fetchTopItems = async () => {
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          quantity,
          price,
          menu_items (name, category),
          orders!inner (event_id)
        `)
        .eq('orders.event_id', selectedEvent);

      if (error) throw error;

      const itemMap: Record<string, TopItem> = {};

      data?.forEach((item: any) => {
        const name = item.menu_items?.name || 'Unknown';
        if (!itemMap[name]) {
          itemMap[name] = {
            name,
            category: item.menu_items?.category || 'Unknown',
            quantity: 0,
            revenue: 0,
          };
        }
        itemMap[name].quantity += item.quantity;
        itemMap[name].revenue += item.quantity * item.price;
      });

      const items = Object.values(itemMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      setTopItems(items);
    } catch (error: any) {
      console.error("Error fetching top items:", error);
    }
  };

  const fetchWaiterPerformance = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          total_amount,
          profiles!orders_waiter_id_fkey (full_name)
        `)
        .eq('event_id', selectedEvent);

      if (error) throw error;

      const waiterMap: Record<string, { count: number; revenue: number }> = {};

      data?.forEach((order: any) => {
        const name = order.profiles?.full_name || 'Unknown';
        if (!waiterMap[name]) {
          waiterMap[name] = { count: 0, revenue: 0 };
        }
        waiterMap[name].count++;
        waiterMap[name].revenue += order.total_amount || 0;
      });

      const performance: WaiterPerformance[] = Object.entries(waiterMap)
        .map(([name, data]) => ({
          waiter_name: name,
          orders_count: data.count,
          total_revenue: data.revenue,
          avg_order_value: data.count > 0 ? data.revenue / data.count : 0,
        }))
        .sort((a, b) => b.total_revenue - a.total_revenue);

      setWaiterPerformance(performance);
    } catch (error: any) {
      console.error("Error fetching waiter performance:", error);
    }
  };

  const fetchHourlySales = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('created_at, total_amount')
        .eq('event_id', selectedEvent);

      if (error) throw error;

      const hourlyMap: Record<number, { orders: number; revenue: number }> = {};

      data?.forEach((order) => {
        const hour = new Date(order.created_at).getHours();
        if (!hourlyMap[hour]) {
          hourlyMap[hour] = { orders: 0, revenue: 0 };
        }
        hourlyMap[hour].orders++;
        hourlyMap[hour].revenue += order.total_amount || 0;
      });

      const sales: HourlySales[] = Object.entries(hourlyMap)
        .map(([hour, data]) => ({
          hour: parseInt(hour),
          orders: data.orders,
          revenue: data.revenue,
        }))
        .sort((a, b) => a.hour - b.hour);

      setHourlySales(sales);
    } catch (error: any) {
      console.error("Error fetching hourly sales:", error);
    }
  };

  const fetchCashierPerformance = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          amount,
          profiles!payments_confirmed_by_fkey (full_name),
          orders!inner (event_id)
        `)
        .eq('orders.event_id', selectedEvent);

      if (error) throw error;

      const cashierMap: Record<string, { count: number; total: number }> = {};

      data?.forEach((payment: any) => {
        const name = payment.profiles?.full_name || 'Unknown';
        if (!cashierMap[name]) {
          cashierMap[name] = { count: 0, total: 0 };
        }
        cashierMap[name].count++;
        cashierMap[name].total += payment.amount || 0;
      });

      const performance: CashierPerformance[] = Object.entries(cashierMap)
        .map(([name, data]) => ({
          cashier_name: name,
          payments_count: data.count,
          total_collected: data.total,
          avg_payment: data.count > 0 ? data.total / data.count : 0,
        }))
        .sort((a, b) => b.total_collected - a.total_collected);

      setCashierPerformance(performance);
    } catch (error: any) {
      console.error("Error fetching cashier performance:", error);
    }
  };

  const handleExportCSV = async () => {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          order_number,
          table_number,
          guest_name,
          status,
          total_amount,
          created_at,
          served_at,
          paid_at,
          profiles!orders_waiter_id_fkey (full_name)
        `)
        .eq('event_id', selectedEvent);

      if (error) throw error;

      // Create CSV content
      const headers = ['Order Number', 'Table', 'Guest', 'Waiter', 'Status', 'Amount', 'Created', 'Served', 'Paid'];
      const rows = orders?.map((order: any) => [
        order.order_number,
        order.table_number || '',
        order.guest_name || '',
        order.profiles?.full_name || '',
        order.status,
        order.total_amount?.toFixed(2) || '0.00',
        new Date(order.created_at).toLocaleString(),
        order.served_at ? new Date(order.served_at).toLocaleString() : '',
        order.paid_at ? new Date(order.paid_at).toLocaleString() : '',
      ]);

      const csvContent = [
        headers.join(','),
        ...(rows?.map(row => row.map(cell => `"${cell}"`).join(',')) || [])
      ].join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-report-${selectedEvent}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({ title: "Report exported successfully" });
    } catch (error: any) {
      toast({
        title: "Error exporting report",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const selectedEventName = events.find(e => e.id === selectedEvent)?.name || '';
  const maxItemRevenue = Math.max(...topItems.map(i => i.revenue), 1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reports & Analytics</h2>
          <p className="text-muted-foreground">Comprehensive event performance insights</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedEvent} onValueChange={setSelectedEvent}>
            <SelectTrigger className="w-[250px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {events.map(event => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleExportCSV} disabled={!selectedEvent}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {selectedEvent && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <ShoppingCart className="h-4 w-4" />
                Total Orders
              </div>
              <div className="text-2xl font-bold">{summary.totalOrders}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {summary.paidOrders} paid • {summary.pendingOrders} pending
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <DollarSign className="h-4 w-4" />
                Total Revenue
              </div>
              <div className="text-2xl font-bold">${summary.totalRevenue.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Avg: ${summary.avgOrderValue.toFixed(2)}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <TrendingUp className="h-4 w-4" />
                Completion Rate
              </div>
              <div className="text-2xl font-bold">
                {summary.totalOrders > 0 
                  ? ((summary.paidOrders / summary.totalOrders) * 100).toFixed(1)
                  : 0}%
              </div>
              <Progress 
                value={summary.totalOrders > 0 ? (summary.paidOrders / summary.totalOrders) * 100 : 0}
                className="mt-2"
              />
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Users className="h-4 w-4" />
                Active Waiters
              </div>
              <div className="text-2xl font-bold">{waiterPerformance.length}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Serving {selectedEventName}
              </div>
            </Card>
          </div>

          {/* Collapsible Report Cards */}
          {reportCards.map((card, cardIndex) => (
            <Collapsible key={card.id} open={card.isOpen} onOpenChange={() => toggleCard(card.id)}>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">{card.title}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); moveCard(card.id, 'up'); }}
                      disabled={cardIndex === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); moveCard(card.id, 'down'); }}
                      disabled={cardIndex === reportCards.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronDown className={`h-4 w-4 transition-transform ${card.isOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="p-6 pt-4">
                    {card.id === 'topItems' && (
                      <div className="space-y-3">
                        {topItems.map((item, index) => (
                          <div key={item.name} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl font-bold text-muted-foreground w-6">
                                  {index + 1}
                                </span>
                                <div>
                                  <div className="font-medium">{item.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {item.category} • {item.quantity} sold
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">${item.revenue.toFixed(2)}</div>
                                <div className="text-xs text-muted-foreground">
                                  ${(item.revenue / item.quantity).toFixed(2)} avg
                                </div>
                              </div>
                            </div>
                            <Progress value={(item.revenue / maxItemRevenue) * 100} />
                          </div>
                        ))}
                        {topItems.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            No sales data yet
                          </div>
                        )}
                      </div>
                    )}

                    {card.id === 'waiterPerformance' && (
                      <div className="space-y-4">
                        {waiterPerformance.map((waiter) => (
                          <div key={waiter.waiter_name} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{waiter.waiter_name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {waiter.orders_count} orders
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">${waiter.total_revenue.toFixed(2)}</div>
                                <div className="text-xs text-muted-foreground">
                                  ${waiter.avg_order_value.toFixed(2)} avg
                                </div>
                              </div>
                            </div>
                            <Progress 
                              value={(waiter.total_revenue / summary.totalRevenue) * 100} 
                            />
                          </div>
                        ))}
                        {waiterPerformance.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            No waiter data yet
                          </div>
                        )}
                      </div>
                    )}

                    {card.id === 'cashierPerformance' && (
                      <div className="space-y-4">
                        {cashierPerformance.map((cashier, index) => {
                          const maxCashierRevenue = Math.max(...cashierPerformance.map(c => c.total_collected), 1);
                          return (
                            <div key={cashier.cashier_name} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl font-bold text-muted-foreground w-6">
                                    {index + 1}
                                  </span>
                                  <div>
                                    <div className="font-medium">{cashier.cashier_name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {cashier.payments_count} payments
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold">${cashier.total_collected.toFixed(2)}</div>
                                  <div className="text-xs text-muted-foreground">
                                    ${cashier.avg_payment.toFixed(2)} avg
                                  </div>
                                </div>
                              </div>
                              <Progress value={(cashier.total_collected / maxCashierRevenue) * 100} />
                            </div>
                          );
                        })}
                        {cashierPerformance.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            No cashier data yet
                          </div>
                        )}
                      </div>
                    )}

                    {card.id === 'hourlySales' && (
                      <div className="space-y-3">
                        {hourlySales.map((hour) => (
                          <div key={hour.hour} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="font-semibold w-16">
                                  {hour.hour.toString().padStart(2, '0')}:00
                                </span>
                                <div className="text-sm text-muted-foreground">
                                  {hour.orders} orders
                                </div>
                              </div>
                              <div className="font-semibold">${hour.revenue.toFixed(2)}</div>
                            </div>
                            <Progress 
                              value={(hour.revenue / Math.max(...hourlySales.map(h => h.revenue), 1)) * 100}
                            />
                          </div>
                        ))}
                        {hourlySales.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            No hourly data yet
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </>
      )}

      {!selectedEvent && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Select an event to view reports</p>
        </Card>
      )}
    </div>
  );
}
