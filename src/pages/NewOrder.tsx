import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, Plus, Minus, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineStorage } from "@/lib/offlineStorage";
import { offlineQueue } from "@/lib/offlineQueue";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface Event {
  id: string;
  name: string;
  event_date: string;
}

interface Table {
  id: string;
  table_number: string;
  capacity: number;
  status: string;
  is_adhoc: boolean;
  assigned_waiter_id: string | null;
  zone_id: string | null;
  reservation_name: string | null;
  zone?: {
    name: string;
    color: string;
  } | null;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  station_type: string;
  is_available: boolean;
}

interface CartItem extends MenuItem {
  quantity: number;
}

const NewOrder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOnline } = useOnlineStatus();
  const { user, tenantId, loading: authLoading } = useAuthGuard();
  const { formatPrice } = useTenantCurrency();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [usingCache, setUsingCache] = useState(false);
  const [waiterZoneId, setWaiterZoneId] = useState<string | null>(null);
  const [waiterEventId, setWaiterEventId] = useState<string | null>(null);
  
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState("");
  const [guestName, setGuestName] = useState("");

  useEffect(() => {
    if (!authLoading && user) {
      fetchData();
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (selectedEvent) {
      fetchMenuItems();
      fetchTables();
      setSelectedTable("");
    }
  }, [selectedEvent]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      // Fetch waiter's zone and event assignment
      const { data: profile } = await supabase
        .from('profiles')
        .select('zone_id, event_id')
        .eq('id', user.id)
        .single();
      
      if (profile?.zone_id) {
        setWaiterZoneId(profile.zone_id);
      }
      if (profile?.event_id) {
        setWaiterEventId(profile.event_id);
      }

      // Build events query
      let eventsQuery = supabase
        .from('events')
        .select('id, name, event_date')
        .eq('is_active', true)
        .order('event_date', { ascending: false });

      // If waiter has an event assigned, filter to only that event
      if (profile?.event_id) {
        eventsQuery = eventsQuery.eq('id', profile.event_id);
      }

      const { data, error } = await eventsQuery;

      if (error) throw error;
      setEvents(data || []);

      // Auto-select if only one event
      if (data && data.length === 1) {
        setSelectedEvent(data[0].id);
      }
    } catch (error: any) {
      toast({
        title: "Error loading events",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTables = async () => {
    if (!selectedEvent || !user) return;

    try {
      const { data, error } = await supabase
        .from("tables")
        .select(`
          id,
          table_number,
          capacity,
          status,
          zone_id,
          is_adhoc,
          assigned_waiter_id,
          reservation_name,
          zone:zones (
            name,
            color
          )
        `)
        .eq("event_id", selectedEvent)
        .order("table_number");

      if (error) throw error;

      // Filter tables to only show:
      // 1. Tables directly assigned to this waiter
      // 2. Ad-hoc tables in the waiter's zone (accessible to all zone waiters)
      let filteredTables = (data || []).filter(table => {
        const isAssignedToWaiter = table.assigned_waiter_id === user.id;
        const isAdhocInWaiterZone = waiterZoneId && table.zone_id === waiterZoneId && table.is_adhoc;
        
        return isAssignedToWaiter || isAdhocInWaiterZone;
      });

      setTables(filteredTables as Table[]);
    } catch (error: any) {
      console.error("Error fetching tables:", error);
    }
  };

  const fetchMenuItems = async () => {
    try {
      // Try cache first if offline
      if (!isOnline) {
        const cachedMenu = OfflineStorage.getMenu();
        if (cachedMenu) {
          setMenuItems(cachedMenu);
          setUsingCache(true);
          return;
        }
      }

      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('event_id', selectedEvent)
        .eq('is_available', true)
        .order('category', { ascending: true });

      if (error) throw error;
      
      const items = data || [];
      setMenuItems(items);
      setUsingCache(false);
      
      // Cache menu items for this event
      OfflineStorage.saveMenu(items);
    } catch (error: any) {
      // Try cache on error
      const cachedMenu = OfflineStorage.getMenu();
      if (cachedMenu) {
        setMenuItems(cachedMenu);
        setUsingCache(true);
        toast({
          title: "Using cached menu",
          description: "Showing previously loaded menu items",
        });
      } else {
        toast({
          title: "Error loading menu",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => i.id !== itemId);
    });
  };

  const getCartItemQuantity = (itemId: string) => {
    return cart.find(i => i.id === itemId)?.quantity || 0;
  };

  const getTotalAmount = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const handleSubmit = async () => {
    if (!selectedEvent || !selectedTable || cart.length === 0) {
      toast({
        title: "Missing information",
        description: "Please select event, select a table, and add items",
        variant: "destructive",
      });
      return;
    }

    const tableNumber = tables.find(t => t.id === selectedTable)?.table_number || selectedTable;

    setSubmitting(true);
    try {
      if (!user || !tenantId) throw new Error("Not authenticated");

      // If offline, queue the order
      if (!isOnline) {
        const orderData = {
          event_id: selectedEvent,
          waiter_id: user.id,
          tenant_id: tenantId,
          table_number: tableNumber,
          guest_name: guestName || null,
          status: 'pending',
          total_amount: getTotalAmount(),
          cart: cart,
        };

        offlineQueue.addToQueue('order', orderData);

        toast({
          title: "Order queued",
          description: "Order will be submitted when connection is restored",
        });

        navigate('/waiter');
        return;
      }

      // Generate order number
      const { data: orderNumber, error: orderNumError } = await supabase
        .rpc('generate_order_number', { _event_id: selectedEvent });

      if (orderNumError) throw orderNumError;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          event_id: selectedEvent,
          waiter_id: user.id,
          tenant_id: tenantId,
          table_number: tableNumber,
          guest_name: guestName || null,
          status: 'pending',
          total_amount: getTotalAmount(),
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cart.map(item => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        price: item.price,
        station_type: item.station_type as "drink_dispenser" | "meal_dispenser" | "mixologist" | "bar",
        tenant_id: tenantId,
        status: 'pending' as "pending",
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Order created",
        description: `Order ${orderNumber} dispatched to stations`,
      });

      navigate('/waiter');
    } catch (error: any) {
      toast({
        title: "Error creating order",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const groupedMenuItems = menuItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/waiter')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">New Order</h1>
            <p className="text-sm text-muted-foreground">Create a new order</p>
          </div>
          <OfflineIndicator />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Event Selection */}
        <Card className="p-4 space-y-3">
          <Label htmlFor="event">Event</Label>
          <select
            id="event"
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background"
          >
            <option value="">Select an event</option>
            {events.map(event => (
              <option key={event.id} value={event.id}>
                {event.name} - {new Date(event.event_date).toLocaleDateString()}
              </option>
            ))}
          </select>
        </Card>

        {/* Table & Guest Info */}
        {selectedEvent && (
          <Card className="p-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="table">Table *</Label>
              <Select value={selectedTable} onValueChange={setSelectedTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a table" />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      <div className="flex items-center gap-2">
                        {table.zone && (
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: table.zone.color }}
                          />
                        )}
                        <span>Table {table.table_number}</span>
                        <span className="text-muted-foreground text-xs">
                          ({table.capacity} seats)
                          {table.zone && ` • ${table.zone.name}`}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tables.length === 0 && (
                <p className="text-xs text-muted-foreground">No tables found for this event</p>
              )}
            </div>
            {selectedTable && tables.find(t => t.id === selectedTable)?.reservation_name && (
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-sm text-muted-foreground">Reservation</p>
                <p className="font-medium">{tables.find(t => t.id === selectedTable)?.reservation_name}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="guest">Guest Name (Optional)</Label>
              <Input
                id="guest"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Guest name"
              />
            </div>
          </Card>
        )}

        {/* Menu Items */}
        {selectedEvent && menuItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Menu Items</h2>
            {Object.entries(groupedMenuItems).map(([category, items]) => (
              <Card key={category} className="p-4">
                <h3 className="font-semibold mb-3 text-primary">{category}</h3>
                <div className="space-y-2">
                  {items.map(item => {
                    const quantity = getCartItemQuantity(item.id);
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="flex-1">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatPrice(item.price)}
                          </div>
                        </div>
                        {quantity === 0 ? (
                          <Button size="sm" onClick={() => addToCart(item)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeFromCart(item.id)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-semibold">{quantity}</span>
                            <Button size="sm" onClick={() => addToCart(item)}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}

        {selectedEvent && menuItems.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No menu items available for this event</p>
          </Card>
        )}
      </div>

      {/* Cart Summary - Fixed Bottom */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <span className="font-semibold">{cart.reduce((sum, i) => sum + i.quantity, 0)} items</span>
            </div>
            <div className="text-xl font-bold">
              {formatPrice(getTotalAmount())}
            </div>
          </div>
          <Button
            className="w-full h-12"
            onClick={handleSubmit}
            disabled={submitting || !selectedEvent || !selectedTable}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Creating Order...
              </>
            ) : (
              'Submit Order'
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default NewOrder;
