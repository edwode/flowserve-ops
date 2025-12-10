-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view profiles with proper access" ON public.profiles;

-- Create a new policy that allows users within the same tenant to view profiles
-- This is needed for operational purposes (e.g., station staff seeing waiter names)
CREATE POLICY "Users can view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  (id = auth.uid()) 
  OR (tenant_id = get_user_tenant(auth.uid()))
  OR is_super_admin(auth.uid())
);