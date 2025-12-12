-- Add optional reservation_name column to tables
ALTER TABLE public.tables 
ADD COLUMN reservation_name text DEFAULT NULL;