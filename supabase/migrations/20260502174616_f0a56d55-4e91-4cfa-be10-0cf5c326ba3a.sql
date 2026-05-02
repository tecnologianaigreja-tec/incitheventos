-- Backfill checkin_days from legacy registrations.checkin_at
-- Maps each legacy check-in to a date within the event period.
INSERT INTO public.checkin_days (registration_id, event_id, event_day, checked_at, checked_by_user_id)
SELECT
  r.id,
  r.event_id,
  -- Use the date portion of checkin_at in America/Sao_Paulo timezone,
  -- clamped to the event's [start_date, end_date] range so it always falls
  -- on a valid event day.
  GREATEST(
    e.start_date,
    LEAST(
      e.end_date,
      (r.checkin_at AT TIME ZONE 'America/Sao_Paulo')::date
    )
  ) AS event_day,
  r.checkin_at,
  r.checkin_by_user_id
FROM public.registrations r
JOIN public.events e ON e.id = r.event_id
WHERE r.checkin_status = 'checked_in'
  AND r.checkin_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.checkin_days cd WHERE cd.registration_id = r.id
  )
ON CONFLICT (registration_id, event_day) DO NOTHING;