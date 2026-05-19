-- ─────────────────────────────────────────────────────────────────────────────
-- Payment system hardening
-- 1. previous_order_nsu: preserves old NSU after batch recalculation so the
--    webhook can still find the order if payment arrives on the old link.
-- 2. event_id on payment_proofs: allows efficient per-event filtering in the
--    admin dashboard without a full-table scan / large IN() list.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Track the previous NSU before rotation (batch splits)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS previous_order_nsu TEXT;

CREATE INDEX IF NOT EXISTS orders_previous_order_nsu_idx
  ON public.orders (previous_order_nsu)
  WHERE previous_order_nsu IS NOT NULL;

-- 2. Denormalise event_id onto payment_proofs for O(1) per-event lookups
ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id);

-- Backfill existing rows
UPDATE public.payment_proofs pp
SET    event_id = o.event_id
FROM   public.orders o
WHERE  o.id  = pp.order_id
AND    pp.event_id IS NULL;

CREATE INDEX IF NOT EXISTS payment_proofs_event_id_idx
  ON public.payment_proofs (event_id)
  WHERE event_id IS NOT NULL;
