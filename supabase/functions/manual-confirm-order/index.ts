// Manually confirm a pending order (admin-only).
// Used when an admin has external proof of payment (e.g. PIX receipt)
// but the InfinitePay webhook never arrived and reconcile-payment can't
// find it via the public API. Same approval flow used by the webhook.
// Requires the caller to be an admin via has_role/is_admin.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth: must be an admin ───────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return respond({ error: "Não autenticado" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return respond({ error: "Não autenticado" }, 401);

    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) return respond({ error: "Acesso negado" }, 403);

    // ── Body ─────────────────────────────────────────────────────────
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const orderId = typeof body.order_id === "string" ? body.order_id : null;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const proofRef = typeof body.proof_reference === "string" ? body.proof_reference.trim() : "";

    if (!orderId) return respond({ error: "order_id obrigatório" }, 400);
    if (reason.length < 5) return respond({ error: "Motivo é obrigatório (mín. 5 caracteres)" }, 400);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) return respond({ error: "Pedido não encontrado" }, 404);
    if (order.payment_status === "approved") {
      return respond({ error: "Pedido já está confirmado" }, 400);
    }
    if (order.payment_status !== "pending") {
      return respond({ error: `Pedido está como '${order.payment_status}', não pode ser confirmado manualmente` }, 400);
    }

    // ── Apply approval ───────────────────────────────────────────────
    const { confirmedCount } = await approveOrder({
      supabase,
      order,
      source: "manual_confirmation",
      actorId: user.id,
      externalEventId: proofRef ? `manual:${proofRef}` : null,
      rawPayload: { source: "admin_manual", reason, proof_reference: proofRef || null, actor_id: user.id },
      eventType: "manual_confirmation",
    });

    return respond({
      ok: true,
      order_code: order.order_code,
      confirmed_registrations: confirmedCount,
    });
  } catch (err) {
    console.error("[manual-confirm-order] Unexpected error:", err);
    return respond({ error: "Erro interno do servidor" }, 500);
  }
});
