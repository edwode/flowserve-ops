-- Fix function search_path security warning
-- Update generate_order_number function to set search_path
CREATE OR REPLACE FUNCTION public.generate_order_number(_event_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
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