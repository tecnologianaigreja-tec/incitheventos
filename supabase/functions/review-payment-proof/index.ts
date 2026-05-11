// Admin-only: approve or reject a payment proof.
// On approval, runs the same flow as manual-confirm-order.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";
import { approveOrder } from "../_shared/approveOrder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function approveOrder(supabase: any, order: any, actorId: string, proofId: string) {
  const nowIso = new Date().toISOString();
  await supabase
    .from("orders")
    .update({
      payment_status: "approved",
      paid_at: nowIso,
      webhook_status_last_seen: order.webhook_status_last_seen ?? "proof_approved",
      updated_at: nowIso,
    })
    .eq("id", order.id);

  const { data: regs } = await supabase
    .from("registrations")
    .select("id, qr_token")
    .eq("order_id", order.id);

  let confirmed = 0;
  if (regs?.length) {
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
      const { error } = await supabase.from("registrations").update(update).eq("id", reg.id);
      if (!error) confirmed += 1;
    }
  }

  await supabase.from("payment_events").insert({
    order_id: order.id,
    provider: "infinitepay",
    event_type: "proof_approved",
    external_event_id: `proof:${proofId}`,
    raw_payload_json: { source: "admin_proof_review", actor_id: actorId, proof_id: proofId },
    processed: true,
    processed_at: nowIso,
  });

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "payment_proof_approved",
    entity_type: "order",
    entity_id: order.id,
    details: { order_code: order.order_code, proof_id: proofId, confirmed_registrations: confirmed },
  });

  return confirmed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return respond({ error: "Não autenticado" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return respond({ error: "Não autenticado" }, 401);

    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) return respond({ error: "Acesso negado" }, 403);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    const proofId = typeof body.proof_id === "string" ? body.proof_id : null;
    const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!proofId || !action) return respond({ error: "proof_id e action obrigatórios" }, 400);
    if (action === "reject" && note.length < 3) {
      return respond({ error: "Informe o motivo da rejeição" }, 400);
    }

    const { data: proof } = await supabase
      .from("payment_proofs")
      .select("*")
      .eq("id", proofId)
      .maybeSingle();
    if (!proof) return respond({ error: "Comprovante não encontrado" }, 404);
    if (proof.status !== "pending") {
      return respond({ error: `Comprovante já foi ${proof.status}` }, 400);
    }

    const nowIso = new Date().toISOString();
    let confirmedCount = 0;

    if (action === "approve") {
      const { data: order } = await supabase
        .from("orders")
        .select("*")
        .eq("id", proof.order_id)
        .maybeSingle();
      if (!order) return respond({ error: "Pedido não encontrado" }, 404);
      if (order.payment_status === "approved") {
        // Already approved — just mark proof as approved
        await supabase
          .from("payment_proofs")
          .update({ status: "approved", reviewed_by: user.id, reviewed_at: nowIso, reviewer_note: note || null })
          .eq("id", proofId);
        return respond({ ok: true, order_code: order.order_code, already_approved: true });
      }
      if (order.payment_status !== "pending") {
        return respond({ error: `Pedido está ${order.payment_status}` }, 400);
      }
      confirmedCount = await approveOrder(supabase, order, user.id, proofId);
    }

    await supabase
      .from("payment_proofs")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        reviewed_by: user.id,
        reviewed_at: nowIso,
        reviewer_note: note || null,
      })
      .eq("id", proofId);

    if (action === "reject") {
      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        action: "payment_proof_rejected",
        entity_type: "order",
        entity_id: proof.order_id,
        details: { proof_id: proofId, note: note || null },
      });
    }

    return respond({ ok: true, action, confirmed_registrations: confirmedCount });
  } catch (err) {
    console.error("[review-payment-proof] unexpected:", err);
    return respond({ error: "Erro interno" }, 500);
  }
});
