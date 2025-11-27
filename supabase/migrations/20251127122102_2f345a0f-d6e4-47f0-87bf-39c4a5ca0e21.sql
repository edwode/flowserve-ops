-- Create analytics functions for the dashboard

-- Function to get peak hours analysis
CREATE OR REPLACE FUNCTION public.get_peak_hours_analysis(
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ,
  _tenant_id UUID
)
RETURNS TABLE (
  hour INTEGER,
  order_count BIGINT,
  total_revenue NUMERIC,
  avg_order_value NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    EXTRACT(HOUR FROM created_at)::INTEGER as hour,
    COUNT(*)::BIGINT as order_count,
    SUM(total_amount) as total_revenue,
    AVG(total_amount) as avg_order_value
  FROM orders
  WHERE tenant_id = _tenant_id
    AND created_at BETWEEN _start_date AND _end_date
    AND status = 'paid'
  GROUP BY EXTRACT(HOUR FROM created_at)
  ORDER BY hour;
$$;

-- Function to get popular items
CREATE OR REPLACE FUNCTION public.get_popular_items(
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ,
  _tenant_id UUID,
  _limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  category TEXT,
  total_quantity BIGINT,
  total_revenue NUMERIC,
  order_count BIGINT,
  avg_price NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    oi.menu_item_id as item_id,
    mi.name as item_name,
    mi.category,
    SUM(oi.quantity)::BIGINT as total_quantity,
    SUM(oi.price * oi.quantity) as total_revenue,
    COUNT(DISTINCT oi.order_id)::BIGINT as order_count,
    AVG(oi.price) as avg_price
  FROM order_items oi
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.tenant_id = _tenant_id
    AND o.created_at BETWEEN _start_date AND _end_date
    AND o.status = 'paid'
  GROUP BY oi.menu_item_id, mi.name, mi.category
  ORDER BY total_quantity DESC
  LIMIT _limit;
$$;

-- Function to get station efficiency metrics
CREATE OR REPLACE FUNCTION public.get_station_efficiency(
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ,
  _tenant_id UUID
)
RETURNS TABLE (
  station_type TEXT,
  total_items BIGINT,
  avg_prep_time_minutes NUMERIC,
  items_on_time BIGINT,
  items_delayed BIGINT,
  efficiency_percentage NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    oi.station_type::TEXT,
    COUNT(*)::BIGINT as total_items,
    AVG(EXTRACT(EPOCH FROM (COALESCE(oi.ready_at, NOW()) - oi.created_at)) / 60) as avg_prep_time_minutes,
    COUNT(CASE WHEN EXTRACT(EPOCH FROM (oi.ready_at - oi.created_at)) / 60 <= 10 THEN 1 END)::BIGINT as items_on_time,
    COUNT(CASE WHEN EXTRACT(EPOCH FROM (oi.ready_at - oi.created_at)) / 60 > 10 THEN 1 END)::BIGINT as items_delayed,
    (COUNT(CASE WHEN EXTRACT(EPOCH FROM (oi.ready_at - oi.created_at)) / 60 <= 10 THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100) as efficiency_percentage
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.tenant_id = _tenant_id
    AND o.created_at BETWEEN _start_date AND _end_date
    AND oi.ready_at IS NOT NULL
  GROUP BY oi.station_type
  ORDER BY total_items DESC;
$$;

-- Function to get waiter performance
CREATE OR REPLACE FUNCTION public.get_waiter_performance(
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ,
  _tenant_id UUID
)
RETURNS TABLE (
  waiter_id UUID,
  waiter_name TEXT,
  total_orders BIGINT,
  total_revenue NUMERIC,
  avg_order_value NUMERIC,
  total_items BIGINT,
  avg_table_turnover_minutes NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    o.waiter_id,
    p.full_name as waiter_name,
    COUNT(DISTINCT o.id)::BIGINT as total_orders,
    SUM(o.total_amount) as total_revenue,
    AVG(o.total_amount) as avg_order_value,
    SUM((SELECT COUNT(*) FROM order_items WHERE order_id = o.id))::BIGINT as total_items,
    AVG(EXTRACT(EPOCH FROM (COALESCE(o.paid_at, NOW()) - o.created_at)) / 60) as avg_table_turnover_minutes
  FROM orders o
  JOIN profiles p ON p.id = o.waiter_id
  WHERE o.tenant_id = _tenant_id
    AND o.created_at BETWEEN _start_date AND _end_date
    AND o.status = 'paid'
  GROUP BY o.waiter_id, p.full_name
  ORDER BY total_revenue DESC;
$$;

-- Function to get revenue trends for forecasting
CREATE OR REPLACE FUNCTION public.get_revenue_trends(
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ,
  _tenant_id UUID
)
RETURNS TABLE (
  date DATE,
  total_orders BIGINT,
  total_revenue NUMERIC,
  avg_order_value NUMERIC,
  unique_tables BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    DATE(created_at) as date,
    COUNT(*)::BIGINT as total_orders,
    SUM(total_amount) as total_revenue,
    AVG(total_amount) as avg_order_value,
    COUNT(DISTINCT table_number)::BIGINT as unique_tables
  FROM orders
  WHERE tenant_id = _tenant_id
    AND created_at BETWEEN _start_date AND _end_date
    AND status = 'paid'
  GROUP BY DATE(created_at)
  ORDER BY date;
$$;

-- Function to get category performance
CREATE OR REPLACE FUNCTION public.get_category_performance(
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ,
  _tenant_id UUID
)
RETURNS TABLE (
  category TEXT,
  total_items BIGINT,
  total_revenue NUMERIC,
  avg_item_price NUMERIC,
  percentage_of_total NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH category_stats AS (
    SELECT 
      mi.category,
      SUM(oi.quantity)::BIGINT as total_items,
      SUM(oi.price * oi.quantity) as total_revenue,
      AVG(oi.price) as avg_item_price
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.tenant_id = _tenant_id
      AND o.created_at BETWEEN _start_date AND _end_date
      AND o.status = 'paid'
    GROUP BY mi.category
  ),
  total_rev AS (
    SELECT SUM(total_revenue) as grand_total FROM category_stats
  )
  SELECT 
    cs.category,
    cs.total_items,
    cs.total_revenue,
    cs.avg_item_price,
    (cs.total_revenue / NULLIF(tr.grand_total, 0) * 100) as percentage_of_total
  FROM category_stats cs
  CROSS JOIN total_rev tr
  ORDER BY cs.total_revenue DESC;
$$;