DO $$
DECLARE
  v_confirmed_at_risk INT;
  v_canceled_count INT := 0;
  v_orders_canceled INT := 0;
  v_needs_review_count INT := 0;
  rec RECORD;
  reg_to_keep_id UUID;
BEGIN
  -- ═══════════════════════════════════════════════════════════════
  -- SAFETY CHECK: count any confirmed/approved registration that
  -- could be touched by our UPDATE. Must be ZERO.
  -- ═══════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_confirmed_at_risk
  FROM registrations r
  WHERE (r.registration_status = 'confirmed' OR r.payment_status = 'approved')
    AND EXISTS (
      SELECT 1 FROM registrations r2
      WHERE r2.cpf = r.cpf
        AND r2.event_id = r.event_id
        AND r2.id <> r.id
    );

  -- We expect confirmed duplicates to exist (José Gilmar case),
  -- but our UPDATE never touches them. Just log so we know.
  RAISE NOTICE 'Confirmed registrations with same-CPF siblings (will be PRESERVED): %', v_confirmed_at_risk;

  -- ═══════════════════════════════════════════════════════════════
  -- CASE A: 2+ confirmed registrations for the same (cpf, event_id)
  -- → DO NOT TOUCH. Just log for admin manual review.
  -- ═══════════════════════════════════════════════════════════════
  FOR rec IN
    SELECT cpf, event_id, COUNT(*) AS confirmed_count,
           array_agg(id) AS reg_ids,
           array_agg(full_name) AS names
    FROM registrations
    WHERE registration_status = 'confirmed' OR payment_status = 'approved'
    GROUP BY cpf, event_id
    HAVING COUNT(*) > 1
  LOOP
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES (
      'duplicate_confirmed_needs_review',
      'registration',
      jsonb_build_object(
        'cpf', rec.cpf,
        'event_id', rec.event_id,
        'confirmed_count', rec.confirmed_count,
        'registration_ids', to_jsonb(rec.reg_ids),
        'names', to_jsonb(rec.names),
        'note', 'Multiple confirmed registrations for same CPF — admin must review manually. Script did NOT modify these.'
      )
    );
    v_needs_review_count := v_needs_review_count + 1;
  END LOOP;

  RAISE NOTICE 'Cases flagged for admin manual review: %', v_needs_review_count;

  -- ═══════════════════════════════════════════════════════════════
  -- CASE B: At least one confirmed exists for (cpf, event_id)
  -- → cancel only the pending_payment siblings (confirmed stays intact)
  -- ═══════════════════════════════════════════════════════════════
  FOR rec IN
    SELECT DISTINCT r.cpf, r.event_id
    FROM registrations r
    WHERE (r.registration_status = 'confirmed' OR r.payment_status = 'approved')
      AND EXISTS (
        SELECT 1 FROM registrations r2
        WHERE r2.cpf = r.cpf
          AND r2.event_id = r.event_id
          AND r2.id <> r.id
          AND r2.registration_status = 'pending_payment'
          AND r2.payment_status <> 'approved'
      )
  LOOP
    -- Find the kept (confirmed) registration id for the audit log
    SELECT id INTO reg_to_keep_id
    FROM registrations
    WHERE cpf = rec.cpf
      AND event_id = rec.event_id
      AND (registration_status = 'confirmed' OR payment_status = 'approved')
    ORDER BY created_at ASC
    LIMIT 1;

    -- Log each pending we will cancel
    INSERT INTO audit_logs (action, entity_type, entity_id, details)
    SELECT
      'duplicate_cleanup_pending_only',
      'registration',
      r.id,
      jsonb_build_object(
        'cpf', r.cpf,
        'event_id', r.event_id,
        'reason', 'Pending registration redundant — confirmed registration already exists for same CPF',
        'kept_registration_id', reg_to_keep_id,
        'canceled_registration_id', r.id,
        'order_id', r.order_id
      )
    FROM registrations r
    WHERE r.cpf = rec.cpf
      AND r.event_id = rec.event_id
      AND r.registration_status = 'pending_payment'
      AND r.payment_status <> 'approved';

    -- DOUBLE-FILTERED UPDATE — defense in depth
    UPDATE registrations
    SET registration_status = 'canceled',
        payment_status = 'canceled',
        updated_at = now()
    WHERE cpf = rec.cpf
      AND event_id = rec.event_id
      AND registration_status = 'pending_payment'
      AND payment_status <> 'approved';

    GET DIAGNOSTICS v_canceled_count = ROW_COUNT;
    RAISE NOTICE 'CASE B - CPF %, event %: canceled % pending(s), kept confirmed %',
                 rec.cpf, rec.event_id, v_canceled_count, reg_to_keep_id;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════
  -- CASE C: Only pending_payment registrations for (cpf, event_id)
  -- → keep oldest, cancel the rest
  -- ═══════════════════════════════════════════════════════════════
  FOR rec IN
    SELECT cpf, event_id
    FROM registrations
    WHERE registration_status = 'pending_payment'
      AND payment_status <> 'approved'
    GROUP BY cpf, event_id
    HAVING COUNT(*) > 1
       AND NOT EXISTS (
         SELECT 1 FROM registrations r2
         WHERE r2.cpf = registrations.cpf
           AND r2.event_id = registrations.event_id
           AND (r2.registration_status = 'confirmed' OR r2.payment_status = 'approved')
       )
  LOOP
    -- Pick the oldest pending to keep
    SELECT id INTO reg_to_keep_id
    FROM registrations
    WHERE cpf = rec.cpf
      AND event_id = rec.event_id
      AND registration_status = 'pending_payment'
      AND payment_status <> 'approved'
    ORDER BY created_at ASC
    LIMIT 1;

    -- Log each cancellation
    INSERT INTO audit_logs (action, entity_type, entity_id, details)
    SELECT
      'duplicate_cleanup_pending_only',
      'registration',
      r.id,
      jsonb_build_object(
        'cpf', r.cpf,
        'event_id', r.event_id,
        'reason', 'Multiple pending registrations — kept oldest, canceled the rest',
        'kept_registration_id', reg_to_keep_id,
        'canceled_registration_id', r.id,
        'order_id', r.order_id
      )
    FROM registrations r
    WHERE r.cpf = rec.cpf
      AND r.event_id = rec.event_id
      AND r.registration_status = 'pending_payment'
      AND r.payment_status <> 'approved'
      AND r.id <> reg_to_keep_id;

    -- DOUBLE-FILTERED UPDATE — defense in depth
    UPDATE registrations
    SET registration_status = 'canceled',
        payment_status = 'canceled',
        updated_at = now()
    WHERE cpf = rec.cpf
      AND event_id = rec.event_id
      AND registration_status = 'pending_payment'
      AND payment_status <> 'approved'
      AND id <> reg_to_keep_id;

    GET DIAGNOSTICS v_canceled_count = ROW_COUNT;
    RAISE NOTICE 'CASE C - CPF %, event %: kept %, canceled %',
                 rec.cpf, rec.event_id, reg_to_keep_id, v_canceled_count;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════
  -- Cancel orders whose ALL registrations are now canceled
  -- (extra safety: never cancel an order that has any confirmed reg)
  -- ═══════════════════════════════════════════════════════════════
  UPDATE orders o
  SET payment_status = 'canceled',
      canceled_at = now(),
      updated_at = now()
  WHERE o.payment_status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.order_id = o.id
        AND (r.registration_status <> 'canceled' OR r.payment_status = 'approved')
    )
    AND EXISTS (
      SELECT 1 FROM registrations r WHERE r.order_id = o.id
    );

  GET DIAGNOSTICS v_orders_canceled = ROW_COUNT;
  RAISE NOTICE 'Orders canceled (all registrations canceled): %', v_orders_canceled;

  -- ═══════════════════════════════════════════════════════════════
  -- POST-CHECK: confirm no confirmed/paid registration was touched
  -- ═══════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_confirmed_at_risk
  FROM audit_logs
  WHERE action = 'duplicate_cleanup_pending_only'
    AND created_at >= now() - interval '1 minute'
    AND (details->>'canceled_registration_id')::uuid IN (
      SELECT id FROM registrations
      WHERE registration_status = 'confirmed' OR payment_status = 'approved'
    );

  IF v_confirmed_at_risk > 0 THEN
    RAISE EXCEPTION 'SAFETY VIOLATION: % confirmed registration(s) were affected. Aborting.', v_confirmed_at_risk;
  END IF;

  RAISE NOTICE '✓ Cleanup complete. No confirmed/paid registrations were modified.';
END $$;