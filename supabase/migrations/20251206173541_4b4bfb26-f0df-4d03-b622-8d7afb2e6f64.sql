-- Drop the existing permissive policy that allows all tenant users to view all profiles
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON public.profiles;

-- Create a new restrictive policy: Users can view their own profile OR tenant admins can view all profiles in their tenant
CREATE POLICY "Users can view own profile or admins can view all"
ON public.profiles
FOR SELECT
USING (
  -- Users can always view their own profile
  id = auth.uid()
  OR
  -- Tenant admins can view all profiles in their tenant
  (
    tenant_id = get_user_tenant(auth.uid())
    AND has_role(auth.uid(), get_user_tenant(auth.uid()), 'tenant_admin'::app_role)
  )
);