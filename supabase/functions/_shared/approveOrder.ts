/**
 * Shared order-approval logic used by multiple Edge Functions.
 * Centralises the approve-order + confirm-registrations + generate-QR flow
 * so that any bug-fix or change is applied in a single place.
 */

interface ApproveOptions {
  supabase: any;
  order: { id: string; order_code?: string; total_price_cents?: number; webhook_status_last_seen?: string | null };
  source: string;
  actorId?: string | null;
  externalEventId?: string | null;
  rawPayload?: Record<string, unknown>;
  eventType?: string;
}

interface ApproveResult {
  confirmedCount: number;
}

export async function approveOrder(opts: ApproveOptions): Promise<ApproveResult> {
  const { supabase, order, source, actorId, externalEventId, rawPayload, eventType } = opts;
  const nowIso = new Date().toISOString();

  // Optimistic lock: re-read the order status before writing to prevent
  // double-approval when two concurrent callers (e.g. webhook + reconcile)
  // both see "pending" and both call approveOrder at the same time.
  const { data: current } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("id", order.id)
    .single();

  if (current?.payment_status === "approved") {
    console.log("[approveOrder] Order already approved, skipping (race guard):", order.id);
    return { confirmedCount: 0 };
  }

  // 1. Update order status
  await supabase
    .from("orders")
    .update({
      payment_status: "approved",
      paid_at: nowIso,
      webhook_status_last_seen: order.webhook_status_last_seen ?? source,
      updated_at: nowIso,
    })
    .eq("id", order.id);

  // 2. Confirm all registrations + generate QR tokens
  const { data: regs } = await supabase
    .from("registrations")
    .select("id, qr_token")
    .eq("order_id", order.id);

  let confirmedCount = 0;
  if (regs && regs.length > 0) {
    for (const reg of regs) {
      const update: Record<string, unknown> = {
        payment_status: "approved",
        registration_status: "confirmed",
        updated_at: nowIso,
      };
      if (!reg.qr_token) {
        update.qr_token = crypto.randomUUID();
        update.qr_generated_at = nowIso;
      }
      const { error } = await supabase
        .from("registrations")
        .update(update)
        .eq("id", reg.id);
      if (!error) confirmedCount += 1;
    }
  }

  // 3. Record payment event
  await supabase.from("payment_events").insert({
    order_id: order.id,
    provider: "infinitepay",
    event_type: eventType || source,
    external_event_id: externalEventId || null,
    raw_payload_json: rawPayload || { source, actor_id: actorId },
    processed: true,
    processed_at: nowIso,
  });

  // 4. Audit log
  await supabase.from("audit_logs").insert({
    actor_id: actorId || null,
    action: `payment_${source}`,
    entity_type: "order",
    entity_id: order.id,
    details: {
      order_code: order.order_code,
      source,
      confirmed_registrations: confirmedCount,
    },
  });

  return { confirmedCount };
}
