import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, Clock, ArrowRightLeft, Plus, MapPin, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Zone {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

interface Table {
  id: string;
  table_number: string;
  capacity: number;
  status: "available" | "occupied" | "needs_cleaning" | "reserved";
  current_order_id: string | null;
  occupied_at: string | null;
  cleared_at: string | null;
  zone_id: string | null;
  zone?: Zone | null;
  order?: {
    order_number: string;
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

export default function Tables() {
  const [tables, setTables] = useState<Table[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  
  // Add Table state
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("4");
  const [newTableZone, setNewTableZone] = useState<string>("");
  const [addTableOpen, setAddTableOpen] = useState(false);
  
  // Edit Table state
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [editTableNumber, setEditTableNumber] = useState("");
  const [editTableCapacity, setEditTableCapacity] = useState("");
  const [editTableZone, setEditTableZone] = useState("");
  const [editTableOpen, setEditTableOpen] = useState(false);
  
  // Delete Table state
  const [deletingTable, setDeletingTable] = useState<Table | null>(null);
  
  // Add Zone state
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneDescription, setNewZoneDescription] = useState("");
  const [newZoneColor, setNewZoneColor] = useState("#6B7280");
  const [addZoneOpen, setAddZoneOpen] = useState(false);
  
  // Edit Zone state
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [editZoneName, setEditZoneName] = useState("");
  const [editZoneDescription, setEditZoneDescription] = useState("");
  const [editZoneColor, setEditZoneColor] = useState("");
  const [editZoneOpen, setEditZoneOpen] = useState(false);
  
  // Delete Zone state
  const [deletingZone, setDeletingZone] = useState<Zone | null>(null);
  
  // Reassign order state
  const [reassignOrderId, setReassignOrderId] = useState<string | null>(null);
  const [reassignToTable, setReassignToTable] = useState("");
  
  const { toast } = useToast();

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      fetchTables();
      fetchZones();
      subscribeToTables();
    }
    return () => {
      supabase.removeAllChannels();
    };
  }, [selectedEvent]);

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

  const fetchZones = async () => {
    if (!selectedEvent) return;

    const { data, error } = await supabase
      .from("zones")
      .select("*")
      .eq("event_id", selectedEvent)
      .order("name");

    if (error) {
      console.error("Error fetching zones:", error);
      return;
    }

    setZones(data || []);
  };

  const fetchTables = async () => {
    if (!selectedEvent) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("tables")
      .select(
        `
        *,
        zone:zones (
          id,
          name,
          description,
          color
        ),
        order:orders!current_order_id (
          order_number,
          guest_name,
          waiter:profiles!waiter_id (
            full_name
          )
        )
      `
      )
      .eq("event_id", selectedEvent)
      .order("table_number");

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch tables",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    setTables((data || []) as Table[]);
    setLoading(false);
  };

  const subscribeToTables = () => {
    const channel = supabase
      .channel("tables-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tables",
          filter: `event_id=eq.${selectedEvent}`,
        },
        () => {
          fetchTables();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-500";
      case "occupied":
        return "bg-red-500";
      case "needs_cleaning":
        return "bg-yellow-500";
      case "reserved":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace("_", " ").toUpperCase();
  };

  const getTurnoverTime = (occupiedAt: string | null, clearedAt: string | null) => {
    if (!occupiedAt) return null;
    
    const endTime = clearedAt ? new Date(clearedAt) : new Date();
    const startTime = new Date(occupiedAt);
    const diffMs = endTime.getTime() - startTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    return `${diffMins} min`;
  };

  // ===== Zone CRUD =====
  const addZone = async () => {
    if (!newZoneName.trim() || !selectedEvent) return;

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", session.session.user.id)
      .single();

    if (!profile?.tenant_id) return;

    const { error } = await supabase.from("zones").insert({
      tenant_id: profile.tenant_id,
      event_id: selectedEvent,
      name: newZoneName.trim(),
      description: newZoneDescription.trim() || null,
      color: newZoneColor,
    });

    if (error) {
      toast({
        title: "Error",
        description: error.code === "23505" ? "Zone name already exists for this event" : "Failed to add zone",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Success", description: "Zone added successfully" });
    setNewZoneName("");
    setNewZoneDescription("");
    setNewZoneColor("#6B7280");
    setAddZoneOpen(false);
    fetchZones();
  };

  const openEditZone = (zone: Zone) => {
    setEditingZone(zone);
    setEditZoneName(zone.name);
    setEditZoneDescription(zone.description || "");
    setEditZoneColor(zone.color);
    setEditZoneOpen(true);
  };

  const updateZone = async () => {
    if (!editingZone || !editZoneName.trim()) return;

    const { error } = await supabase
      .from("zones")
      .update({
        name: editZoneName.trim(),
        description: editZoneDescription.trim() || null,
        color: editZoneColor,
      })
      .eq("id", editingZone.id);

    if (error) {
      toast({
        title: "Error",
        description: error.code === "23505" ? "Zone name already exists" : "Failed to update zone",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Success", description: "Zone updated successfully" });
    setEditZoneOpen(false);
    setEditingZone(null);
    fetchZones();
    fetchTables();
  };

  const deleteZone = async () => {
    if (!deletingZone) return;

    const { error } = await supabase.from("zones").delete().eq("id", deletingZone.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete zone",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Success", description: "Zone deleted successfully" });
    setDeletingZone(null);
    fetchZones();
    fetchTables();
  };

  // ===== Table CRUD =====
  const addTable = async () => {
    if (!newTableNumber.trim() || !selectedEvent) return;

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", session.session.user.id)
      .single();

    if (!profile?.tenant_id) return;

    const { error } = await supabase.from("tables").insert({
      tenant_id: profile.tenant_id,
      event_id: selectedEvent,
      table_number: newTableNumber.trim(),
      capacity: parseInt(newTableCapacity) || 4,
      status: "available",
      zone_id: newTableZone && newTableZone !== "none" ? newTableZone : null,
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to add table",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Success", description: "Table added successfully" });
    setNewTableNumber("");
    setNewTableCapacity("4");
    setNewTableZone("");
    setAddTableOpen(false);
    fetchTables();
  };

  const openEditTable = (table: Table) => {
    setEditingTable(table);
    setEditTableNumber(table.table_number);
    setEditTableCapacity(String(table.capacity));
    setEditTableZone(table.zone_id || "none");
    setEditTableOpen(true);
  };

  const updateTable = async () => {
    if (!editingTable || !editTableNumber.trim()) return;

    const { error } = await supabase
      .from("tables")
      .update({
        table_number: editTableNumber.trim(),
        capacity: parseInt(editTableCapacity) || 4,
        zone_id: editTableZone && editTableZone !== "none" ? editTableZone : null,
      })
      .eq("id", editingTable.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update table",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Success", description: "Table updated successfully" });
    setEditTableOpen(false);
    setEditingTable(null);
    fetchTables();
  };

  const deleteTable = async () => {
    if (!deletingTable) return;

    if (deletingTable.status === "occupied") {
      toast({
        title: "Cannot delete",
        description: "Cannot delete an occupied table. Clear the table first.",
        variant: "destructive",
      });
      setDeletingTable(null);
      return;
    }

    const { error } = await supabase.from("tables").delete().eq("id", deletingTable.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete table",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Success", description: "Table deleted successfully" });
    setDeletingTable(null);
    fetchTables();
  };

  const updateTableStatus = async (tableId: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    
    if (status === "available") {
      updates.current_order_id = null;
      updates.cleared_at = new Date().toISOString();
    } else if (status === "occupied") {
      updates.occupied_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("tables")
      .update(updates)
      .eq("id", tableId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update table status",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Success", description: "Table status updated" });
  };

  const reassignOrder = async () => {
    if (!reassignOrderId || !reassignToTable) return;

    const newTable = tables.find((t) => t.id === reassignToTable);
    if (!newTable) return;

    const { error: orderError } = await supabase
      .from("orders")
      .update({ table_number: newTable.table_number })
      .eq("id", reassignOrderId);

    if (orderError) {
      toast({
        title: "Error",
        description: "Failed to reassign order",
        variant: "destructive",
      });
      return;
    }

    const oldTable = tables.find((t) => t.current_order_id === reassignOrderId);
    if (oldTable) {
      await supabase
        .from("tables")
        .update({ 
          current_order_id: null, 
          status: "needs_cleaning",
          cleared_at: new Date().toISOString()
        })
        .eq("id", oldTable.id);
    }

    await supabase
      .from("tables")
      .update({ 
        current_order_id: reassignOrderId, 
        status: "occupied",
        occupied_at: new Date().toISOString()
      })
      .eq("id", reassignToTable);

    toast({ title: "Success", description: "Order reassigned successfully" });
    setReassignOrderId(null);
    setReassignToTable("");
    fetchTables();
  };

  const occupiedTables = tables.filter((t) => t.status === "occupied").length;
  const avgTurnoverTime = tables
    .filter((t) => t.occupied_at && t.cleared_at)
    .reduce((acc, t) => {
      const time = getTurnoverTime(t.occupied_at, t.cleared_at);
      return acc + (time ? parseInt(time) : 0);
    }, 0) / tables.filter((t) => t.occupied_at && t.cleared_at).length || 0;

  const totalGuests = tables
    .filter((t) => t.status === "occupied")
    .reduce((acc, t) => acc + t.capacity, 0);

  const tablesByZone = tables.reduce((acc, table) => {
    const zoneId = table.zone_id || "unassigned";
    if (!acc[zoneId]) {
      acc[zoneId] = [];
    }
    acc[zoneId].push(table);
    return acc;
  }, {} as Record<string, Table[]>);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Table Management</h1>
        <div className="flex gap-4">
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

          {/* Add Zone Dialog */}
          <Dialog open={addZoneOpen} onOpenChange={setAddZoneOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <MapPin className="w-4 h-4 mr-2" />
                Add Zone
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Zone</DialogTitle>
                <DialogDescription>
                  Create a zone to group tables together
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="zone-name">Zone Name</Label>
                  <Input
                    id="zone-name"
                    value={newZoneName}
                    onChange={(e) => setNewZoneName(e.target.value)}
                    placeholder="e.g., VIP Section, Outdoor Area"
                  />
                </div>
                <div>
                  <Label htmlFor="zone-description">Description (Optional)</Label>
                  <Input
                    id="zone-description"
                    value={newZoneDescription}
                    onChange={(e) => setNewZoneDescription(e.target.value)}
                    placeholder="Brief description"
                  />
                </div>
                <div>
                  <Label htmlFor="zone-color">Color</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="zone-color"
                      type="color"
                      value={newZoneColor}
                      onChange={(e) => setNewZoneColor(e.target.value)}
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <span className="text-sm text-muted-foreground">{newZoneColor}</span>
                  </div>
                </div>
                <Button onClick={addZone} className="w-full">
                  Add Zone
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Table Dialog */}
          <Dialog open={addTableOpen} onOpenChange={setAddTableOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Table
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Table</DialogTitle>
                <DialogDescription>
                  Add a new table to the event
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="table-number">Table Number</Label>
                  <Input
                    id="table-number"
                    value={newTableNumber}
                    onChange={(e) => setNewTableNumber(e.target.value)}
                    placeholder="e.g., T1, A-5"
                  />
                </div>
                <div>
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    value={newTableCapacity}
                    onChange={(e) => setNewTableCapacity(e.target.value)}
                    min="1"
                  />
                </div>
                <div>
                  <Label htmlFor="zone">Zone (Optional)</Label>
                  <Select value={newTableZone} onValueChange={setNewTableZone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a zone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Zone</SelectItem>
                      {zones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: zone.color }}
                            />
                            {zone.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addTable} className="w-full">
                  Add Table
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit Zone Dialog */}
      <Dialog open={editZoneOpen} onOpenChange={setEditZoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Zone</DialogTitle>
            <DialogDescription>
              Update zone details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-zone-name">Zone Name</Label>
              <Input
                id="edit-zone-name"
                value={editZoneName}
                onChange={(e) => setEditZoneName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-zone-description">Description (Optional)</Label>
              <Input
                id="edit-zone-description"
                value={editZoneDescription}
                onChange={(e) => setEditZoneDescription(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-zone-color">Color</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="edit-zone-color"
                  type="color"
                  value={editZoneColor}
                  onChange={(e) => setEditZoneColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{editZoneColor}</span>
              </div>
            </div>
            <Button onClick={updateZone} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Table Dialog */}
      <Dialog open={editTableOpen} onOpenChange={setEditTableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Table</DialogTitle>
            <DialogDescription>
              Update table details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-table-number">Table Number</Label>
              <Input
                id="edit-table-number"
                value={editTableNumber}
                onChange={(e) => setEditTableNumber(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-capacity">Capacity</Label>
              <Input
                id="edit-capacity"
                type="number"
                value={editTableCapacity}
                onChange={(e) => setEditTableCapacity(e.target.value)}
                min="1"
              />
            </div>
            <div>
              <Label htmlFor="edit-zone">Zone</Label>
              <Select value={editTableZone} onValueChange={setEditTableZone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a zone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Zone</SelectItem>
                  {zones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: zone.color }}
                        />
                        {zone.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={updateTable} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Zone Confirmation */}
      <AlertDialog open={!!deletingZone} onOpenChange={(open) => !open && setDeletingZone(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Zone</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingZone?.name}"? Tables in this zone will become unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteZone} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Table Confirmation */}
      <AlertDialog open={!!deletingTable} onOpenChange={(open) => !open && setDeletingTable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Table</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "Table {deletingTable?.table_number}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTable} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Zone Legend with Edit/Delete */}
      {zones.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          {zones.map((zone) => (
            <div key={zone.id} className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full group">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: zone.color }}
              />
              <span className="text-sm font-medium">{zone.name}</span>
              <span className="text-xs text-muted-foreground">
                ({tablesByZone[zone.id]?.length || 0})
              </span>
              <div className="flex gap-1 ml-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => openEditZone(zone)}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  onClick={() => setDeletingZone(zone)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
          {tablesByZone["unassigned"]?.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <span className="text-sm font-medium">Unassigned</span>
              <span className="text-xs text-muted-foreground">
                ({tablesByZone["unassigned"].length})
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupied Tables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {occupiedTables} / {tables.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Guests</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalGuests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Turnover</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgTurnoverTime ? `${Math.round(avgTurnoverTime)} min` : "N/A"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tables.map((table) => (
          <Card key={table.id} className="relative group">
            {table.zone && (
              <div 
                className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
                style={{ backgroundColor: table.zone.color }}
              />
            )}
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl">Table {table.table_number}</CardTitle>
                  {table.zone && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{table.zone.name}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(table.status)}>
                    {getStatusLabel(table.status)}
                  </Badge>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => openEditTable(table)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => setDeletingTable(table)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4" />
                <span>Capacity: {table.capacity}</span>
              </div>

              {table.status === "occupied" && table.order && (
                <>
                  <div className="text-sm">
                    <p className="font-semibold">{table.order.order_number}</p>
                    <p className="text-muted-foreground">{table.order.guest_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Waiter: {table.order.waiter.full_name}
                    </p>
                  </div>
                  {table.occupied_at && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>
                        {formatDistanceToNow(new Date(table.occupied_at), { addSuffix: true })}
                      </span>
                    </div>
                  )}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => setReassignOrderId(table.current_order_id)}
                      >
                        <ArrowRightLeft className="w-4 h-4 mr-2" />
                        Reassign
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reassign Order</DialogTitle>
                        <DialogDescription>
                          Move this order to a different table
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Select Table</Label>
                          <Select value={reassignToTable} onValueChange={setReassignToTable}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose table" />
                            </SelectTrigger>
                            <SelectContent>
                              {tables
                                .filter((t) => t.status === "available" && t.id !== table.id)
                                .map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    Table {t.table_number} (Capacity: {t.capacity})
                                    {t.zone && ` - ${t.zone.name}`}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button onClick={reassignOrder} className="w-full">
                          Confirm Reassignment
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}

              <div className="flex gap-2">
                {table.status !== "available" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateTableStatus(table.id, "available")}
                    className="flex-1"
                  >
                    Clear
                  </Button>
                )}
                {table.status === "available" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateTableStatus(table.id, "reserved")}
                    className="flex-1"
                  >
                    Reserve
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {tables.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tables found. Add tables to get started.</p>
        </div>
      )}
    </div>
  );
}
