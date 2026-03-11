-- Fix Gustavo's registration that was paid but not updated by webhook
-- Order: 0a877068-db69-4975-b220-9ff496f6f0e9
-- Registration: 49baa5fa-6cee-4ae3-8852-a61dae2f4523

UPDATE orders 
SET payment_status = 'approved', 
    paid_at = '2026-03-11T20:38:16Z',
    webhook_status_last_seen = 'approved',
    updated_at = now()
WHERE id = '0a877068-db69-4975-b220-9ff496f6f0e9';

UPDATE registrations 
SET payment_status = 'approved', 
    registration_status = 'confirmed',
    qr_token = gen_random_uuid()::text,
    qr_generated_at = now(),
    updated_at = now()
WHERE id = '49baa5fa-6cee-4ae3-8852-a61dae2f4523';

UPDATE payment_events
SET processed = true, processed_at = now()
WHERE order_id = '0a877068-db69-4975-b220-9ff496f6f0e9';