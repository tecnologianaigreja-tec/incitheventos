import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Determine payment status from InfinitePay webhook payload.
 * InfinitePay sends different payload shapes depending on the event:
 * - Successful PIX/card: { paid_amount: 5000, amount: 5000, receipt_url: "...", ... }
 * - Refund/chargeback: { status: "refunded", ... }
 * - Expiration: { status: "expired", ... }
 *
 * Key rule: if `paid_amount` exists and is > 0, payment is approved.
 * If `receipt_url` exists, payment is approved.
 * Otherwise fall back to `status` field mapping.
 */
function resolvePaymentStatus(payload: Record<string, any>): string | null {
  // Primary: InfinitePay confirmed payment — paid_amount present and > 0
  if (
    typeof payload.paid_amount === "number" &&
    payload.paid_amount > 0
  ) {
    return "approved";
  }

  // Secondary: receipt_url is a strong signal of completed payment
  if (payload.receipt_url && typeof payload.receipt_url === "string") {
    return "approved";
  }

  // Tertiary: explicit status field
  const status = (
    payload.status ||
    payload.event_type ||
    payload.type ||
    ""
  )
    .toString()
    .toLowerCase()
    .trim();

  if (!status) return null;

  const statusMap: Record<string, string> = {
    approved: "approved",
    paid: "approved",
    captured: "approved",
    completed: "approved",
    success: "approved",
    confirmed: "approved",
    refused: "refused",
    declined: "refused",
    failed: "refused",
    rejected: "refused",
    canceled: "canceled",
    cancelled: "canceled",
    voided: "canceled",
    expired: "expired",
    refunded: "refunded",
    reversed: "refunded",
    chargeback: "refunded",
  };

  return statusMap[status] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const respond = (body: Record<string, any>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log("[webhook] Payload received:", JSON.stringify(payload));

    // ── Extract identifiers ──────────────────────────────────────────
    const orderNsu =
      payload.order_nsu ||
      payload.nsu ||
      payload.metadata?.order_nsu ||
      null;

    const externalId =
      payload.transaction_nsu ||
      payload.id ||
      payload.event_id ||
      payload.transaction_id ||
      null;

    const eventType =
      payload.event_type ||
      payload.type ||
      payload.status ||
      "webhook_call";

    if (!orderNsu) {
      console.error("[webhook] Missing order_nsu in payload");
      return respond({ error: "Missing order_nsu" }, 400);
    }

    // ── Find order ───────────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("order_nsu", orderNsu)
      .single();

    if (!order || orderError) {
      console.error("[webhook] Order not found for nsu:", orderNsu, orderError);
      return respond({ error: "Order not found" }, 404);
    }

    console.log("[webhook] Order found:", order.id, "current status:", order.payment_status);

    // ── Idempotency check ────────────────────────────────────────────
    if (externalId) {
      const { data: existing } = await supabase
        .from("payment_events")
        .select("id")
        .eq("external_event_id", externalId)
        .eq("processed", true)
        .single();

      if (existing) {
        console.log("[webhook] Already processed event:", externalId);
        return respond({ message: "Already processed" });
      }
    }

    // ── Log the raw event ────────────────────────────────────────────
    const { data: eventRecord, error: insertError } = await supabase
      .from("payment_events")
      .insert({
        order_id: order.id,
        provider: "infinitepay",
        event_type: eventType,
        external_event_id: externalId,
        raw_payload_json: payload,
        processed: false,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[webhook] Failed to log payment event:", insertError);
    }

    // ── Resolve payment status ───────────────────────────────────────
    const paymentStatus = resolvePaymentStatus(payload);

    console.log("[webhook] Resolved status:", {
      paymentStatus,
      eventType,
      paid_amount: payload.paid_amount,
      receipt_url: payload.receipt_url,
      raw_status: payload.status,
    });

    if (!paymentStatus) {
      console.warn("[webhook] Could not determine payment status — logging only");
      // Mark as processed so we don't re-process, but don't change order
      if (eventRecord?.id) {
        await supabase
          .from("payment_events")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("id", eventRecord.id);
      }
      return respond({ message: "Event logged, status unknown" });
    }

    // ── Don't downgrade: if order is already approved, skip ──────────
    if (order.payment_status === "approved" && paymentStatus !== "refunded") {
      console.log("[webhook] Order already approved, skipping update");
      if (eventRecord?.id) {
        await supabase
          .from("payment_events")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("id", eventRecord.id);
      }
      return respond({ message: "Order already approved" });
    }

    // ── Update order ─────────────────────────────────────────────────
    const orderUpdate: Record<string, any> = {
      payment_status: paymentStatus,
      webhook_status_last_seen: paymentStatus,
      payment_provider_reference: externalId || order.payment_provider_reference,
    };
    if (paymentStatus === "approved") orderUpdate.paid_at = new Date().toISOString();
    if (paymentStatus === "canceled") orderUpdate.canceled_at = new Date().toISOString();

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update(orderUpdate)
      .eq("id", order.id);

    if (orderUpdateError) {
      console.error("[webhook] CRITICAL: Failed to update order:", orderUpdateError);
      return respond({ error: "Failed to update order" }, 500);
    }

    console.log("[webhook] Order updated to:", paymentStatus);

    // ── Update registrations ─────────────────────────────────────────
    if (paymentStatus === "approved") {
      // Fetch all registrations for this order
      const { data: regs, error: regsError } = await supabase
        .from("registrations")
        .select("id")
        .eq("order_id", order.id);

      if (regsError) {
        console.error("[webhook] CRITICAL: Failed to fetch registrations:", regsError);
      } else if (regs && regs.length > 0) {
        for (const reg of regs) {
          const qrToken = crypto.randomUUID();
          const { error: regUpdateError } = await supabase
            .from("registrations")
            .update({
              payment_status: "approved",
              registration_status: "confirmed",
              qr_token: qrToken,
              qr_generated_at: new Date().toISOString(),
            })
            .eq("id", reg.id);

          if (regUpdateError) {
            console.error("[webhook] CRITICAL: Failed to update registration:", reg.id, regUpdateError);
          }
        }
        console.log("[webhook] Updated", regs.length, "registration(s) to confirmed");
      } else {
        console.warn("[webhook] No registrations found for order:", order.id);
      }
    } else if (paymentStatus === "canceled" || paymentStatus === "refused") {
      const { error: regUpdateError } = await supabase
        .from("registrations")
        .update({
          payment_status: paymentStatus,
          registration_status: "canceled",
        })
        .eq("order_id", order.id);

      if (regUpdateError) {
        console.error("[webhook] Failed to cancel registrations:", regUpdateError);
      }
    } else {
      await supabase
        .from("registrations")
        .update({ payment_status: paymentStatus })
        .eq("order_id", order.id);
    }

    // ── Mark payment event as processed ──────────────────────────────
    if (eventRecord?.id) {
      await supabase
        .from("payment_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("id", eventRecord.id);
    }

    // ── Audit log ────────────────────────────────────────────────────
    await supabase.from("audit_logs").insert({
      action: "payment_status_changed",
      entity_type: "order",
      entity_id: order.id,
      details: {
        new_status: paymentStatus,
        event_type: eventType,
        external_id: externalId,
        paid_amount: payload.paid_amount,
      },
    });

    console.log("[webhook] Processing complete for order:", order.order_code);

    return respond({ message: "Webhook processed", status: paymentStatus });
  } catch (err) {
    console.error("[webhook] Unexpected error:", err);
    return respond({ error: "Internal server error" }, 500);
  }
});
