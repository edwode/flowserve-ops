-- Fix profiles table RLS to require authentication
-- Drop existing policy and recreate with authentication requirement
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON public.profiles;

CREATE POLICY "Users can view profiles in their tenant" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant(auth.uid()));