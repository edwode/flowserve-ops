-- Add INSERT policy for audit_logs to allow tenant admins to create logs
CREATE POLICY "Tenant admins can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  (tenant_id = get_user_tenant(auth.uid())) 
  AND has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role)
);