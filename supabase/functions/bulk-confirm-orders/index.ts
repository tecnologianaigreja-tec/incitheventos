// Admin-only: confirm multiple pending orders at once with a single reason.

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

    const orderIds = Array.isArray(body.order_ids) ? (body.order_ids as unknown[]).filter((x) => typeof x === "string") as string[] : [];
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const proofRef = typeof body.proof_reference === "string" ? body.proof_reference.trim() : "";

    if (orderIds.length === 0) return respond({ error: "Selecione ao menos 1 pedido" }, 400);
    if (orderIds.length > 100) return respond({ error: "Máximo de 100 pedidos por vez" }, 400);
    if (reason.length < 5) return respond({ error: "Motivo é obrigatório (mín. 5 caracteres)" }, 400);

    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .in("id", orderIds);

    const results: Array<{ order_id: string; order_code?: string; ok: boolean; reason?: string; confirmed?: number }> = [];
    const nowIso = new Date().toISOString();

    for (const order of orders || []) {
      if (order.payment_status !== "pending") {
        results.push({ order_id: order.id, order_code: order.order_code, ok: false, reason: `status=${order.payment_status}` });
        continue;
      }

      await supabase
        .from("orders")
        .update({
          payment_status: "approved",
          paid_at: nowIso,
          webhook_status_last_seen: order.webhook_status_last_seen ?? "manual_bulk",
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
        event_type: "manual_bulk_confirmation",
        external_event_id: proofRef ? `manual_bulk:${proofRef}` : null,
        raw_payload_json: { source: "admin_bulk", reason, proof_reference: proofRef || null, actor_id: user.id },
        processed: true,
        processed_at: nowIso,
      });

      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        action: "manual_bulk_confirmation",
        entity_type: "order",
        entity_id: order.id,
        details: {
          order_code: order.order_code,
          reason,
          proof_reference: proofRef || null,
          confirmed_registrations: confirmed,
          batch_size: orderIds.length,
        },
      });

      results.push({ order_id: order.id, order_code: order.order_code, ok: true, confirmed });
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    return respond({ ok: true, total: results.length, approved: okCount, failed: failCount, results });
  } catch (err) {
    console.error("[bulk-confirm-orders] unexpected:", err);
    return respond({ error: "Erro interno" }, 500);
  }
});
