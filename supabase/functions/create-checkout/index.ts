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
      if (!p.full_name?.trim() || !p.email?.trim() || !p.cpf?.trim()) {
        return new Response(JSON.stringify({ error: `Dados incompletos para participante ${p.full_name || "sem nome"}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!isValidEmail(p.email)) {
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

    // Check CPF uniqueness per event (server-side)
    const participantCpfs = participants.map((p: any) => p.cpf.replace(/\D/g, ""));
    const { data: existingRegs } = await supabase
      .from("registrations")
      .select("cpf, full_name")
      .eq("event_id", event_id)
      .in("cpf", participantCpfs)
      .in("registration_status", ["pending_payment", "confirmed"]);

    if (existingRegs && existingRegs.length > 0) {
      const names = existingRegs.map((r: any) => r.full_name).join(", ");
      return new Response(JSON.stringify({ error: `Já existe inscrição neste evento para: ${names}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        buyer_email: buyer.email,
        buyer_phone: buyer.phone,
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

    // Create individual registrations
    const registrationInserts = participants.map((p: any) => ({
      event_id,
      order_id: order.id,
      registration_code: generateCode("INS"),
      full_name: p.full_name.trim(),
      email: p.email.trim().toLowerCase(),
      phone: p.phone,
      cpf: p.cpf.replace(/\D/g, ""),
      birth_date: p.birth_date || null,
      area: p.area || null,
      congregation: p.congregation || null,
      church_role: p.church_role || null,
      church_function: p.church_function || null,
      consent_terms,
      consent_data_usage,
      registration_type: purchase_type,
      registration_status: "pending_payment",
      payment_status: "pending",
    }));

    const { error: regError } = await supabase
      .from("registrations")
      .insert(registrationInserts);

    if (regError) {
      console.error("Registration creation error:", regError);
      return new Response(JSON.stringify({ error: "Erro ao criar inscrições" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      action: "order_created",
      entity_type: "order",
      entity_id: order.id,
      details: { order_code: orderCode, purchase_type, participants_count: participantsCount, total_price_cents: totalPriceCents },
    });

    // InfinitePay checkout integration (prepared but uses placeholder)
    // In production, call InfinitePay API here to create checkout link
    const infinitepayApiKey = Deno.env.get("INFINITEPAY_API_KEY");
    const infinitepayHandle = Deno.env.get("INFINITEPAY_HANDLE");
    const appUrl = Deno.env.get("APP_URL") || "https://id-preview--c662d13e-a60d-4d31-b515-d92eabc6eb77.lovable.app";

    let paymentLink: string | null = null;

    if (infinitepayApiKey && infinitepayHandle) {
      try {
        // InfinitePay API call
        const checkoutPayload = {
          handle: infinitepayHandle,
          order_nsu: orderNsu,
          amount: totalPriceCents,
          items: participants.map((p: any) => ({
            description: `Inscrição - ${event.title} - ${p.full_name}`,
            quantity: 1,
            amount: unitPriceCents,
          })),
          redirect_url: `${appUrl}/pedido/${orderCode}?status=redirect`,
          webhook_url: `${supabaseUrl}/functions/v1/payment-webhook`,
        };

        const ipRes = await fetch("https://api.infinitepay.io/v2/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${infinitepayApiKey}`,
          },
          body: JSON.stringify(checkoutPayload),
        });

        if (ipRes.ok) {
          const ipData = await ipRes.json();
          paymentLink = ipData.checkout_url || ipData.url || null;
        }
      } catch (err) {
        console.error("InfinitePay error:", err);
      }
    }

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
