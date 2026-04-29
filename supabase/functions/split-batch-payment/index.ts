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

function isValidEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function maskCpf(c: string | null | undefined): string {
  const d = (c || "").replace(/\D/g, "");
  if (d.length !== 11) return "***";
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function generatePaymentLink(
  supabase: any,
  supabaseUrl: string,
  event: any,
  order: any,
  participants: any[]
): Promise<string | null> {
  const handle = Deno.env.get("INFINITEPAY_HANDLE");
  const appUrl = Deno.env.get("APP_URL") || "https://incitheventos.lovable.app";
  if (!handle) return null;

  // ── Email fallback: original buyer email may be empty/invalid ──
  let customerEmail = order.buyer_email;
  if (!isValidEmail(customerEmail)) {
    const fallback = participants.find((p: any) => isValidEmail(p.email));
    customerEmail = fallback?.email || null;
  }
  if (!isValidEmail(customerEmail)) {
    console.error("[split] No valid email for checkout — order:", order.id);
    return null;
  }

  // ── Name fallback ──
  let customerName = order.buyer_name;
  if (!customerName || !customerName.trim()) {
    customerName = participants[0]?.full_name || "Comprador";
  }

  let phoneNumber: string | undefined;
  const rawPhone = order.buyer_phone || participants.find((p: any) => p.phone)?.phone;
  if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, "");
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
      name: customerName,
      email: customerEmail,
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
    if (res.ok) {
      const link = data.checkout_url || data.url || data.link || null;
      const slug = data.slug || data.invoice_slug || null;
      if (slug && order.id) {
        try {
          await supabase.from("orders").update({ invoice_slug: slug }).eq("id", order.id);
        } catch (e) {
          console.warn("[split] Could not persist invoice_slug:", e);
        }
      }
      return link;
    }
    console.error("[split] InfinitePay error:", data);
    return null;
  } catch (err) {
    console.error("[split] InfinitePay exception:", err);
    return null;
  }
}

/**
 * Recalculate a batch order based on registrations still pending payment.
 * Returns the refreshed order + the list of pending registrations.
 * Generates a fresh order_nsu and clears the old payment_link so any old
 * checkout link becomes obsolete.
 * If no pending remain, marks the order as canceled.
 */
async function recalculateBatchOrder(
  supabase: any,
  orderId: string,
  unitPriceCents: number
): Promise<{ count: number; total_cents: number; new_order_nsu: string; pending_regs: any[] }> {
  const { data: pendingRegs } = await supabase
    .from("registrations")
    .select("*")
    .eq("order_id", orderId)
    .eq("registration_status", "pending_payment")
    .order("created_at", { ascending: true });

  const list = pendingRegs || [];
  const count = list.length;
  const total = count * unitPriceCents;
  const newNsu = generateCode("NSU");

  if (count === 0) {
    await supabase
      .from("orders")
      .update({
        payment_status: "canceled",
        canceled_at: new Date().toISOString(),
        participants_count: 0,
        total_price_cents: 0,
        payment_link: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
  } else {
    await supabase
      .from("orders")
      .update({
        participants_count: count,
        total_price_cents: total,
        order_nsu: newNsu,
        payment_link: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
  }

  return { count, total_cents: total, new_order_nsu: newNsu, pending_regs: list };
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
    if (!["individual", "batch_remaining", "preview"].includes(mode)) {
      return respond({ error: "mode deve ser 'individual', 'batch_remaining' ou 'preview'" }, 400);
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
    // MODE: preview → just recalculate and report (no link generated)
    // ─────────────────────────────────────────────────────────────────
    if (mode === "preview") {
      const recalc = await recalculateBatchOrder(supabase, originalOrder.id, event.unit_price_cents);
      return respond({
        order_code: originalOrder.order_code,
        unit_price_cents: event.unit_price_cents,
        remaining_count: recalc.count,
        remaining_total_cents: recalc.total_cents,
        remaining_participants: recalc.pending_regs.map((r: any) => ({
          id: r.id,
          name: r.full_name,
          cpf_masked: maskCpf(r.cpf),
        })),
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // MODE: batch_remaining → recalculate + generate link for the lot
    // ─────────────────────────────────────────────────────────────────
    if (mode === "batch_remaining") {
      const recalc = await recalculateBatchOrder(supabase, originalOrder.id, event.unit_price_cents);

      if (recalc.count === 0) {
        return respond({ error: "Não há inscrições pendentes neste lote" }, 400);
      }

      const refreshed = {
        ...originalOrder,
        order_nsu: recalc.new_order_nsu,
        total_price_cents: recalc.total_cents,
        participants_count: recalc.count,
      };
      const refreshedWithId = { ...refreshed, id: originalOrder.id };
      const link = await generatePaymentLink(supabase, supabaseUrl, event, refreshedWithId, recalc.pending_regs);

      if (link) {
        await supabase.from("orders").update({ payment_link: link }).eq("id", originalOrder.id);
      }

      await supabase.from("audit_logs").insert({
        action: "batch_remaining_link_generated",
        entity_type: "order",
        entity_id: originalOrder.id,
        details: {
          remaining_count: recalc.count,
          new_total_cents: recalc.total_cents,
          new_order_nsu: recalc.new_order_nsu,
          link_generated: !!link,
        },
      });

      return respond({
        payment_link: link,
        order_code: originalOrder.order_code,
        total_price_cents: recalc.total_cents,
        participants_count: recalc.count,
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // MODE: individual → split this registration into its own order
    // ─────────────────────────────────────────────────────────────────

    // Create new individual order
    const newOrderCode = generateCode("PED");
    const newOrderNsu = generateCode("NSU");
    const unitPrice = event.unit_price_cents;

    // Pick a valid email for the new individual order
    const indivEmail = isValidEmail(registration.email)
      ? registration.email
      : (isValidEmail(originalOrder.buyer_email) ? originalOrder.buyer_email : null);

    const { data: newOrder, error: newOrderError } = await supabase
      .from("orders")
      .insert({
        event_id: registration.event_id,
        order_code: newOrderCode,
        order_nsu: newOrderNsu,
        purchase_type: "individual",
        parent_order_id: originalOrder.id,
        buyer_name: registration.full_name,
        buyer_email: indivEmail || registration.email || "",
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

    // Recalculate the original batch order using consolidated helper
    const remaining = await recalculateBatchOrder(supabase, originalOrder.id, event.unit_price_cents);

    // Generate payment link for the new individual order
    const link = await generatePaymentLink(
      supabase,
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
        remaining_in_batch: remaining.count,
        original_batch_canceled: remaining.count === 0,
      },
    });

    return respond({
      payment_link: link,
      order_code: newOrderCode,
      total_price_cents: unitPrice,
      participants_count: 1,
      original_order_canceled: remaining.count === 0,
    });
  } catch (err) {
    console.error("[split] Unexpected error:", err);
    return respond({ error: "Erro interno do servidor" }, 500);
  }
});
