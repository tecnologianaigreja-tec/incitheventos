-- 1. Add new columns to registrations
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS label_printed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS label_printed_by uuid NULL,
  ADD COLUMN IF NOT EXISTS label_print_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_delivered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS material_delivered_by uuid NULL;

-- 2. Partial indexes for faster "unprinted" / "material pending" filters
CREATE INDEX IF NOT EXISTS registrations_label_unprinted_idx
  ON public.registrations (event_id)
  WHERE label_printed_at IS NULL;

CREATE INDEX IF NOT EXISTS registrations_material_pending_idx
  ON public.registrations (event_id)
  WHERE material_delivered_at IS NULL;

-- 3. RPC to atomically mark labels as printed (increments counter)
CREATE OR REPLACE FUNCTION public.mark_labels_printed(_ids uuid[], _user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  -- Only admins can call this
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.registrations
  SET label_printed_at = now(),
      label_printed_by = _user,
      label_print_count = label_print_count + 1
  WHERE id = ANY(_ids);

  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_labels_printed(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_labels_printed(uuid[], uuid) TO authenticated;