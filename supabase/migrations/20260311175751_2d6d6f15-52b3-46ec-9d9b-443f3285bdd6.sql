ALTER TABLE public.events 
ADD COLUMN poster_url text DEFAULT NULL,
ADD COLUMN sections_order jsonb DEFAULT '["about","audience","includes","poster","faq","cta"]'::jsonb;