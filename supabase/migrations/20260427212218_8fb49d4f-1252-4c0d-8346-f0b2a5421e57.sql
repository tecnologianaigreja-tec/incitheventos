DO $$
DECLARE
  victim RECORD;
  affected_orders uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR victim IN
    SELECT r.id, r.order_id, r.cpf, r.event_id, r.full_name
    FROM public.registrations r
    WHERE r.registration_status = 'canceled'
      AND EXISTS (
        SELECT 1 FROM public.registrations r2
        WHERE r2.cpf = r.cpf
          AND r2.event_id = r.event_id
          AND r2.id <> r.id
      )
      AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.registration_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM public.checkin_logs cl WHERE cl.registration_id = r.id)
  LOOP
    INSERT INTO public.audit_logs (action, entity_type, entity_id, details)
    VALUES (
      'duplicate_canceled_registration_purged',
      'registration',
      victim.id,
      jsonb_build_object(
        'cpf', victim.cpf,
        'event_id', victim.event_id,
        'name', victim.full_name,
        'order_id', victim.order_id,
        'reason', 'hard delete of redundant canceled duplicate; kept active sibling'
      )
    );

    DELETE FROM public.registrations WHERE id = victim.id;

    IF victim.order_id IS NOT NULL AND NOT (victim.order_id = ANY(affected_orders)) THEN
      affected_orders := array_append(affected_orders, victim.order_id);
    END IF;
  END LOOP;

  IF array_length(affected_orders, 1) > 0 THEN
    DELETE FROM public.orders o
    WHERE o.id = ANY(affected_orders)
      AND o.payment_status = 'canceled'
      AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.order_id = o.id);
  END IF;
END $$;