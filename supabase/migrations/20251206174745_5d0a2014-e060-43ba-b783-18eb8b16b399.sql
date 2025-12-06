-- Allow tenant admins to update their own tenant settings
CREATE POLICY "Tenant admins can update their tenant"
ON public.tenants
FOR UPDATE
USING (
  id = get_user_tenant(auth.uid())
  AND has_role(auth.uid(), id, 'tenant_admin'::app_role)
)
WITH CHECK (
  id = get_user_tenant(auth.uid())
  AND has_role(auth.uid(), id, 'tenant_admin'::app_role)
);