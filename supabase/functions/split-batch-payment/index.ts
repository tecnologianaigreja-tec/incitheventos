import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateCode(prefix: string, length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = prefix + "-";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function generatePaymentLink(
  supabaseUrl: string,
  event: any,
  order: any,
  participants: any[]
): Promise<string | null> {
  const handle = Deno.env.get("INFINITEPAY_HANDLE");
  const appUrl = Deno.env.get("APP_URL") || "https://incitheventos.lovable.app";
  if (!handle) return null;

  let phoneNumber: string | undefined;
  if (order.buyer_phone) {
    const digits = order.buyer_phone.replace(/\D/g, "");
    phoneNumber = digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  }

  const payload: Record<string, unknown> = {
    handle,
    order_nsu: order.order_nsu,
    amount: order.total_price_cents,
    items: participants.map((p: any) => ({
      description: `Inscrição - ${event.title} - ${p.full_name}`,
      quantity: 1,
      price: event.unit_price_cents,
    })),
    customer: {
      name: order.buyer_name,
      email: order.buyer_email,
      ...(phoneNumber ? { phone_number: phoneNumber } : {}),
    },
    redirect_url: `${appUrl}/pedido/${order.order_code}?status=redirect`,
    webhook_url: `${supabaseUrl}/functions/v1/payment-webhook`,
  };

  try {
    const res = await fetch("https://api.infinitepay.io/invoices/public/checkout/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return data.checkout_url || data.url || data.link || null;
    console.error("[split] InfinitePay error:", data);
    return null;
  } catch (err) {
    console.error("[split] InfinitePay exception:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { registration_id, mode } = body;

    if (!registration_id || typeof registration_id !== "string") {
      return respond({ error: "registration_id obrigatório" }, 400);
    }
    if (mode !== "individual" && mode !== "batch_remaining") {
      return respond({ error: "mode deve ser 'individual' ou 'batch_remaining'" }, 400);
    }

    // 1) Load registration
    const { data: registration, error: regError } = await supabase
      .from("registrations")
      .select("*")
      .eq("id", registration_id)
      .maybeSingle();

    if (regError || !registration) {
      return respond({ error: "Inscrição não encontrada" }, 404);
    }
    if (registration.registration_status !== "pending_payment") {
      return respond({ error: "Inscrição não está pendente de pagamento" }, 400);
    }

    // 2) Load original order
    const { data: originalOrder, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", registration.order_id)
      .maybeSingle();

    if (orderError || !originalOrder) {
      return respond({ error: "Pedido não encontrado" }, 404);
    }
    if (originalOrder.payment_status !== "pending") {
      return respond({ error: "Pedido já não está mais pendente" }, 400);
    }
    if (originalOrder.purchase_type !== "batch") {
      return respond({ error: "Esta operação só é válida para pedidos em lote" }, 400);
    }

    // 3) Load event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", registration.event_id)
      .maybeSingle();

    if (eventError || !event) {
      return respond({ error: "Evento não encontrado" }, 404);
    }
    if (!["published", "closed"].includes(event.status)) {
      return respond({ error: "Evento não está mais disponível para pagamento" }, 400);
    }

    // ─────────────────────────────────────────────────────────────────
    // MODE: batch_remaining → recalculate batch and return its link
    // ─────────────────────────────────────────────────────────────────
    if (mode === "batch_remaining") {
      // Count remaining pending registrations in the original batch
      const { data: remainingRegs } = await supabase
        .from("registrations")
        .select("id, full_name")
        .eq("order_id", originalOrder.id)
        .eq("registration_status", "pending_payment");

      if (!remainingRegs || remainingRegs.length === 0) {
        return respond({ error: "Não há inscrições pendentes neste lote" }, 400);
      }

      const newCount = remainingRegs.length;
      const newTotalCents = newCount * event.unit_price_cents;
      const newOrderNsu = generateCode("NSU");

      // Update the original order: regenerate NSU so InfinitePay treats as new checkout
      await supabase
        .from("orders")
        .update({
          participants_count: newCount,
          total_price_cents: newTotalCents,
          order_nsu: newOrderNsu,
          payment_link: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", originalOrder.id);

      // Get full registrations for the link
      const { data: regsForLink } = await supabase
        .from("registrations")
        .select("*")
        .in("id", remainingRegs.map((r: any) => r.id));

      const refreshed = { ...originalOrder, order_nsu: newOrderNsu, total_price_cents: newTotalCents };
      const link = await generatePaymentLink(supabaseUrl, event, refreshed, regsForLink || []);

      if (link) {
        await supabase.from("orders").update({ payment_link: link }).eq("id", originalOrder.id);
      }

      await supabase.from("audit_logs").insert({
        action: "batch_remaining_link_generated",
        entity_type: "order",
        entity_id: originalOrder.id,
        details: {
          remaining_count: newCount,
          new_total_cents: newTotalCents,
          new_order_nsu: newOrderNsu,
        },
      });

      return respond({
        payment_link: link,
        order_code: originalOrder.order_code,
        total_price_cents: newTotalCents,
        participants_count: newCount,
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // MODE: individual → split this registration into its own order
    // ─────────────────────────────────────────────────────────────────

    // Idempotency: if this registration was already split (already in an
    // individual order with parent_order_id), return its existing link.
    if (
      originalOrder.purchase_type === "batch" &&
      originalOrder.parent_order_id !== null &&
      originalOrder.participants_count === 1
    ) {
      // shouldn't happen but safe fallback
      return respond({
        payment_link: originalOrder.payment_link,
        order_code: originalOrder.order_code,
        total_price_cents: originalOrder.total_price_cents,
        participants_count: 1,
        already_split: true,
      });
    }

    // Create new individual order
    const newOrderCode = generateCode("PED");
    const newOrderNsu = generateCode("NSU");
    const unitPrice = event.unit_price_cents;

    const { data: newOrder, error: newOrderError } = await supabase
      .from("orders")
      .insert({
        event_id: registration.event_id,
        order_code: newOrderCode,
        order_nsu: newOrderNsu,
        purchase_type: "individual",
        parent_order_id: originalOrder.id,
        buyer_name: registration.full_name,
        buyer_email: registration.email,
        buyer_phone: registration.phone || originalOrder.buyer_phone,
        buyer_document: registration.cpf,
        buyer_is_participant: true,
        participants_count: 1,
        unit_price_cents: unitPrice,
        total_price_cents: unitPrice,
        payment_status: "pending",
      })
      .select()
      .single();

    if (newOrderError || !newOrder) {
      console.error("[split] Failed to create individual order:", newOrderError);
      return respond({ error: "Erro ao criar pedido individual" }, 500);
    }

    // Move the registration to the new order
    const { error: moveError } = await supabase
      .from("registrations")
      .update({
        order_id: newOrder.id,
        registration_type: "individual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", registration.id);

    if (moveError) {
      // Rollback: delete the new order we just created
      await supabase.from("orders").delete().eq("id", newOrder.id);
      console.error("[split] Failed to move registration:", moveError);
      return respond({ error: "Erro ao mover inscrição para novo pedido" }, 500);
    }

    // Recalculate the original batch order
    const { data: stillPending } = await supabase
      .from("registrations")
      .select("id")
      .eq("order_id", originalOrder.id)
      .eq("registration_status", "pending_payment");

    const remainingCount = stillPending?.length || 0;
    const newBatchOrderNsu = generateCode("NSU");

    if (remainingCount === 0) {
      // No one left — cancel the original batch order
      await supabase
        .from("orders")
        .update({
          payment_status: "canceled",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", originalOrder.id);
    } else {
      // Update count, total, regenerate NSU and clear old link
      await supabase
        .from("orders")
        .update({
          participants_count: remainingCount,
          total_price_cents: remainingCount * event.unit_price_cents,
          order_nsu: newBatchOrderNsu,
          payment_link: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", originalOrder.id);
    }

    // Generate payment link for the new individual order
    const link = await generatePaymentLink(
      supabaseUrl,
      event,
      { ...newOrder, order_nsu: newOrderNsu },
      [registration]
    );

    if (link) {
      await supabase.from("orders").update({ payment_link: link }).eq("id", newOrder.id);
    }

    await supabase.from("audit_logs").insert({
      action: "registration_split_to_individual",
      entity_type: "registration",
      entity_id: registration.id,
      details: {
        original_order_id: originalOrder.id,
        new_order_id: newOrder.id,
        new_order_code: newOrderCode,
        remaining_in_batch: remainingCount,
      },
    });

    return respond({
      payment_link: link,
      order_code: newOrderCode,
      total_price_cents: unitPrice,
      participants_count: 1,
      original_order_canceled: remainingCount === 0,
    });
  } catch (err) {
    console.error("[split] Unexpected error:", err);
    return respond({ error: "Erro interno do servidor" }, 500);
  }
});
