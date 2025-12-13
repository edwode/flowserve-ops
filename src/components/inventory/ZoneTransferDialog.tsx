import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ArrowRight, Repeat } from "lucide-react";

interface Zone {
  id: string;
  name: string;
  color: string;
}

interface ZoneAllocation {
  zone_id: string;
  allocated_quantity: number;
}

interface ZoneTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItem: {
    id: string;
    name: string;
    current_inventory: number;
    event_id: string;
  } | null;
  eventId: string;
  onTransferComplete: () => void;
}

export function ZoneTransferDialog({
  open,
  onOpenChange,
  menuItem,
  eventId,
  onTransferComplete
}: ZoneTransferDialogProps) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [fromZoneId, setFromZoneId] = useState("");
  const [toZoneId, setToZoneId] = useState("");
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  useEffect(() => {
    if (open && eventId && menuItem) {
      fetchZonesAndAllocations();
      setFromZoneId("");
      setToZoneId("");
      setTransferQuantity(0);
      setReason("");
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
        const allocMap: Record<string, number> = {};
        allocData.forEach(a => {
          allocMap[a.zone_id] = a.allocated_quantity;
        });
        setAllocations(allocMap);
      } else {
        setAllocations({});
      }
    }

    setIsLoading(false);
  };

  const getMaxTransferQuantity = () => {
    return allocations[fromZoneId] || 0;
  };

  const handleTransfer = async () => {
    if (!menuItem || !fromZoneId || !toZoneId) {
      toast.error("Please select both zones");
      return;
    }

    if (fromZoneId === toZoneId) {
      toast.error("Cannot transfer to the same zone");
      return;
    }

    if (transferQuantity <= 0) {
      toast.error("Transfer quantity must be greater than 0");
      return;
    }

    if (transferQuantity > getMaxTransferQuantity()) {
      toast.error("Transfer quantity exceeds available stock in source zone");
      return;
    }

    setIsTransferring(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Authentication required");
      setIsTransferring(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      toast.error("Profile not found");
      setIsTransferring(false);
      return;
    }

    // Update source zone allocation (decrease)
    const newFromQuantity = (allocations[fromZoneId] || 0) - transferQuantity;
    const { error: fromError } = await supabase
      .from("inventory_zone_allocations")
      .upsert({
        menu_item_id: menuItem.id,
        zone_id: fromZoneId,
        allocated_quantity: newFromQuantity,
        tenant_id: profile.tenant_id,
        event_id: eventId
      }, {
        onConflict: "menu_item_id,zone_id"
      });

    if (fromError) {
      toast.error("Failed to update source zone");
      setIsTransferring(false);
      return;
    }

    // Update destination zone allocation (increase)
    const newToQuantity = (allocations[toZoneId] || 0) + transferQuantity;
    const { error: toError } = await supabase
      .from("inventory_zone_allocations")
      .upsert({
        menu_item_id: menuItem.id,
        zone_id: toZoneId,
        allocated_quantity: newToQuantity,
        tenant_id: profile.tenant_id,
        event_id: eventId
      }, {
        onConflict: "menu_item_id,zone_id"
      });

    if (toError) {
      toast.error("Failed to update destination zone");
      setIsTransferring(false);
      return;
    }

    // Log the transfer
    const { error: logError } = await supabase
      .from("inventory_zone_transfers")
      .insert({
        menu_item_id: menuItem.id,
        from_zone_id: fromZoneId,
        to_zone_id: toZoneId,
        quantity: transferQuantity,
        transferred_by: user.id,
        reason: reason || null,
        tenant_id: profile.tenant_id,
        event_id: eventId
      });

    if (logError) {
      console.error("Failed to log transfer:", logError);
    }

    const fromZone = zones.find(z => z.id === fromZoneId);
    const toZone = zones.find(z => z.id === toZoneId);
    toast.success(`Transferred ${transferQuantity} units from ${fromZone?.name} to ${toZone?.name}`);
    
    setIsTransferring(false);
    onTransferComplete();
    onOpenChange(false);
  };

  if (!menuItem) return null;

  const fromZone = zones.find(z => z.id === fromZoneId);
  const toZone = zones.find(z => z.id === toZoneId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Transfer Stock Between Zones
          </DialogTitle>
          <DialogDescription>
            Move stock for <strong>{menuItem.name}</strong> between zones
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : zones.length < 2 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>At least 2 zones are required for transfers.</p>
            <p className="text-sm">Create more zones to enable stock transfers.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Zone stock overview */}
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium mb-2">Current Zone Stock:</p>
              <div className="grid grid-cols-2 gap-2">
                {zones.map((zone) => (
                  <div key={zone.id} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: zone.color || "#6B7280" }}
                    />
                    <span className="truncate">{zone.name}:</span>
                    <Badge variant="outline" className="ml-auto">{allocations[zone.id] || 0}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* From Zone */}
            <div className="space-y-2">
              <Label>From Zone</Label>
              <Select value={fromZoneId} onValueChange={setFromZoneId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source zone" />
                </SelectTrigger>
                <SelectContent>
                  {zones.filter(z => (allocations[z.id] || 0) > 0).map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: zone.color || "#6B7280" }}
                        />
                        {zone.name} ({allocations[zone.id] || 0} available)
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Transfer Arrow */}
            {fromZoneId && (
              <div className="flex justify-center">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>
            )}

            {/* To Zone */}
            <div className="space-y-2">
              <Label>To Zone</Label>
              <Select value={toZoneId} onValueChange={setToZoneId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination zone" />
                </SelectTrigger>
                <SelectContent>
                  {zones.filter(z => z.id !== fromZoneId).map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: zone.color || "#6B7280" }}
                        />
                        {zone.name} ({allocations[zone.id] || 0} current)
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label>Quantity to Transfer</Label>
              <Input
                type="number"
                min="0"
                max={getMaxTransferQuantity()}
                value={transferQuantity}
                onChange={(e) => setTransferQuantity(parseInt(e.target.value) || 0)}
              />
              {fromZoneId && (
                <p className="text-xs text-muted-foreground">
                  Max: {getMaxTransferQuantity()} units available
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="e.g., Rebalancing stock, high demand in target zone..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>

            {/* Transfer Preview */}
            {fromZoneId && toZoneId && transferQuantity > 0 && (
              <div className="p-3 bg-primary/10 rounded-lg text-sm">
                <p className="font-medium">Transfer Preview:</p>
                <p className="text-muted-foreground">
                  {fromZone?.name}: {allocations[fromZoneId] || 0} → {(allocations[fromZoneId] || 0) - transferQuantity}
                </p>
                <p className="text-muted-foreground">
                  {toZone?.name}: {allocations[toZoneId] || 0} → {(allocations[toZoneId] || 0) + transferQuantity}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleTransfer} 
            disabled={
              isTransferring || 
              isLoading || 
              zones.length < 2 || 
              !fromZoneId || 
              !toZoneId || 
              transferQuantity <= 0 ||
              transferQuantity > getMaxTransferQuantity()
            }
          >
            {isTransferring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Transfer Stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
