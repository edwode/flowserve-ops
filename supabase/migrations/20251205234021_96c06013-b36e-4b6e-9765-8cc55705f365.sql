-- Add assigned_waiter_id to tables for direct waiter assignment
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS assigned_waiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tables_assigned_waiter ON public.tables(assigned_waiter_id);

-- Allow tenant admins and event managers to update table waiter assignments
CREATE POLICY "Admins can update table assignments" 
ON public.tables 
FOR UPDATE 
USING (
  tenant_id = get_user_tenant(auth.uid()) 
  AND (
    has_role(auth.uid(), tenant_id, 'tenant_admin') 
    OR has_role(auth.uid(), tenant_id, 'event_manager')
  )
);