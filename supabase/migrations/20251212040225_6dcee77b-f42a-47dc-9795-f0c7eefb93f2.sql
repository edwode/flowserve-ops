-- Add is_retired column to menu_items table
ALTER TABLE public.menu_items ADD COLUMN is_retired boolean NOT NULL DEFAULT false;