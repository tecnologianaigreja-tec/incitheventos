-- Cancel legacy pending orders that have no buyer_email.
-- These were created before buyer email became required and can never
-- generate a valid InfinitePay link. Cancelling them frees the CPF so
-- the user can re-register and provide a valid email.
UPDATE public.registrations
SET registration_status = 'canceled',
    payment_status = 'canceled',
    updated_at = now()
WHERE registration_status = 'pending_payment'
  AND order_id IN (
    SELECT id FROM public.orders
    WHERE payment_status = 'pending'
      AND (buyer_email IS NULL OR btrim(buyer_email) = '')
  );

UPDATE public.orders
SET payment_status = 'canceled',
    canceled_at = now(),
    updated_at = now()
WHERE payment_status = 'pending'
  AND (buyer_email IS NULL OR btrim(buyer_email) = '');