-- Drop the existing policy that allows all tenant users to view audit logs
DROP POLICY IF EXISTS "Users can view audit logs in their tenant" ON public.audit_logs;

-- Create a new restrictive policy: Only tenant admins can view audit logs
CREATE POLICY "Only tenant admins can view audit logs"
ON public.audit_logs
FOR SELECT
USING (
  tenant_id = get_user_tenant(auth.uid())
  AND has_role(auth.uid(), get_user_tenant(auth.uid()), 'tenant_admin'::app_role)
);