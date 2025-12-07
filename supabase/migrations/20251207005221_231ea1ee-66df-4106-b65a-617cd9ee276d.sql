-- Update payments INSERT policy to allow bar_staff to create payments
DROP POLICY IF EXISTS "Cashiers can create payments" ON public.payments;

CREATE POLICY "Cashiers and bar staff can create payments"
ON public.payments
FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant(auth.uid()) 
  AND (
    has_role(auth.uid(), tenant_id, 'cashier'::app_role) 
    OR has_role(auth.uid(), tenant_id, 'bar_staff'::app_role)
  )
);