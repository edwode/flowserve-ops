-- Drop the existing constraint
ALTER TABLE public.zone_role_assignments DROP CONSTRAINT IF EXISTS station_roles_only;

-- Add updated constraint that includes event_manager
ALTER TABLE public.zone_role_assignments ADD CONSTRAINT multi_zone_roles_only 
CHECK (role IN ('cashier', 'bar_staff', 'mixologist', 'drink_dispenser', 'meal_dispenser', 'event_manager'));