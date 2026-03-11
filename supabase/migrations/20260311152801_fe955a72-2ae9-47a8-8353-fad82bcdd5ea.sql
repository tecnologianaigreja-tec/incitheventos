
-- Create storage bucket for event banners
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-banners', 'event-banners', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload banners"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'event-banners');

-- Allow authenticated users to update/delete their uploads
CREATE POLICY "Authenticated users can update banners"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'event-banners');

CREATE POLICY "Authenticated users can delete banners"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'event-banners');

-- Allow public read access
CREATE POLICY "Public can view banners"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'event-banners');
