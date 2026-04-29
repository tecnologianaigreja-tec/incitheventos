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

function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(digits[10]);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { event_id, purchase_type, buyer, participants, buyer_is_participant, consent_terms, consent_data_usage } = body;

    // Validate required fields
    if (!event_id || !purchase_type || !buyer || !participants || !Array.isArray(participants)) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!consent_terms || !consent_data_usage) {
      return new Response(JSON.stringify({ error: "Aceite os termos para continuar" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate participants count
    if (purchase_type === "batch") {
      if (participants.length < 2 || participants.length > 10) {
        return new Response(JSON.stringify({ error: "Lote deve ter de 2 a 10 participantes" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Validate buyer
    if (!buyer.full_name?.trim() || !buyer.cpf?.trim()) {
      return new Response(JSON.stringify({ error: "Nome e CPF do responsável são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!isValidCPF(buyer.cpf)) {
      return new Response(JSON.stringify({ error: "CPF do responsável inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate each participant
    for (const p of participants) {
      if (!p.full_name?.trim() || !p.cpf?.trim()) {
        return new Response(JSON.stringify({ error: `Dados incompletos para participante ${p.full_name || "sem nome"}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (p.email?.trim() && !isValidEmail(p.email)) {
        return new Response(JSON.stringify({ error: `E-mail inválido: ${p.email}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!isValidCPF(p.cpf)) {
        return new Response(JSON.stringify({ error: `CPF inválido para ${p.full_name}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Check duplicate CPFs within the batch
    if (purchase_type === "batch") {
      const seenCpf = new Set<string>();
      for (const p of participants) {
        const cpfClean = p.cpf.replace(/\D/g, "");
        if (seenCpf.has(cpfClean)) {
          return new Response(JSON.stringify({ error: `CPF duplicado no lote: ${p.full_name}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        seenCpf.add(cpfClean);
      }
    }

    // Get event and recalculate price server-side
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", event_id)
      .eq("status", "published")
      .single();

    if (!event || eventError) {
      return new Response(JSON.stringify({ error: "Evento não encontrado ou não disponível" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check CPF uniqueness per event — but if pending, resume existing order
    const participantCpfs = participants.map((p: any) => p.cpf.replace(/\D/g, ""));
    const { data: existingRegs } = await supabase
      .from("registrations")
      .select("cpf, full_name, registration_status, order_id")
      .eq("event_id", event_id)
      .in("cpf", participantCpfs)
      .in("registration_status", ["pending_payment", "confirmed"]);

    const maskCpf = (c: string) => {
      const d = (c || "").replace(/\D/g, "");
      if (d.length !== 11) return "***";
      return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
    };

    if (existingRegs && existingRegs.length > 0) {
      // Block any CPF already CONFIRMED
      const confirmed = existingRegs.filter((r: any) => r.registration_status === "confirmed");
      if (confirmed.length > 0) {
        return new Response(
          JSON.stringify({
            error: "Já existe inscrição confirmada neste evento para o(s) CPF(s) abaixo. Use 'Consultar minha inscrição' para gerar sua credencial.",
            code: "duplicate_confirmed",
            duplicates: confirmed.map((r: any) => ({
              name: r.full_name,
              cpf_masked: maskCpf(r.cpf),
              status: "confirmed",
            })),
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pendingRegs = existingRegs.filter((r: any) => r.registration_status === "pending_payment");

      // RESUME path: only when the user is trying to register the SAME single CPF
      // they already have pending as an INDIVIDUAL order. Strict — no auto-cancel.
      if (
        purchase_type === "individual" &&
        participants.length === 1 &&
        pendingRegs.length === 1
      ) {
        const pendingReg: any = pendingRegs[0];
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("order_code, payment_link, payment_status, total_price_cents, participants_count, purchase_type")
          .eq("id", pendingReg.order_id)
          .single();

        if (
          existingOrder &&
          existingOrder.payment_status === "pending" &&
          existingOrder.purchase_type === "individual"
        ) {
          let paymentLink = existingOrder.payment_link;
          if (!paymentLink) {
            paymentLink = await generatePaymentLink(supabase, supabaseUrl, event, { ...existingOrder, order_nsu: null }, participants);
            if (paymentLink) {
              await supabase.from("orders").update({ payment_link: paymentLink }).eq("id", pendingReg.order_id);
            }
          }
          return new Response(
            JSON.stringify({
              order_code: existingOrder.order_code,
              payment_link: paymentLink,
              total_price_cents: existingOrder.total_price_cents,
              participants_count: existingOrder.participants_count,
              resumed: true,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // All other cases (batch with any pending, individual over batch-pending,
      // multiple pending) → BLOCK. Never auto-cancel.
      if (pendingRegs.length > 0) {
        return new Response(
          JSON.stringify({
            error: "Já existe inscrição pendente neste evento para o(s) CPF(s) abaixo. Use 'Consultar minha inscrição' para concluir o pagamento.",
            code: "duplicate_pending",
            duplicates: pendingRegs.map((r: any) => ({
              name: r.full_name,
              cpf_masked: maskCpf(r.cpf),
              status: "pending_payment",
            })),
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const unitPriceCents = event.unit_price_cents;
    const participantsCount = participants.length;
    const totalPriceCents = participantsCount * unitPriceCents;

    // Create order
    const orderCode = generateCode("PED");
    const orderNsu = generateCode("NSU");

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        event_id,
        order_code: orderCode,
        order_nsu: orderNsu,
        purchase_type,
        buyer_name: buyer.full_name,
        buyer_email: buyer.email || participants[0]?.email || "",
        buyer_phone: buyer.phone || null,
        buyer_document: buyer.cpf.replace(/\D/g, ""),
        buyer_is_participant: buyer_is_participant !== false,
        participants_count: participantsCount,
        unit_price_cents: unitPriceCents,
        total_price_cents: totalPriceCents,
        payment_status: "pending",
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Order creation error:", orderError);
      return new Response(JSON.stringify({ error: "Erro ao criar pedido" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Known registration columns (fixed fields)
    const KNOWN_COLUMNS = new Set([
      "full_name", "email", "phone", "cpf", "birth_date",
      "area", "congregation", "church_role", "church_function",
    ]);

    // Create individual registrations
    const registrationInserts = participants.map((p: any) => {
      // Collect custom fields (anything not in KNOWN_COLUMNS)
      const customFields: Record<string, string> = {};
      for (const [key, val] of Object.entries(p)) {
        if (!KNOWN_COLUMNS.has(key) && typeof val === "string" && val.trim()) {
          customFields[key] = val.trim();
        }
      }

      return {
        event_id,
        order_id: order.id,
        registration_code: generateCode("INS"),
        full_name: p.full_name.trim(),
        email: (p.email || "").trim().toLowerCase(),
        phone: p.phone || null,
        cpf: p.cpf.replace(/\D/g, ""),
        birth_date: p.birth_date || null,
        area: p.area || null,
        congregation: p.congregation || null,
        church_role: p.church_role || null,
        church_function: p.church_function || null,
        custom_fields: customFields,
        consent_terms,
        consent_data_usage,
        registration_type: purchase_type,
        registration_status: "pending_payment",
        payment_status: "pending",
      };
    });

    const { error: regError } = await supabase
      .from("registrations")
      .insert(registrationInserts);

    if (regError) {
      console.error("Registration creation error:", regError);
      // Rollback: delete the order we just created
      await supabase.from("orders").delete().eq("id", order.id);

      const isDup = (regError as any).code === "23505" || /duplicate_active_registration/i.test(regError.message || "");
      if (isDup) {
        return new Response(
          JSON.stringify({
            error: "Já existe inscrição ativa neste evento para um dos CPFs informados. Use 'Consultar minha inscrição' para concluir o pagamento.",
            code: "duplicate_pending",
            duplicates: [],
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "Erro ao criar inscrições" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      action: "order_created",
      entity_type: "order",
      entity_id: order.id,
      details: { order_code: orderCode, purchase_type, participants_count: participantsCount, total_price_cents: totalPriceCents },
    });

    // Generate payment link
    const paymentLink = await generatePaymentLink(supabase, supabaseUrl, event, { ...order, order_nsu: orderNsu }, participants);

    // Update order with payment link if available
    if (paymentLink) {
      await supabase.from("orders").update({ payment_link: paymentLink }).eq("id", order.id);
    }

    await supabase.from("audit_logs").insert({
      action: "checkout_created",
      entity_type: "order",
      entity_id: order.id,
      details: { payment_link: paymentLink ? "generated" : "not_configured" },
    });

    return new Response(
      JSON.stringify({
        order_code: orderCode,
        payment_link: paymentLink,
        total_price_cents: totalPriceCents,
        participants_count: participantsCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generatePaymentLink(
  supabase: any,
  supabaseUrl: string,
  event: any,
  order: any,
  participants: any[]
): Promise<string | null> {
  const infinitepayHandle = Deno.env.get("INFINITEPAY_HANDLE");
  const appUrl = Deno.env.get("APP_URL") || "https://incitheventos.lovable.app";

  if (!infinitepayHandle) {
    console.warn("INFINITEPAY_HANDLE not configured");
    return null;
  }

  try {
    // Format phone to international standard +55XXXXXXXXXXX
    let phoneNumber: string | undefined;
    if (order.buyer_phone) {
      const digits = order.buyer_phone.replace(/\D/g, "");
      phoneNumber = digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
    }

    const checkoutPayload: Record<string, unknown> = {
      handle: infinitepayHandle,
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

    console.log("InfinitePay checkout payload:", JSON.stringify(checkoutPayload));

    const ipRes = await fetch("https://api.infinitepay.io/invoices/public/checkout/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkoutPayload),
    });

    const ipData = await ipRes.json();
    console.log("InfinitePay response:", ipRes.status, JSON.stringify(ipData));

    if (ipRes.ok) {
      const link = ipData.checkout_url || ipData.url || ipData.link || null;
      const slug = ipData.slug || ipData.invoice_slug || null;
      // Persist the invoice slug so we can later check payment status
      // even if the webhook is delayed or missed.
      if (slug) {
        try {
          await supabase.from("orders").update({ invoice_slug: slug }).eq("id", order.id);
        } catch (e) {
          console.warn("Could not persist invoice_slug:", e);
        }
      }
      return link;
    } else {
      console.error("InfinitePay error response:", ipData);
      return null;
    }
  } catch (err) {
    console.error("InfinitePay error:", err);
    return null;
  }
}
