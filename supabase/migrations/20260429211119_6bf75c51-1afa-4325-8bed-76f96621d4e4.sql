-- 1) Backfill invoice_slug para pedidos pendentes que têm payment_link mas não têm slug.
-- O slug usado pela InfinitePay é o parâmetro `lenc` da URL do checkout.
UPDATE public.orders
SET invoice_slug = substring(payment_link from 'lenc=([^&]+)')
WHERE payment_status = 'pending'
  AND payment_link IS NOT NULL
  AND invoice_slug IS NULL;

-- 2) Confirmar manualmente o pedido PED-8XHGYAYA (Zaqueu de Souza Amaral)
-- O usuário enviou comprovante PIX Santander de R$50,00 em 29/04/2026 17:47:50.
WITH target AS (
  SELECT id, order_code, total_price_cents
  FROM public.orders
  WHERE order_code = 'PED-8XHGYAYA'
), updated_order AS (
  UPDATE public.orders o
  SET payment_status = 'approved',
      paid_at = '2026-04-29 20:47:50+00',
      webhook_status_last_seen = COALESCE(o.webhook_status_last_seen, 'manual_confirmation'),
      updated_at = now()
  FROM target t
  WHERE o.id = t.id AND o.payment_status = 'pending'
  RETURNING o.id
), updated_regs AS (
  UPDATE public.registrations r
  SET payment_status = 'approved',
      registration_status = 'confirmed',
      qr_token = COALESCE(r.qr_token, gen_random_uuid()::text),
      qr_generated_at = COALESCE(r.qr_generated_at, now()),
      updated_at = now()
  FROM target t
  WHERE r.order_id = t.id
  RETURNING r.id
), audit_ins AS (
  INSERT INTO public.audit_logs (action, entity_type, entity_id, details)
  SELECT 'manual_payment_confirmation',
         'order',
         t.id,
         jsonb_build_object(
           'order_code', t.order_code,
           'reason', 'Comprovante PIX Santander recebido manualmente (R$50,00 em 29/04/2026 17:47:50). ID transacao: E9040088820260429204760455941987. QRCC5s9yZr0jeKgvCTId6iTWg.',
           'paid_amount_cents', t.total_price_cents,
           'source', 'admin_manual_migration'
         )
  FROM target t
  RETURNING 1
), payment_event_ins AS (
  INSERT INTO public.payment_events (order_id, provider, event_type, external_event_id, raw_payload_json, processed, processed_at)
  SELECT t.id,
         'infinitepay',
         'manual_confirmation',
         'manual:E9040088820260429204760455941987',
         jsonb_build_object('source','manual_migration','pix_id','QRCC5s9yZr0jeKgvCTId6iTWg','paid_amount', t.total_price_cents),
         true,
         now()
  FROM target t
  RETURNING 1
)
SELECT 1;