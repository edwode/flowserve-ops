-- Create storage bucket for tenant logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for viewing logos (public)
CREATE POLICY "Tenant logos are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'tenant-logos');

-- Create policy for uploading logos (admins only)
CREATE POLICY "Admins can upload tenant logos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'tenant-logos' AND
  auth.uid() IN (
    SELECT ur.user_id
    FROM user_roles ur
    WHERE ur.role = 'tenant_admin'
  )
);

-- Create policy for updating logos (admins only)
CREATE POLICY "Admins can update tenant logos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'tenant-logos' AND
  auth.uid() IN (
    SELECT ur.user_id
    FROM user_roles ur
    WHERE ur.role = 'tenant_admin'
  )
);

-- Create policy for deleting logos (admins only)
CREATE POLICY "Admins can delete tenant logos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'tenant-logos' AND
  auth.uid() IN (
    SELECT ur.user_id
    FROM user_roles ur
    WHERE ur.role = 'tenant_admin'
  )
);