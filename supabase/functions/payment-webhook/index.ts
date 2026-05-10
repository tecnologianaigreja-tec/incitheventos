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
  if (typeof payload.paid_amount === "number" && payload.paid_amount > 0) return "approved";
  if (payload.receipt_url && typeof payload.receipt_url === "string") return "approved";
  const status = (payload.status || payload.event_type || payload.type || "").toString().toLowerCase().trim();
  if (!status) return null;
  if (status.includes("approv") || status.includes("paid") || status.includes("success") || status.includes("confirm") || status.includes("captur") || status.includes("complet")) return "approved";
  if (status.includes("refus") || status.includes("declin") || status.includes("fail") || status.includes("reject")) return "refused";
  if (status.includes("cancel") || status.includes("void")) return "canceled";
  if (status.includes("expir")) return "expired";
  if (status.includes("refund") || status.includes("revers") || status.includes("chargeback")) return "refunded";
  return null;
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

    // Prefer event_id to avoid idempotency collisions on the same transaction ID
    const externalId =
      payload.event_id ||
      payload.webhook_id ||
      payload.id ||
      null;

    const eventType =
      payload.event_type ||
      payload.type ||
      payload.status ||
      "webhook_call";

    const invoiceSlug = payload.invoice_slug || payload.metadata?.invoice_slug || null;

    if (!orderNsu && !invoiceSlug) {
      console.error("[webhook] Missing order_nsu and invoice_slug in payload");
      return respond({ error: "Missing order_nsu" }, 400);
    }

    // ── Find order ───────────────────────────────────────────────────
    let order: any = null;
    let orderError: any = null;

    if (orderNsu) {
      const res = await supabase.from("orders").select("*").eq("order_nsu", orderNsu).single();
      order = res.data;
      orderError = res.error;
    } else if (invoiceSlug) {
      const res = await supabase.from("orders").select("*").eq("invoice_slug", invoiceSlug).single();
      order = res.data;
      orderError = res.error;
    }

    if (!order || orderError) {
      console.error("[webhook] Order not found for nsu:", orderNsu, "slug:", invoiceSlug, orderError);
      return respond({ error: "Order not found" }, 404);
    }

    console.log("[webhook] Order found:", order.id, "current status:", order.payment_status);

    // ── Idempotency check ────────────────────────────────────────────
    if (externalId) {
      const { data: existing } = await supabase
        .from("payment_events")
        .select("id")
        .eq("external_event_id", externalId)
        .eq("event_type", eventType) // Only block if it's the exact same EVENT TYPE
        .eq("processed", true)
        .maybeSingle();

      if (existing) {
        console.log("[webhook] Already processed event:", externalId, eventType);
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

    // ── Amount validation: detect mismatch with current order total ──
    // (e.g. user paid an old batch link before someone splittered out)
    if (paymentStatus === "approved" && typeof payload.paid_amount === "number") {
      const expected = order.total_price_cents;
      const paid = payload.paid_amount;
      if (paid !== expected) {
        console.warn("[webhook] Amount mismatch — paid:", paid, "expected:", expected, "order:", order.id);
        await supabase.from("audit_logs").insert({
          action: "payment_amount_mismatch",
          entity_type: "order",
          entity_id: order.id,
          details: {
            paid_amount_cents: paid,
            expected_amount_cents: expected,
            difference_cents: paid - expected,
            order_code: order.order_code,
            note: paid > expected
              ? "Cliente pagou link antigo do lote (alguém splittou no meio); confirmando os pendentes restantes desta order"
              : "Pagou valor inferior ao atual; confirmando mesmo assim pois InfinitePay já recebeu",
          },
        });
      }
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
