-- Create function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::app_role
  )
$$;

-- Update tenants policy to allow super_admin to view all tenants
DROP POLICY IF EXISTS "Users can view their own tenant" ON public.tenants;
CREATE POLICY "Users can view their own tenant or super_admin can view all"
ON public.tenants
FOR SELECT
USING (
  id = get_user_tenant(auth.uid())
  OR is_super_admin(auth.uid())
);

-- Update events policy
DROP POLICY IF EXISTS "Users can view events in their tenant" ON public.events;
CREATE POLICY "Users can view events in their tenant or super_admin"
ON public.events
FOR SELECT
USING (
  tenant_id = get_user_tenant(auth.uid())
  OR is_super_admin(auth.uid())
);

-- Update orders policy
DROP POLICY IF EXISTS "Users can view orders in their tenant" ON public.orders;
CREATE POLICY "Users can view orders in their tenant or super_admin"
ON public.orders
FOR SELECT
USING (
  tenant_id = get_user_tenant(auth.uid())
  OR is_super_admin(auth.uid())
);

-- Update menu_items policy
DROP POLICY IF EXISTS "Users can view menu items in their tenant" ON public.menu_items;
CREATE POLICY "Users can view menu items in their tenant or super_admin"
ON public.menu_items
FOR SELECT
USING (
  tenant_id = get_user_tenant(auth.uid())
  OR is_super_admin(auth.uid())
);

-- Update profiles policy
DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON public.profiles;
CREATE POLICY "Users can view profiles with proper access"
ON public.profiles
FOR SELECT
USING (
  id = auth.uid()
  OR (tenant_id = get_user_tenant(auth.uid()) AND has_role(auth.uid(), get_user_tenant(auth.uid()), 'tenant_admin'::app_role))
  OR is_super_admin(auth.uid())
);

-- Update user_roles policy
DROP POLICY IF EXISTS "Users can view roles in their tenant" ON public.user_roles;
CREATE POLICY "Users can view roles in their tenant or super_admin"
ON public.user_roles
FOR SELECT
USING (
  tenant_id = get_user_tenant(auth.uid())
  OR is_super_admin(auth.uid())
);

-- Update payments policy
DROP POLICY IF EXISTS "Users can view payments in their tenant" ON public.payments;
CREATE POLICY "Users can view payments in their tenant or super_admin"
ON public.payments
FOR SELECT
USING (
  tenant_id = get_user_tenant(auth.uid())
  OR is_super_admin(auth.uid())
);

-- Update tables policy
DROP POLICY IF EXISTS "Users can view tables in their tenant" ON public.tables;
CREATE POLICY "Users can view tables in their tenant or super_admin"
ON public.tables
FOR SELECT
USING (
  tenant_id = get_user_tenant(auth.uid())
  OR is_super_admin(auth.uid())
);

-- Update zones policy
DROP POLICY IF EXISTS "Users can view zones in their tenant" ON public.zones;
CREATE POLICY "Users can view zones in their tenant or super_admin"
ON public.zones
FOR SELECT
USING (
  tenant_id = get_user_tenant(auth.uid())
  OR is_super_admin(auth.uid())
);