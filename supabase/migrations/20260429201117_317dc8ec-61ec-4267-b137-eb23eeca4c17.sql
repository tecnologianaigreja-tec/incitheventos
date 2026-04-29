ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_slug TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_invoice_slug ON public.orders (invoice_slug);
CREATE INDEX IF NOT EXISTS idx_orders_pending_created_at ON public.orders (payment_status, created_at);