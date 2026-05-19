// Public endpoint: a user who paid PIX outside InfinitePay checkout
// can submit a proof image. We validate that the order exists, is
// pending, and the CPF matches one of the registrations. The image
// has been uploaded by the client to the `payment-proofs` bucket
// using the same anon key. We just record the pointer + message.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    const orderId = typeof body.order_id === "string" ? body.order_id : null;
    const cpfRaw = typeof body.cpf === "string" ? body.cpf : "";
    const imagePath = typeof body.image_path === "string" ? body.image_path.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";

    const cpf = cpfRaw.replace(/\D/g, "");
    if (!orderId) return respond({ error: "order_id obrigatório" }, 400);
    if (cpf.length !== 11) return respond({ error: "CPF inválido" }, 400);
    if (!imagePath) return respond({ error: "Comprovante obrigatório" }, 400);

    // Validate order
    const { data: order } = await supabase
      .from("orders")
      .select("id, payment_status, order_code, event_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return respond({ error: "Pedido não encontrado" }, 404);
    if (order.payment_status !== "pending") {
      return respond({ error: "Este pedido não está mais pendente" }, 400);
    }

    // Validate CPF belongs to one of the registrations
    const { data: regs } = await supabase
      .from("registrations")
      .select("id")
      .eq("order_id", orderId)
      .eq("cpf", cpf)
      .limit(1);
    if (!regs || regs.length === 0) {
      return respond({ error: "CPF não corresponde a este pedido" }, 403);
    }

    // Reject if there's already a pending proof for this order
    const { data: existing } = await supabase
      .from("payment_proofs")
      .select("id")
      .eq("order_id", orderId)
      .eq("status", "pending")
      .limit(1);
    if (existing && existing.length > 0) {
      return respond({
        ok: true,
        already: true,
        message: "Já recebemos um comprovante para esta inscrição. Aguarde a análise.",
      });
    }

    const { error: insertError } = await supabase.from("payment_proofs").insert({
      order_id: orderId,
      event_id: order.event_id || null,
      buyer_cpf: cpf,
      image_url: imagePath,
      message: message || null,
      status: "pending",
    });

    if (insertError) {
      console.error("[submit-payment-proof] insert failed:", insertError);
      return respond({ error: "Não foi possível registrar o comprovante" }, 500);
    }

    await supabase.from("audit_logs").insert({
      action: "payment_proof_submitted",
      entity_type: "order",
      entity_id: orderId,
      details: { order_code: order.order_code, cpf_last4: cpf.slice(-4) },
    });

    return respond({ ok: true, message: "Comprovante recebido. Em breve será analisado." });
  } catch (err) {
    console.error("[submit-payment-proof] unexpected:", err);
    return respond({ error: "Erro interno" }, 500);
  }
});
