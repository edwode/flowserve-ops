-- Function to decrement inventory when order item status changes to 'served'
CREATE OR REPLACE FUNCTION public.decrement_inventory_on_served()
RETURNS TRIGGER AS $$
DECLARE
  _zone_id uuid;
  _event_id uuid;
BEGIN
  -- Only process if status changed to 'served'
  IF NEW.status = 'served' AND (OLD.status IS NULL OR OLD.status != 'served') THEN
    -- Get the zone_id and event_id from the order's table
    SELECT t.zone_id, o.event_id INTO _zone_id, _event_id
    FROM orders o
    LEFT JOIN tables t ON t.table_number = o.table_number AND t.event_id = o.event_id
    WHERE o.id = NEW.order_id;

    -- Decrement global inventory (menu_items.current_inventory)
    UPDATE menu_items
    SET current_inventory = GREATEST(0, current_inventory - NEW.quantity)
    WHERE id = NEW.menu_item_id;

    -- Decrement zone allocation if zone exists
    IF _zone_id IS NOT NULL AND _event_id IS NOT NULL THEN
      UPDATE inventory_zone_allocations
      SET allocated_quantity = GREATEST(0, allocated_quantity - NEW.quantity),
          updated_at = now()
      WHERE menu_item_id = NEW.menu_item_id
        AND zone_id = _zone_id
        AND event_id = _event_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on order_items
DROP TRIGGER IF EXISTS decrement_inventory_on_served_trigger ON order_items;
CREATE TRIGGER decrement_inventory_on_served_trigger
  AFTER UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_inventory_on_served();