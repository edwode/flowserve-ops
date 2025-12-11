-- Add is_adhoc column to tables for tables that can be accessed by all waiters in a zone
ALTER TABLE public.tables ADD COLUMN is_adhoc boolean NOT NULL DEFAULT false;