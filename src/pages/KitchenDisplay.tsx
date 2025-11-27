import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Clock, ChefHat, CheckCircle, AlertCircle, ArrowUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrderItem {
  id: string;
  quantity: number;
  notes: string | null;
  status: "pending" | "dispatched" | "ready" | "served";
  created_at: string;
  dispatched_at: string | null;
  ready_at: string | null;
  station_type: "drink_dispenser" | "meal_dispenser" | "mixologist" | "bar";
  menu_item: {
    name: string;
    category: string;
  };
  order: {
    order_number: string;
    table_number: string | null;
    guest_name: string | null;
    waiter: {
      full_name: string | null;
    };
  };
}

interface Event {
  id: string;
  name: string;
}

export default function KitchenDisplay() {
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [stationType, setStationType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserStationType();
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent && stationType) {
      fetchOrderItems();
      subscribeToOrderItems();
    }
    return () => {
      supabase.removeAllChannels();
    };
  }, [selectedEvent, stationType]);

  const fetchUserStationType = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", session.session.user.id)
      .single();

    if (!profile) return;

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.session.user.id)
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (userRole) {
      const roleToStationType: Record<string, string> = {
        drink_dispenser: "drink_dispenser",
        meal_dispenser: "meal_dispenser",
        mixologist: "mixologist",
        bar_staff: "bar",
      };
      setStationType(roleToStationType[userRole.role] || "");
    }
  };

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select("id, name")
      .eq("is_active", true)
      .order("event_date", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch events",
        variant: "destructive",
      });
      return;
    }

    setEvents(data || []);
    if (data && data.length > 0) {
      setSelectedEvent(data[0].id);
    }
  };

  const fetchOrderItems = async () => {
    if (!selectedEvent || !stationType) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("order_items")
      .select(
        `
        *,
        menu_item:menu_items(name, category),
        order:orders(
          order_number,
          table_number,
          guest_name,
          waiter:profiles!waiter_id(full_name)
        )
      `
      )
      .eq("station_type", stationType as any)
      .in("status", ["pending", "dispatched"])
      .order("created_at", { ascending: true });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch order items",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    setOrderItems((data || []) as OrderItem[]);
    setLoading(false);
  };

  const subscribeToOrderItems = () => {
    const channel = supabase
      .channel("order-items-kds")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
          filter: `station_type=eq.${stationType}`,
        },
        () => {
          fetchOrderItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-red-500";
      case "dispatched":
        return "bg-yellow-500";
      case "ready":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <AlertCircle className="w-5 h-5" />;
      case "dispatched":
        return <ChefHat className="w-5 h-5" />;
      case "ready":
        return <CheckCircle className="w-5 h-5" />;
      default:
        return null;
    }
  };

  const getElapsedTime = (createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins;
  };

  const getTimerColor = (minutes: number) => {
    if (minutes < 5) return "text-green-500";
    if (minutes < 10) return "text-yellow-500";
    return "text-red-500 animate-pulse";
  };

  const updateOrderItemStatus = async (itemId: string, newStatus: string) => {
    const updates: any = { status: newStatus };

    if (newStatus === "dispatched") {
      updates.dispatched_at = new Date().toISOString();
    } else if (newStatus === "ready") {
      updates.ready_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("order_items")
      .update(updates)
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive",
      });
      return;
    }

    // Play notification sound
    const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTWJ0fPTgjMGHm7A7+OZURE=");
    audio.play().catch(() => {});

    toast({
      title: "Status Updated",
      description: `Order item marked as ${newStatus}`,
    });
  };

  const bumpToReady = async (itemId: string) => {
    await updateOrderItemStatus(itemId, "ready");
  };

  const startPreparation = async (itemId: string) => {
    await updateOrderItemStatus(itemId, "dispatched");
  };

  const pendingItems = orderItems.filter((item) => item.status === "pending");
  const preparingItems = orderItems.filter((item) => item.status === "dispatched");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <ChefHat className="w-16 h-16 mx-auto mb-4 animate-bounce" />
          <p className="text-xl">Loading Kitchen Display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold">Kitchen Display System</h1>
            <p className="text-muted-foreground capitalize">
              {stationType?.replace("_", " ")} Station
            </p>
          </div>
          <Select value={selectedEvent} onValueChange={setSelectedEvent}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select Event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New Orders</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingItems.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Preparing</CardTitle>
              <ChefHat className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{preparingItems.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Active</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orderItems.length}</div>
            </CardContent>
          </Card>
        </div>

        {orderItems.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h2 className="text-2xl font-bold mb-2">All Caught Up!</h2>
              <p className="text-muted-foreground">No pending orders at the moment.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderItems.map((item) => {
              const elapsedMinutes = getElapsedTime(item.created_at);
              const isPriority = elapsedMinutes > 8;

              return (
                <Card
                  key={item.id}
                  className={`relative border-2 ${
                    isPriority ? "border-red-500 animate-pulse" : ""
                  }`}
                >
                  {isPriority && (
                    <div className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-2">
                      <ArrowUp className="w-5 h-5" />
                    </div>
                  )}
                  
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">
                          {item.order.order_number}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Table {item.order.table_number || "N/A"} • {item.order.guest_name}
                        </p>
                      </div>
                      <Badge className={getStatusColor(item.status)}>
                        {getStatusIcon(item.status)}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div>
                      <h3 className="font-bold text-2xl mb-1">{item.menu_item.name}</h3>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{item.menu_item.category}</Badge>
                        <span className="text-2xl font-bold">×{item.quantity}</span>
                      </div>
                    </div>

                    {item.notes && (
                      <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded border-l-4 border-yellow-500">
                        <p className="text-sm font-medium">Note: {item.notes}</p>
                      </div>
                    )}

                    <div
                      className={`flex items-center gap-2 text-lg font-bold ${getTimerColor(
                        elapsedMinutes
                      )}`}
                    >
                      <Clock className="w-5 h-5" />
                      <span>{elapsedMinutes} min</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Waiter: {item.order.waiter.full_name}
                    </div>

                    <div className="flex gap-2 pt-2">
                      {item.status === "pending" && (
                        <Button
                          onClick={() => startPreparation(item.id)}
                          className="flex-1"
                          size="lg"
                        >
                          <ChefHat className="w-4 h-4 mr-2" />
                          Start Prep
                        </Button>
                      )}
                      {item.status === "dispatched" && (
                        <Button
                          onClick={() => bumpToReady(item.id)}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          size="lg"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark Ready
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
