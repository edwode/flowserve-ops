import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  station_type: string;
  is_available: boolean;
  starting_inventory: number | null;
  current_inventory: number | null;
  event_id: string | null;
}

interface Event {
  id: string;
  name: string;
}

export function AdminMenu() {
  const { toast } = useToast();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: "",
    station_type: "drink_dispenser" as "drink_dispenser" | "meal_dispenser" | "mixologist" | "bar",
    starting_inventory: "",
    event_id: "",
  });

  useEffect(() => {
    fetchEvents();
    fetchMenuItems();
  }, []);

  useEffect(() => {
    fetchMenuItems();
  }, [selectedEvent]);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, name')
        .eq('is_active', true)
        .order('event_date', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading events",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchMenuItems = async () => {
    try {
      let query = supabase
        .from('menu_items')
        .select('*')
        .order('category', { ascending: true });

      if (selectedEvent !== "all") {
        query = query.eq('event_id', selectedEvent);
      }

      const { data, error } = await query;

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading menu items",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleOpenDialog = (item?: MenuItem) => {
    console.log("handleOpenDialog called", { item });

    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        category: item.category,
        price: item.price.toString(),
        station_type: item.station_type as any,
        starting_inventory: item.starting_inventory?.toString() || "",
        event_id: item.event_id || "",
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: "",
        category: "",
        price: "",
        station_type: "drink_dispenser",
        starting_inventory: "",
        event_id: "",
      });
    }

    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      console.log('Starting handleSave with formData:', formData);
      
      // Validate required fields
      if (!formData.name || !formData.category || !formData.price) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields (name, category, and price)",
          variant: "destructive",
        });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user?.id);
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to create menu items",
          variant: "destructive",
        });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      console.log('Profile data:', profile, 'Error:', profileError);

      if (profileError || !profile?.tenant_id) {
        toast({
          title: "Profile Error",
          description: "Unable to find your tenant information. Please contact support.",
          variant: "destructive",
        });
        return;
      }

      const itemData = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        price: parseFloat(formData.price),
        station_type: formData.station_type,
        starting_inventory: formData.starting_inventory ? parseInt(formData.starting_inventory) : null,
        current_inventory: formData.starting_inventory ? parseInt(formData.starting_inventory) : null,
        event_id: formData.event_id || null,
        tenant_id: profile.tenant_id,
        is_available: true,
        ...(editingItem ? { updated_by: user.id } : { created_by: user.id }),
      };

      console.log('Attempting to save item:', itemData);

      if (editingItem) {
        const { data, error } = await supabase
          .from('menu_items')
          .update(itemData)
          .eq('id', editingItem.id)
          .select();

        console.log('Update result:', data, 'Error:', error);

        if (error) throw error;
        toast({ 
          title: "Success",
          description: "Menu item updated successfully" 
        });
      } else {
        const { data, error } = await supabase
          .from('menu_items')
          .insert(itemData)
          .select();

        console.log('Insert result:', data, 'Error:', error);

        if (error) throw error;
        toast({ 
          title: "Success",
          description: "Menu item created successfully" 
        });
      }

      setDialogOpen(false);
      await fetchMenuItems();
    } catch (error: any) {
      console.error('Error in handleSave:', error);
      toast({
        title: "Error saving menu item",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const groupedItems = menuItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setEditingItem(null);
          setFormData({
            name: "",
            category: "",
            price: "",
            station_type: "drink_dispenser",
            starting_inventory: "",
            event_id: "",
          });
        }
      }}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Menu Items</h2>
            <p className="text-muted-foreground">Manage menu items and inventory</p>
          </div>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              New Item
            </Button>
          </DialogTrigger>
        </div>

        <Tabs value={selectedEvent} onValueChange={setSelectedEvent}>
          <TabsList>
            <TabsTrigger value="all">All Events</TabsTrigger>
            {events.map((event) => (
              <TabsTrigger key={event.id} value={event.id}>
                {event.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={selectedEvent} className="space-y-4 mt-6">
            {Object.entries(groupedItems).map(([category, items]) => (
              <Card key={category} className="p-4">
                <h3 className="font-semibold text-lg mb-3">{category}</h3>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <Card key={item.id} className="p-3 border">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-sm text-muted-foreground">
                              ${item.price.toFixed(2)}
                            </div>
                          </div>
                          <Badge variant={item.is_available ? "default" : "secondary"}>
                            {item.is_available ? "Available" : "Unavailable"}
                          </Badge>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Station: {item.station_type.replace("_", " ")}
                        </div>

                        {item.starting_inventory && (
                          <div className="text-xs text-muted-foreground">
                            Inventory: {item.current_inventory} / {item.starting_inventory}
                          </div>
                        )}

                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => handleOpenDialog(item)}
                          >
                            <Edit className="mr-2 h-3 w-3" />
                            Edit
                          </Button>
                        </DialogTrigger>
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            ))}

            {Object.keys(groupedItems).length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No menu items yet</p>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Menu Item Dialog */}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Create Menu Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update menu item details" : "Add a new item to your menu"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Item Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Coca Cola"
              />
            </div>

            <div className="space-y-2">
              <Label>Category *</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Drinks, Meals, Cocktails, etc."
              />
            </div>

            <div className="space-y-2">
              <Label>Price *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="5.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Station Type *</Label>
              <Select
                value={formData.station_type}
                onValueChange={(value: any) => setFormData((prev) => ({ ...prev, station_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drink_dispenser">Drink Dispenser</SelectItem>
                  <SelectItem value="meal_dispenser">Meal Dispenser</SelectItem>
                  <SelectItem value="mixologist">Mixologist</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Event (Optional)</Label>
              <Select
                value={formData.event_id}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, event_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Events</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Starting Inventory (Optional)</Label>
              <Input
                type="number"
                value={formData.starting_inventory}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, starting_inventory: e.target.value }))
                }
                placeholder="100"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name || !formData.category || !formData.price}
            >
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </div>
    </Dialog>
  );
}
