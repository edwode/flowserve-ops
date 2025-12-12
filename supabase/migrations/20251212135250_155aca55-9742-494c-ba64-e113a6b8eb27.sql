-- Drop the existing RLS policy on user_roles
DROP POLICY IF EXISTS "Users can view roles in their tenant or super_admin" ON public.user_roles;

-- Create new restrictive policy: users can only see their own role, OR tenant_admin/super_admin can see all roles in their tenant
CREATE POLICY "Users can view own role or admins can view tenant roles"
ON public.user_roles
FOR SELECT
USING (
  -- Users can always see their own role
  user_id = auth.uid()
  OR
  -- Tenant admins can see all roles in their tenant
  (tenant_id = get_user_tenant(auth.uid()) AND has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role))
  OR
  -- Super admins can see all roles
  is_super_admin(auth.uid())
);