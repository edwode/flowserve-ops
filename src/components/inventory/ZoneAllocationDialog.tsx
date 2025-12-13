import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";

interface Zone {
  id: string;
  name: string;
  color: string;
}

interface ZoneAllocation {
  zone_id: string;
  allocated_quantity: number;
}

interface ZoneAllocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItem: {
    id: string;
    name: string;
    current_inventory: number;
    event_id: string;
  } | null;
  eventId: string;
  onAllocationComplete: () => void;
}

export function ZoneAllocationDialog({
  open,
  onOpenChange,
  menuItem,
  eventId,
  onAllocationComplete
}: ZoneAllocationDialogProps) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [existingAllocations, setExistingAllocations] = useState<ZoneAllocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && eventId && menuItem) {
      fetchZonesAndAllocations();
    }
  }, [open, eventId, menuItem?.id]);

  const fetchZonesAndAllocations = async () => {
    setIsLoading(true);
    
    // Fetch zones for the event
    const { data: zonesData, error: zonesError } = await supabase
      .from("zones")
      .select("id, name, color")
      .eq("event_id", eventId)
      .order("name");

    if (zonesError) {
      toast.error("Failed to load zones");
      setIsLoading(false);
      return;
    }

    setZones(zonesData || []);

    // Fetch existing allocations for this menu item
    if (menuItem) {
      const { data: allocData, error: allocError } = await supabase
        .from("inventory_zone_allocations")
        .select("zone_id, allocated_quantity")
        .eq("menu_item_id", menuItem.id);

      if (!allocError && allocData) {
        setExistingAllocations(allocData);
        const allocMap: Record<string, number> = {};
        allocData.forEach(a => {
          allocMap[a.zone_id] = a.allocated_quantity;
        });
        setAllocations(allocMap);
      } else {
        setAllocations({});
        setExistingAllocations([]);
      }
    }

    setIsLoading(false);
  };

  const handleAllocationChange = (zoneId: string, value: number) => {
    setAllocations(prev => ({
      ...prev,
      [zoneId]: Math.max(0, value)
    }));
  };

  const getTotalAllocated = () => {
    return Object.values(allocations).reduce((sum, qty) => sum + qty, 0);
  };

  const getUnallocated = () => {
    return (menuItem?.current_inventory || 0) - getTotalAllocated();
  };

  const handleSave = async () => {
    if (!menuItem) return;

    const totalAllocated = getTotalAllocated();
    if (totalAllocated > menuItem.current_inventory) {
      toast.error("Total allocation exceeds available inventory");
      return;
    }

    setIsSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Authentication required");
      setIsSaving(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      toast.error("Profile not found");
      setIsSaving(false);
      return;
    }

    // Upsert allocations for each zone
    for (const zone of zones) {
      const quantity = allocations[zone.id] || 0;
      
      const { error } = await supabase
        .from("inventory_zone_allocations")
        .upsert({
          menu_item_id: menuItem.id,
          zone_id: zone.id,
          allocated_quantity: quantity,
          tenant_id: profile.tenant_id,
          event_id: eventId
        }, {
          onConflict: "menu_item_id,zone_id"
        });

      if (error) {
        console.error("Failed to save allocation:", error);
        toast.error(`Failed to save allocation for ${zone.name}`);
        setIsSaving(false);
        return;
      }
    }

    toast.success("Zone allocations saved successfully");
    setIsSaving(false);
    onAllocationComplete();
    onOpenChange(false);
  };

  if (!menuItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Zone Allocation
          </DialogTitle>
          <DialogDescription>
            Allocate stock for <strong>{menuItem.name}</strong> across zones
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : zones.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No zones created for this event.</p>
            <p className="text-sm">Create zones first to allocate inventory.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">Total Inventory:</span>
              <Badge variant="outline">{menuItem.current_inventory}</Badge>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {zones.map((zone) => (
                <div key={zone.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: zone.color || "#6B7280" }}
                  />
                  <Label className="flex-1 font-medium">{zone.name}</Label>
                  <Input
                    type="number"
                    min="0"
                    className="w-24"
                    value={allocations[zone.id] || 0}
                    onChange={(e) => handleAllocationChange(zone.id, parseInt(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">Unallocated:</span>
              <Badge 
                variant={getUnallocated() < 0 ? "destructive" : "outline"}
                className={getUnallocated() < 0 ? "" : getUnallocated() > 0 ? "bg-yellow-100 text-yellow-800 border-yellow-300" : ""}
              >
                {getUnallocated()}
              </Badge>
            </div>

            {getUnallocated() < 0 && (
              <p className="text-sm text-destructive">
                Total allocation exceeds available inventory by {Math.abs(getUnallocated())} units.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || isLoading || zones.length === 0 || getUnallocated() < 0}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Allocations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
