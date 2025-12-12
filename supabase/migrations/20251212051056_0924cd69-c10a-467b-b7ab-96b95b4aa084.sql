-- Add RLS policy to allow station staff to update order_returns (confirm returns)
CREATE POLICY "Station staff can confirm returns"
ON public.order_returns
FOR UPDATE
USING (
  tenant_id = get_user_tenant(auth.uid())
  AND (
    has_role(auth.uid(), tenant_id, 'drink_dispenser'::app_role)
    OR has_role(auth.uid(), tenant_id, 'meal_dispenser'::app_role)
    OR has_role(auth.uid(), tenant_id, 'mixologist'::app_role)
    OR has_role(auth.uid(), tenant_id, 'bar_staff'::app_role)
  )
);