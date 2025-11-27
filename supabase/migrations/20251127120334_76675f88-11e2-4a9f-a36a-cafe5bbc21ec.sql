-- Create tables table for managing table occupancy
CREATE TABLE public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  event_id UUID NOT NULL REFERENCES events(id),
  table_number TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'available', -- available, occupied, needs_cleaning, reserved
  current_order_id UUID REFERENCES orders(id),
  occupied_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, event_id, table_number)
);

-- Enable RLS
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view tables in their tenant"
ON public.tables FOR SELECT
TO authenticated
USING (tenant_id = get_user_tenant(auth.uid()));

CREATE POLICY "Staff can manage tables"
ON public.tables FOR ALL
TO authenticated
USING (tenant_id = get_user_tenant(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_tables_updated_at
BEFORE UPDATE ON public.tables
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;

-- Add replica identity for real-time updates
ALTER TABLE public.tables REPLICA IDENTITY FULL;