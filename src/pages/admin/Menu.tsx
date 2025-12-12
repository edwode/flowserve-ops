import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Settings, Trash2, Archive, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  station_type: string;
  is_available: boolean;
  is_retired: boolean;
  starting_inventory: number | null;
  current_inventory: number | null;
  event_id: string | null;
  has_orders?: boolean;
}

interface Event {
  id: string;
  name: string;
}

interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
}

export function AdminMenu() {
  const { toast } = useToast();
  const { formatPrice } = useTenantCurrency();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [showRetired, setShowRetired] = useState(false);
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

  // Category management state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [categoryFormData, setCategoryFormData] = useState({
    name: "",
    description: "",
    display_order: "0",
  });
  const [deleteCategoryDialogOpen, setDeleteCategoryDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<MenuCategory | null>(null);

  // Delete/Retire menu item state
  const [deleteItemDialogOpen, setDeleteItemDialogOpen] = useState(false);
  const [retireItemDialogOpen, setRetireItemDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [itemHasOrders, setItemHasOrders] = useState(false);

  useEffect(() => {
    fetchEvents();
    fetchMenuItems();
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchMenuItems();
  }, [selectedEvent, showRetired]);

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

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('menu_categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading categories",
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

      // Filter by retired status
      if (!showRetired) {
        query = query.eq('is_retired', false);
      } else {
        query = query.eq('is_retired', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Check which items have orders
      if (data && data.length > 0) {
        const itemIds = data.map(item => item.id);
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('menu_item_id')
          .in('menu_item_id', itemIds);
        
        const itemsWithOrders = new Set(orderItems?.map(oi => oi.menu_item_id) || []);
        
        const itemsWithOrderFlag = data.map(item => ({
          ...item,
          has_orders: itemsWithOrders.has(item.id)
        }));
        
        setMenuItems(itemsWithOrderFlag);
      } else {
        setMenuItems([]);
      }
    } catch (error: any) {
      toast({
        title: "Error loading menu items",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const checkItemHasOrders = async (itemId: string): Promise<boolean> => {
    const { count, error } = await supabase
      .from('order_items')
      .select('*', { count: 'exact', head: true })
      .eq('menu_item_id', itemId);

    if (error) return true; // Assume has orders on error to be safe
    return (count || 0) > 0;
  };

  const handleDeleteOrRetire = async (item: MenuItem) => {
    const hasOrders = await checkItemHasOrders(item.id);
    setItemToDelete(item);
    setItemHasOrders(hasOrders);
    
    if (hasOrders) {
      setRetireItemDialogOpen(true);
    } else {
      setDeleteItemDialogOpen(true);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) throw error;
      toast({ title: "Menu item deleted successfully" });
      setDeleteItemDialogOpen(false);
      setItemToDelete(null);
      await fetchMenuItems();
    } catch (error: any) {
      toast({
        title: "Error deleting menu item",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRetireItem = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_retired: true, is_available: false })
        .eq('id', itemToDelete.id);

      if (error) throw error;
      toast({ title: "Menu item retired successfully" });
      setRetireItemDialogOpen(false);
      setItemToDelete(null);
      await fetchMenuItems();
    } catch (error: any) {
      toast({
        title: "Error retiring menu item",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRestoreItem = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_retired: false })
        .eq('id', item.id);

      if (error) throw error;
      toast({ title: "Menu item restored successfully" });
      await fetchMenuItems();
    } catch (error: any) {
      toast({
        title: "Error restoring menu item",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleOpenDialog = (item?: MenuItem) => {
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
      if (!formData.name || !formData.category || !formData.price) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields (name, category, and price)",
          variant: "destructive",
        });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
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
        event_id: formData.event_id && formData.event_id !== "all" ? formData.event_id : null,
        tenant_id: profile.tenant_id,
        is_available: true,
        ...(editingItem ? { updated_by: user.id } : { created_by: user.id }),
      };

      if (editingItem) {
        const { error } = await supabase
          .from('menu_items')
          .update(itemData)
          .eq('id', editingItem.id);

        if (error) throw error;
        toast({ 
          title: "Success",
          description: "Menu item updated successfully" 
        });
      } else {
        const { error } = await supabase
          .from('menu_items')
          .insert(itemData);

        if (error) throw error;
        toast({ 
          title: "Success",
          description: "Menu item created successfully" 
        });
      }

      setDialogOpen(false);
      await fetchMenuItems();
    } catch (error: any) {
      toast({
        title: "Error saving menu item",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  // Category management functions
  const handleOpenCategoryDialog = (category?: MenuCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryFormData({
        name: category.name,
        description: category.description || "",
        display_order: category.display_order.toString(),
      });
    } else {
      setEditingCategory(null);
      setCategoryFormData({
        name: "",
        description: "",
        display_order: "0",
      });
    }
    setCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    try {
      if (!categoryFormData.name) {
        toast({
          title: "Validation Error",
          description: "Category name is required",
          variant: "destructive",
        });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in",
          variant: "destructive",
        });
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) {
        toast({
          title: "Profile Error",
          description: "Unable to find your tenant information",
          variant: "destructive",
        });
        return;
      }

      const categoryData = {
        name: categoryFormData.name.trim(),
        description: categoryFormData.description.trim() || null,
        display_order: parseInt(categoryFormData.display_order) || 0,
        tenant_id: profile.tenant_id,
      };

      if (editingCategory) {
        const { error } = await supabase
          .from('menu_categories')
          .update(categoryData)
          .eq('id', editingCategory.id);

        if (error) throw error;
        toast({ title: "Category updated successfully" });
      } else {
        const { error } = await supabase
          .from('menu_categories')
          .insert(categoryData);

        if (error) throw error;
        toast({ title: "Category created successfully" });
      }

      setCategoryDialogOpen(false);
      await fetchCategories();
    } catch (error: any) {
      toast({
        title: "Error saving category",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;

    try {
      const { error } = await supabase
        .from('menu_categories')
        .delete()
        .eq('id', categoryToDelete.id);

      if (error) throw error;
      toast({ title: "Category deleted successfully" });
      setDeleteCategoryDialogOpen(false);
      setCategoryToDelete(null);
      await fetchCategories();
    } catch (error: any) {
      toast({
        title: "Error deleting category",
        description: error.message,
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Menu Items</h2>
          <p className="text-muted-foreground">Manage menu items and inventory</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={showRetired ? "default" : "outline"} 
            onClick={() => setShowRetired(!showRetired)}
          >
            {showRetired ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
            {showRetired ? "Viewing Retired" : "Show Retired"}
          </Button>
          <Button variant="outline" onClick={() => handleOpenCategoryDialog()}>
            <Settings className="mr-2 h-4 w-4" />
            Manage Categories
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            New Item
          </Button>
        </div>
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
                            {formatPrice(item.price)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.is_retired && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Retired
                            </Badge>
                          )}
                          <Badge variant={item.is_available ? "default" : "secondary"}>
                            {item.is_available ? "Available" : "Unavailable"}
                          </Badge>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Station: {item.station_type.replace("_", " ")}
                      </div>

                      {item.starting_inventory && (
                        <div className="text-xs text-muted-foreground">
                          Inventory: {item.current_inventory} / {item.starting_inventory}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleOpenDialog(item)}
                        >
                          <Edit className="mr-2 h-3 w-3" />
                          Edit
                        </Button>
                        {showRetired ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestoreItem(item)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        ) : item.has_orders ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setItemToDelete(item);
                              setRetireItemDialogOpen(true);
                            }}
                            title="Retire item (has associated orders)"
                          >
                            <Archive className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setItemToDelete(item);
                              setDeleteItemDialogOpen(true);
                            }}
                            title="Delete item"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
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
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Menu Item" : "Create Menu Item"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update menu item details"
                : "Add a new item to your menu"}
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
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.name}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No categories yet. <button 
                    type="button" 
                    className="text-primary underline"
                    onClick={() => handleOpenCategoryDialog()}
                  >
                    Create one
                  </button>
                </p>
              )}
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
                onValueChange={(value: any) =>
                  setFormData((prev) => ({ ...prev, station_type: value }))
                }
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
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, event_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select event" />
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

            <div className="space-y-2">
              <Label>Starting Inventory (Optional)</Label>
              <Input
                type="number"
                value={formData.starting_inventory}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    starting_inventory: e.target.value,
                  }))
                }
                placeholder="100"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setEditingItem(null);
              }}
            >
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
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Edit Category" : "Manage Categories"}
            </DialogTitle>
            <DialogDescription>
              {editingCategory ? "Update category details" : "Add or manage menu categories"}
            </DialogDescription>
          </DialogHeader>

          {!editingCategory && categories.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center justify-between p-2 border rounded-md">
                  <div>
                    <span className="font-medium">{category.name}</span>
                    {category.description && (
                      <p className="text-xs text-muted-foreground">{category.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenCategoryDialog(category)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCategoryToDelete(category);
                        setDeleteCategoryDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-sm">
              {editingCategory ? "Edit Category" : "Add New Category"}
            </h4>
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={categoryFormData.name}
                onChange={(e) => setCategoryFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Drinks, Meals, Cocktails"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={categoryFormData.description}
                onChange={(e) => setCategoryFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                value={categoryFormData.display_order}
                onChange={(e) => setCategoryFormData((prev) => ({ ...prev, display_order: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCategoryDialogOpen(false);
                setEditingCategory(null);
              }}
            >
              {editingCategory ? "Cancel" : "Close"}
            </Button>
            <Button onClick={handleSaveCategory} disabled={!categoryFormData.name}>
              {editingCategory ? "Update" : "Add Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation */}
      <AlertDialog open={deleteCategoryDialogOpen} onOpenChange={setDeleteCategoryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{categoryToDelete?.name}"? This action cannot be undone.
              Note: Menu items using this category will retain their category value.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCategoryToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Menu Item Confirmation */}
      <AlertDialog open={deleteItemDialogOpen} onOpenChange={setDeleteItemDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Menu Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Retire Menu Item Confirmation */}
      <AlertDialog open={retireItemDialogOpen} onOpenChange={setRetireItemDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire Menu Item</AlertDialogTitle>
            <AlertDialogDescription>
              "{itemToDelete?.name}" has associated orders and cannot be deleted. Would you like to retire it instead?
              Retired items are hidden from the menu but preserved for historical records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetireItem}>
              <Archive className="mr-2 h-4 w-4" />
              Retire Item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
