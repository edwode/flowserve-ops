-- Create menu_categories table
CREATE TABLE public.menu_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(name, tenant_id)
);

-- Enable RLS
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view categories in their tenant or super_admin"
ON public.menu_categories
FOR SELECT
USING ((tenant_id = get_user_tenant(auth.uid())) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins can manage categories"
ON public.menu_categories
FOR ALL
USING ((tenant_id = get_user_tenant(auth.uid())) AND has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_menu_categories_updated_at
BEFORE UPDATE ON public.menu_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();