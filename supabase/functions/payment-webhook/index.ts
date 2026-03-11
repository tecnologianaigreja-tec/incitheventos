import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log("Webhook received payload:", JSON.stringify(payload));

    const eventType = payload.event_type || payload.type || payload.status || "unknown";
    const externalId = payload.id || payload.event_id || payload.transaction_id || payload.transaction_nsu || null;
    const orderNsu = payload.order_nsu || payload.nsu || payload.metadata?.order_nsu || null;

    if (!orderNsu) {
      console.error("Webhook: missing order_nsu");
      return new Response(JSON.stringify({ error: "Missing order_nsu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("order_nsu", orderNsu)
      .single();

    if (!order || orderError) {
      console.error("Webhook: order not found for nsu:", orderNsu);
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Idempotency: check if already processed
    if (externalId) {
      const { data: existing } = await supabase
        .from("payment_events")
        .select("id")
        .eq("external_event_id", externalId)
        .eq("processed", true)
        .single();

      if (existing) {
        return new Response(JSON.stringify({ message: "Already processed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Log the event
    await supabase.from("payment_events").insert({
      order_id: order.id,
      provider: "infinitepay",
      event_type: eventType,
      external_event_id: externalId,
      raw_payload_json: payload,
      processed: false,
    });

    // Map status
    let paymentStatus: string | null = null;
    const status = (payload.status || payload.event_type || "").toLowerCase();

    // InfinitePay specific: if paid_amount exists and > 0, it's a successful payment
    if (payload.paid_amount && payload.paid_amount > 0) {
      paymentStatus = "approved";
    } else if (["approved", "paid", "captured", "completed", "success"].includes(status)) {
      paymentStatus = "approved";
    } else if (["refused", "declined", "failed", "rejected"].includes(status)) {
      paymentStatus = "refused";
    } else if (["canceled", "cancelled", "voided"].includes(status)) {
      paymentStatus = "canceled";
    } else if (["expired"].includes(status)) {
      paymentStatus = "expired";
    } else if (["refunded", "reversed"].includes(status)) {
      paymentStatus = "refunded";
    }

    console.log("Webhook mapped status:", { eventType, status, paymentStatus, paid_amount: payload.paid_amount });

    if (paymentStatus) {
      // Update order
      const updateData: any = {
        payment_status: paymentStatus,
        webhook_status_last_seen: paymentStatus,
      };
      if (paymentStatus === "approved") updateData.paid_at = new Date().toISOString();
      if (paymentStatus === "canceled") updateData.canceled_at = new Date().toISOString();

      await supabase.from("orders").update(updateData).eq("id", order.id);

      // Update all registrations for this order
      const regUpdate: any = { payment_status: paymentStatus };
      if (paymentStatus === "approved") {
        regUpdate.registration_status = "confirmed";
        // Generate QR tokens
        const { data: regs } = await supabase
          .from("registrations")
          .select("id")
          .eq("order_id", order.id);

        if (regs) {
          for (const reg of regs) {
            const qrToken = crypto.randomUUID();
            await supabase.from("registrations").update({
              ...regUpdate,
              qr_token: qrToken,
              qr_generated_at: new Date().toISOString(),
            }).eq("id", reg.id);
          }
        }
      } else if (paymentStatus === "canceled" || paymentStatus === "refused") {
        regUpdate.registration_status = "canceled";
        await supabase.from("registrations").update(regUpdate).eq("order_id", order.id);
      } else {
        await supabase.from("registrations").update(regUpdate).eq("order_id", order.id);
      }

      // Mark event as processed
      if (externalId) {
        await supabase.from("payment_events")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("external_event_id", externalId)
          .eq("order_id", order.id);
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        action: "payment_status_changed",
        entity_type: "order",
        entity_id: order.id,
        details: { new_status: paymentStatus, event_type: eventType },
      });
    }

    return new Response(
      JSON.stringify({ message: "Webhook processed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
