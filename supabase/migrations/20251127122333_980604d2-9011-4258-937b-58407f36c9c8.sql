-- Create staff_locations table for real-time position tracking
CREATE TABLE IF NOT EXISTS public.staff_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  x_coordinate NUMERIC NOT NULL,
  y_coordinate NUMERIC NOT NULL,
  floor_level INTEGER DEFAULT 1,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.staff_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Staff can update their own location"
ON public.staff_locations
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Staff can insert their own location"
ON public.staff_locations
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view staff locations in their tenant"
ON public.staff_locations
FOR SELECT
USING (tenant_id = get_user_tenant(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_locations;

-- Create trigger for updated_at
CREATE TRIGGER update_staff_locations_updated_at
BEFORE UPDATE ON public.staff_locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient queries
CREATE INDEX idx_staff_locations_event_id ON public.staff_locations(event_id);
CREATE INDEX idx_staff_locations_tenant_id ON public.staff_locations(tenant_id);
CREATE INDEX idx_staff_locations_user_id ON public.staff_locations(user_id);