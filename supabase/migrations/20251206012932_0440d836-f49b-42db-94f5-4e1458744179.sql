-- Create zones table
CREATE TABLE public.zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);

-- Add zone_id to tables
ALTER TABLE public.tables ADD COLUMN zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL;

-- Enable RLS on zones
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

-- RLS policies for zones
CREATE POLICY "Users can view zones in their tenant"
ON public.zones
FOR SELECT
USING (tenant_id = get_user_tenant(auth.uid()));

CREATE POLICY "Admins can manage zones"
ON public.zones
FOR ALL
USING ((tenant_id = get_user_tenant(auth.uid())) AND has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_zones_updated_at
BEFORE UPDATE ON public.zones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();