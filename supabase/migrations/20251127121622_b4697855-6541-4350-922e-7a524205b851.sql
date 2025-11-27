-- Add split payment tracking columns to payments table
ALTER TABLE public.payments
ADD COLUMN split_session_id UUID,
ADD COLUMN split_type TEXT CHECK (split_type IN ('full', 'by_guest', 'by_item', 'custom')),
ADD COLUMN guest_identifier TEXT,
ADD COLUMN payment_status TEXT DEFAULT 'completed' CHECK (payment_status IN ('completed', 'partial')),
ADD COLUMN notes_metadata JSONB DEFAULT '{}'::jsonb;

-- Create a split_payment_items table to track which items are paid for
CREATE TABLE public.split_payment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.split_payment_items ENABLE ROW LEVEL SECURITY;

-- Policies for split_payment_items
CREATE POLICY "Users can view split payment items in their tenant"
ON public.split_payment_items FOR SELECT
TO authenticated
USING (tenant_id = get_user_tenant(auth.uid()));

CREATE POLICY "Cashiers can create split payment items"
ON public.split_payment_items FOR INSERT
TO authenticated
WITH CHECK (tenant_id = get_user_tenant(auth.uid()) AND has_role(auth.uid(), tenant_id, 'cashier'::app_role));

-- Add indexes for performance
CREATE INDEX idx_payments_order_id ON public.payments(order_id);
CREATE INDEX idx_payments_split_session_id ON public.payments(split_session_id) WHERE split_session_id IS NOT NULL;
CREATE INDEX idx_split_payment_items_payment_id ON public.split_payment_items(payment_id);
CREATE INDEX idx_split_payment_items_order_item_id ON public.split_payment_items(order_item_id);

-- Create a function to calculate remaining balance for an order
CREATE OR REPLACE FUNCTION public.get_order_remaining_balance(_order_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT total_amount FROM orders WHERE id = _order_id) - 
    COALESCE((SELECT SUM(amount) FROM payments WHERE order_id = _order_id), 0),
    0
  );
$$;

-- Create a function to get payment summary for an order
CREATE OR REPLACE FUNCTION public.get_order_payment_summary(_order_id UUID)
RETURNS TABLE (
  total_amount NUMERIC,
  total_paid NUMERIC,
  remaining_balance NUMERIC,
  payment_count INTEGER,
  is_fully_paid BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    o.total_amount,
    COALESCE(SUM(p.amount), 0) as total_paid,
    o.total_amount - COALESCE(SUM(p.amount), 0) as remaining_balance,
    COUNT(p.id)::INTEGER as payment_count,
    (o.total_amount - COALESCE(SUM(p.amount), 0)) <= 0 as is_fully_paid
  FROM orders o
  LEFT JOIN payments p ON p.order_id = o.id
  WHERE o.id = _order_id
  GROUP BY o.id, o.total_amount;
$$;