-- Add zone_id to profiles for waiter zone assignment
ALTER TABLE public.profiles ADD COLUMN zone_id uuid REFERENCES public.zones(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX idx_profiles_zone_id ON public.profiles(zone_id);