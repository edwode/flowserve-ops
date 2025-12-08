-- Create zone_role_assignments table for station roles
-- Station roles: cashier, bar_staff, mixologist, drink_dispenser, meal_dispenser
-- Constraint: Only ONE user with each role can be assigned to a zone

CREATE TABLE public.zone_role_assignments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    zone_id UUID NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role public.app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Ensure only ONE user per role per zone
    CONSTRAINT unique_role_per_zone UNIQUE (zone_id, role),
    
    -- Ensure user can only have one assignment per zone (prevents duplicate entries)
    CONSTRAINT unique_user_per_zone UNIQUE (user_id, zone_id),
    
    -- Restrict to station roles only
    CONSTRAINT station_roles_only CHECK (role IN ('cashier', 'bar_staff', 'mixologist', 'drink_dispenser', 'meal_dispenser'))
);

-- Create indexes for performance
CREATE INDEX idx_zone_role_assignments_user_id ON public.zone_role_assignments(user_id);
CREATE INDEX idx_zone_role_assignments_zone_id ON public.zone_role_assignments(zone_id);
CREATE INDEX idx_zone_role_assignments_tenant_id ON public.zone_role_assignments(tenant_id);

-- Enable RLS
ALTER TABLE public.zone_role_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view zone role assignments in their tenant"
ON public.zone_role_assignments
FOR SELECT
USING (tenant_id = get_user_tenant(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins can manage zone role assignments"
ON public.zone_role_assignments
FOR ALL
USING (
    tenant_id = get_user_tenant(auth.uid()) 
    AND has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role)
);

-- Trigger for updated_at
CREATE TRIGGER update_zone_role_assignments_updated_at
BEFORE UPDATE ON public.zone_role_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();