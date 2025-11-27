import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PackageSearch, TrendingDown, History, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  starting_inventory: number;
  current_inventory: number;
  is_available: boolean;
  event_id: string;
  price: number;
}

interface Event {
  id: string;
  name: string;
  event_date: string;
}

interface InventoryAdjustment {
  id: string;
  created_at: string;
  action: string;
  details: any;
  user_id: string;
}

interface UsageAnalytics {
  item_name: string;
  category: string;
  total_sold: number;
  remaining: number;
  stock_percentage: number;
}

export default function AdminInventory() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [adjustmentDialog, setAdjustmentDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [newQuantity, setNewQuantity] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentHistory, setAdjustmentHistory] = useState<InventoryAdjustment[]>([]);
  const [usageAnalytics, setUsageAnalytics] = useState<UsageAnalytics[]>([]);

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      fetchMenuItems();
      fetchAdjustmentHistory();
      fetchUsageAnalytics();
      subscribeToInventoryChanges();
    }
  }, [selectedEvent]);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select("id, name, event_date")
      .eq("is_active", true)
      .order("event_date", { ascending: false });

    if (error) {
      toast.error("Failed to load events");
      return;
    }

    setEvents(data || []);
    if (data && data.length > 0) {
      setSelectedEvent(data[0].id);
    }
  };

  const fetchMenuItems = async () => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("event_id", selectedEvent)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      toast.error("Failed to load menu items");
      return;
    }

    setMenuItems(data || []);
  };

  const fetchAdjustmentHistory = async () => {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("action", "inventory_adjustment")
      .eq("resource_type", "menu_item")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      toast.error("Failed to load adjustment history");
      return;
    }

    setAdjustmentHistory(data || []);
  };

  const fetchUsageAnalytics = async () => {
    const { data: items, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("event_id", selectedEvent);

    if (error || !items) return;

    const analytics = items.map(item => ({
      item_name: item.name,
      category: item.category,
      total_sold: item.starting_inventory - item.current_inventory,
      remaining: item.current_inventory,
      stock_percentage: item.starting_inventory > 0 
        ? (item.current_inventory / item.starting_inventory) * 100 
        : 0
    }));

    setUsageAnalytics(analytics);
  };

  const subscribeToInventoryChanges = () => {
    const channel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'menu_items',
          filter: `event_id=eq.${selectedEvent}`
        },
        () => {
          fetchMenuItems();
          fetchUsageAnalytics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleAdjustInventory = async () => {
    if (!selectedItem || adjustmentReason.trim() === "") {
      toast.error("Please provide a reason for the adjustment");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    // Update inventory
    const { error: updateError } = await supabase
      .from("menu_items")
      .update({ current_inventory: newQuantity })
      .eq("id", selectedItem.id);

    if (updateError) {
      toast.error("Failed to adjust inventory");
      return;
    }

    // Log adjustment
    const { error: logError } = await supabase
      .from("audit_logs")
      .insert({
        action: "inventory_adjustment",
        resource_type: "menu_item",
        resource_id: selectedItem.id,
        tenant_id: profile.tenant_id,
        user_id: user.id,
        details: {
          item_name: selectedItem.name,
          old_quantity: selectedItem.current_inventory,
          new_quantity: newQuantity,
          reason: adjustmentReason
        }
      });

    if (logError) {
      console.error("Failed to log adjustment:", logError);
    }

    toast.success("Inventory adjusted successfully");
    setAdjustmentDialog(false);
    setSelectedItem(null);
    setNewQuantity(0);
    setAdjustmentReason("");
    fetchMenuItems();
    fetchAdjustmentHistory();
    fetchUsageAnalytics();
  };

  const openAdjustmentDialog = (item: MenuItem) => {
    setSelectedItem(item);
    setNewQuantity(item.current_inventory);
    setAdjustmentDialog(true);
  };

  const getLowStockItems = () => {
    return menuItems.filter(item => {
      const stockPercentage = item.starting_inventory > 0 
        ? (item.current_inventory / item.starting_inventory) * 100 
        : 0;
      return stockPercentage < 20 && stockPercentage > 0;
    });
  };

  const getOutOfStockItems = () => {
    return menuItems.filter(item => item.current_inventory === 0);
  };

  const getReorderSuggestions = () => {
    return usageAnalytics
      .filter(item => item.stock_percentage < 30 && item.remaining > 0)
      .sort((a, b) => a.stock_percentage - b.stock_percentage)
      .slice(0, 10);
  };

  const groupedItems = menuItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  const lowStockItems = getLowStockItems();
  const outOfStockItems = getOutOfStockItems();
  const reorderSuggestions = getReorderSuggestions();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground">Track stock levels, adjustments, and usage analytics</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{lowStockItems.length}</div>
            <p className="text-xs text-muted-foreground">Items below 20% stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            <PackageSearch className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{outOfStockItems.length}</div>
            <p className="text-xs text-muted-foreground">Items depleted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reorder Soon</CardTitle>
            <TrendingDown className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{reorderSuggestions.length}</div>
            <p className="text-xs text-muted-foreground">Suggested for reorder</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <History className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{menuItems.length}</div>
            <p className="text-xs text-muted-foreground">In current event</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory">Current Inventory</TabsTrigger>
          <TabsTrigger value="analytics">Usage Analytics</TabsTrigger>
          <TabsTrigger value="reorder">Reorder Suggestions</TabsTrigger>
          <TabsTrigger value="history">Adjustment History</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inventory by Category</CardTitle>
              <CardDescription>Adjust stock levels and track availability</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                {Object.entries(groupedItems).map(([category, items]) => (
                  <div key={category} className="mb-6">
                    <h3 className="font-semibold text-lg mb-3 capitalize">{category}</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Starting</TableHead>
                          <TableHead>Current</TableHead>
                          <TableHead>Sold</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => {
                          const sold = item.starting_inventory - item.current_inventory;
                          const stockPercentage = item.starting_inventory > 0 
                            ? (item.current_inventory / item.starting_inventory) * 100 
                            : 0;
                          
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell>{item.starting_inventory}</TableCell>
                              <TableCell>{item.current_inventory}</TableCell>
                              <TableCell>{sold}</TableCell>
                              <TableCell>
                                {stockPercentage === 0 ? (
                                  <Badge variant="destructive">Out of Stock</Badge>
                                ) : stockPercentage < 20 ? (
                                  <Badge variant="destructive">Low Stock</Badge>
                                ) : stockPercentage < 50 ? (
                                  <Badge className="bg-yellow-500">Medium</Badge>
                                ) : (
                                  <Badge className="bg-green-500">In Stock</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openAdjustmentDialog(item)}
                                >
                                  Adjust
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage Analytics</CardTitle>
              <CardDescription>Sales performance by item and category</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Total Sold</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Stock %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageAnalytics
                      .sort((a, b) => b.total_sold - a.total_sold)
                      .map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.item_name}</TableCell>
                          <TableCell className="capitalize">{item.category}</TableCell>
                          <TableCell>{item.total_sold}</TableCell>
                          <TableCell>{item.remaining}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-full max-w-[100px] bg-muted rounded-full h-2">
                                <div
                                  className="bg-primary h-2 rounded-full"
                                  style={{ width: `${Math.min(item.stock_percentage, 100)}%` }}
                                />
                              </div>
                              <span className="text-sm">{item.stock_percentage.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reorder" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reorder Suggestions</CardTitle>
              <CardDescription>Items running low that need restocking</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Stock %</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reorderSuggestions.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      <TableCell className="capitalize">{item.category}</TableCell>
                      <TableCell>{item.remaining}</TableCell>
                      <TableCell>{item.stock_percentage.toFixed(0)}%</TableCell>
                      <TableCell>
                        {item.stock_percentage < 10 ? (
                          <Badge variant="destructive">Urgent</Badge>
                        ) : item.stock_percentage < 20 ? (
                          <Badge className="bg-orange-500">High</Badge>
                        ) : (
                          <Badge className="bg-yellow-500">Medium</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Adjustment History</CardTitle>
              <CardDescription>Recent inventory adjustments and audit logs</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Old Qty</TableHead>
                      <TableHead>New Qty</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustmentHistory.map((adjustment) => {
                      const change = adjustment.details.new_quantity - adjustment.details.old_quantity;
                      return (
                        <TableRow key={adjustment.id}>
                          <TableCell>
                            {new Date(adjustment.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-medium">
                            {adjustment.details.item_name}
                          </TableCell>
                          <TableCell>{adjustment.details.old_quantity}</TableCell>
                          <TableCell>{adjustment.details.new_quantity}</TableCell>
                          <TableCell>
                            <span className={change >= 0 ? "text-green-500" : "text-destructive"}>
                              {change >= 0 ? "+" : ""}{change}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate">
                            {adjustment.details.reason}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={adjustmentDialog} onOpenChange={setAdjustmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Inventory</DialogTitle>
            <DialogDescription>
              Update stock level for {selectedItem?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Current Stock: {selectedItem?.current_inventory}</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newQuantity">New Quantity</Label>
              <Input
                id="newQuantity"
                type="number"
                min="0"
                value={newQuantity}
                onChange={(e) => setNewQuantity(parseInt(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Adjustment *</Label>
              <Textarea
                id="reason"
                placeholder="e.g., Physical count correction, damaged items, restocking..."
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdjustInventory}>Save Adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
