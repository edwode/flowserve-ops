-- Create table for tracking inventory allocations per zone
CREATE TABLE public.inventory_zone_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  allocated_quantity INTEGER NOT NULL DEFAULT 0,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  event_id UUID NOT NULL REFERENCES public.events(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, zone_id)
);

-- Create table for tracking zone transfers
CREATE TABLE public.inventory_zone_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  from_zone_id UUID NOT NULL REFERENCES public.zones(id),
  to_zone_id UUID NOT NULL REFERENCES public.zones(id),
  quantity INTEGER NOT NULL,
  transferred_by UUID REFERENCES public.profiles(id),
  reason TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  event_id UUID NOT NULL REFERENCES public.events(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_zone_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_zone_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for inventory_zone_allocations
CREATE POLICY "Users can view allocations in their tenant"
ON public.inventory_zone_allocations
FOR SELECT
USING (tenant_id = get_user_tenant(auth.uid()));

CREATE POLICY "Admins can manage allocations"
ON public.inventory_zone_allocations
FOR ALL
USING (tenant_id = get_user_tenant(auth.uid()) AND has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role));

-- RLS policies for inventory_zone_transfers
CREATE POLICY "Users can view transfers in their tenant"
ON public.inventory_zone_transfers
FOR SELECT
USING (tenant_id = get_user_tenant(auth.uid()));

CREATE POLICY "Admins can create transfers"
ON public.inventory_zone_transfers
FOR INSERT
WITH CHECK (tenant_id = get_user_tenant(auth.uid()) AND has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_inventory_zone_allocations_menu_item ON public.inventory_zone_allocations(menu_item_id);
CREATE INDEX idx_inventory_zone_allocations_zone ON public.inventory_zone_allocations(zone_id);
CREATE INDEX idx_inventory_zone_allocations_event ON public.inventory_zone_allocations(event_id);
CREATE INDEX idx_inventory_zone_transfers_menu_item ON public.inventory_zone_transfers(menu_item_id);
CREATE INDEX idx_inventory_zone_transfers_event ON public.inventory_zone_transfers(event_id);

-- Create trigger for updated_at
CREATE TRIGGER update_inventory_zone_allocations_updated_at
BEFORE UPDATE ON public.inventory_zone_allocations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();