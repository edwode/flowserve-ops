-- Add currency field to tenants table
ALTER TABLE public.tenants 
ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';

-- Add a comment to document the field
COMMENT ON COLUMN public.tenants.currency IS 'Currency code (e.g., USD, EUR, GBP) for the tenant';