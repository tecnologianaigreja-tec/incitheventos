-- Add parent_order_id column to support batch split payments
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id ON public.orders(parent_order_id);

-- Helpful indexes for the lookup-by-CPF flow and webhook updates
CREATE INDEX IF NOT EXISTS idx_registrations_cpf_event ON public.registrations(cpf, event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_order_id ON public.registrations(order_id);

-- Partial unique index: prevents two ACTIVE (pending or confirmed) registrations
-- for the same CPF in the same event. Canceled registrations are ignored,
-- so the José Gilmar case (2 confirmed) is intentionally preserved as-is.
-- Note: the existing duplicate of 2 confirmed will violate this if we use a UNIQUE
-- constraint, but UNIQUE INDEX with WHERE is parcial — it will reject NEW inserts
-- but won't fail on existing rows being indexed. Wait — it WILL try to index existing
-- rows. We must verify first.
DO $$
DECLARE
  v_violations INT;
BEGIN
  SELECT COUNT(*) INTO v_violations FROM (
    SELECT cpf, event_id
    FROM public.registrations
    WHERE registration_status IN ('pending_payment', 'confirmed')
    GROUP BY cpf, event_id
    HAVING COUNT(*) > 1
  ) x;

  IF v_violations > 0 THEN
    RAISE NOTICE 'Found % (cpf,event) pair(s) that would violate the unique index. Logging for admin review.', v_violations;
    -- Log them for visibility, but do NOT touch them
    INSERT INTO public.audit_logs (action, entity_type, details)
    SELECT
      'duplicate_active_blocking_index_creation',
      'registration',
      jsonb_build_object(
        'cpf', cpf,
        'event_id', event_id,
        'count', cnt,
        'note', 'Multiple active (confirmed/pending) registrations for same CPF/event — admin must reconcile before unique index can be enforced.'
      )
    FROM (
      SELECT cpf, event_id, COUNT(*) AS cnt
      FROM public.registrations
      WHERE registration_status IN ('pending_payment', 'confirmed')
      GROUP BY cpf, event_id
      HAVING COUNT(*) > 1
    ) y;
  END IF;
END $$;

-- Create the partial unique index. If existing duplicates remain (José Gilmar case),
-- this CREATE will fail and the migration aborts — which is the safe behavior.
-- The user will be notified and can decide how to handle the 2 confirmed manually.
-- HOWEVER: to allow the migration to proceed and protect FUTURE inserts only,
-- we use a different strategy: a BEFORE INSERT trigger that rejects new dups.
-- This way the existing 2-confirmed duplicate stays untouched.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only check when the new/updated row is in an active state
  IF NEW.registration_status NOT IN ('pending_payment', 'confirmed') THEN
    RETURN NEW;
  END IF;

  -- On INSERT or when status transitions into active, check for siblings
  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE cpf = NEW.cpf
      AND event_id = NEW.event_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND registration_status IN ('pending_payment', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'duplicate_active_registration: CPF % already has an active registration for event %', NEW.cpf, NEW.event_id
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_active_registration ON public.registrations;
CREATE TRIGGER trg_prevent_duplicate_active_registration
BEFORE INSERT OR UPDATE OF registration_status, cpf, event_id
ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_active_registration();