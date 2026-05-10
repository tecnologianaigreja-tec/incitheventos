import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "missing_auth" }, 401);

    // Validate caller is admin
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_auth" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdminData } = await admin.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdminData) return json({ error: "not_authorized" }, 403);

    const body = await req.json().catch(() => ({}));
    const orderId = body?.order_id as string | undefined;
    const reason = (body?.reason as string | undefined)?.trim() || "Cancelado pelo administrador";
    if (!orderId) return json({ error: "missing_order_id" }, 400);
    if (reason.length < 5) return json({ error: "reason_too_short" }, 400);

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, order_code, payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr || !order) return json({ error: "order_not_found" }, 404);
    if (order.payment_status === "canceled") return json({ ok: true, already: true });

    const now = new Date().toISOString();

    const { error: updOrderErr } = await admin
      .from("orders")
      .update({ payment_status: "canceled", canceled_at: now })
      .eq("id", orderId);
    if (updOrderErr) return json({ error: updOrderErr.message }, 500);

    const { error: updRegErr } = await admin
      .from("registrations")
      .update({
        registration_status: "canceled",
        payment_status: "canceled",
      })
      .eq("order_id", orderId);
    if (updRegErr) return json({ error: updRegErr.message }, 500);

    await admin.from("audit_logs").insert({
      actor_id: userData.user.id,
      entity_id: orderId,
      entity_type: "order",
      action: "order_canceled",
      details: { reason, order_code: order.order_code },
    });

    return json({ ok: true, order_code: order.order_code });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
