-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles (tenant-scoped)
CREATE TYPE app_role AS ENUM (
  'super_admin',
  'support_admin',
  'tenant_admin',
  'event_manager',
  'waiter',
  'cashier',
  'drink_dispenser',
  'meal_dispenser',
  'mixologist',
  'bar_staff',
  'read_only_partner'
);

-- Create enum for order status
CREATE TYPE order_status AS ENUM (
  'pending',
  'dispatched',
  'ready',
  'served',
  'paid',
  'rejected',
  'returned'
);

-- Create enum for payment method
CREATE TYPE payment_method AS ENUM (
  'cash',
  'pos',
  'transfer',
  'split'
);

-- Create enum for station type
CREATE TYPE station_type AS ENUM (
  'drink_dispenser',
  'meal_dispenser',
  'mixologist',
  'bar'
);

-- Tenants table (top-level isolation)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT,
  theme_config JSONB DEFAULT '{}',
  plan_name TEXT DEFAULT 'free',
  plan_limits JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles table (replaces direct auth.users references)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id, role)
);

-- Events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  expected_guests INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Menu items table
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- drinks, meals, cocktails, extras
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  station_type station_type NOT NULL,
  is_available BOOLEAN DEFAULT true,
  starting_inventory INTEGER DEFAULT 0,
  current_inventory INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  order_number TEXT NOT NULL,
  table_number TEXT,
  guest_name TEXT,
  waiter_id UUID REFERENCES public.profiles(id) NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order items table
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  menu_item_id UUID REFERENCES public.menu_items(id) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(10,2) NOT NULL,
  station_type station_type NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  assigned_to UUID REFERENCES public.profiles(id),
  dispatched_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method payment_method NOT NULL,
  confirmed_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Returns/Rejects table
CREATE TABLE public.order_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  reported_by UUID REFERENCES public.profiles(id) NOT NULL,
  confirmed_by UUID REFERENCES public.profiles(id),
  refund_amount DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _tenant_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role = _role
  )
$$;

-- Create security definer function to get user's tenant
CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;

-- RLS Policies for tenants
CREATE POLICY "Users can view their own tenant"
  ON public.tenants FOR SELECT
  USING (id = public.get_user_tenant(auth.uid()));

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their tenant"
  ON public.profiles FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view roles in their tenant"
  ON public.user_roles FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- RLS Policies for events
CREATE POLICY "Users can view events in their tenant"
  ON public.events FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Admins can insert events"
  ON public.events FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    public.has_role(auth.uid(), tenant_id, 'tenant_admin')
  );

CREATE POLICY "Admins can update events"
  ON public.events FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    public.has_role(auth.uid(), tenant_id, 'tenant_admin')
  );

-- RLS Policies for menu_items
CREATE POLICY "Users can view menu items in their tenant"
  ON public.menu_items FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Admins can manage menu items"
  ON public.menu_items FOR ALL
  USING (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    public.has_role(auth.uid(), tenant_id, 'tenant_admin')
  );

-- RLS Policies for orders
CREATE POLICY "Users can view orders in their tenant"
  ON public.orders FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Waiters and bar staff can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    (public.has_role(auth.uid(), tenant_id, 'waiter') OR
     public.has_role(auth.uid(), tenant_id, 'bar_staff'))
  );

CREATE POLICY "Orders can be updated by staff"
  ON public.orders FOR UPDATE
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- RLS Policies for order_items
CREATE POLICY "Users can view order items in their tenant"
  ON public.order_items FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Order items can be managed by staff"
  ON public.order_items FOR ALL
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- RLS Policies for payments
CREATE POLICY "Users can view payments in their tenant"
  ON public.payments FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Cashiers can create payments"
  ON public.payments FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    public.has_role(auth.uid(), tenant_id, 'cashier')
  );

-- RLS Policies for order_returns
CREATE POLICY "Users can view returns in their tenant"
  ON public.order_returns FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Staff can create returns"
  ON public.order_returns FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));

-- RLS Policies for audit_logs
CREATE POLICY "Users can view audit logs in their tenant"
  ON public.audit_logs FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add updated_at triggers
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to generate order number
CREATE OR REPLACE FUNCTION public.generate_order_number(_event_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  _count INTEGER;
  _order_num TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO _count
  FROM public.orders
  WHERE event_id = _event_id;
  
  _order_num := 'ORD-' || TO_CHAR(_count, 'FM0000');
  RETURN _order_num;
END;
$$;

-- Enable realtime for critical tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;