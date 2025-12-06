-- Add event_id to profiles for waiter event assignment
ALTER TABLE public.profiles ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX idx_profiles_event_id ON public.profiles(event_id);