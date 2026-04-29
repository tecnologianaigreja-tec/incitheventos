// Reconcile pending payments with InfinitePay.
// IMPORTANT: This function does NOT change pricing or payment logic.
// It only checks if InfinitePay already considers a pending order as PAID
// (via the public payment_check endpoint or a returning paid_amount on
// the checkout page) and, when so, runs the SAME approval flow used by
// the webhook: marks order as approved, generates qr_token, and confirms
// every registration in that order. If the order is not paid, nothing
// changes.

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

interface PaymentCheckResult {
  paid: boolean;
  paid_amount?: number;
  raw?: unknown;
}

/**
 * Try to check the payment status on InfinitePay for a given order.
 * Tries the documented `payment_check` endpoint first (handle + order_nsu
 * + optional slug). Falls back to a GET on the invoice page (using slug)
 * which also returns paid status when available.
 */
async function checkInfinitePayStatus(
  handle: string,
  order: { order_nsu: string | null; invoice_slug: string | null; payment_provider_reference: string | null }
): Promise<PaymentCheckResult> {
  try {
    // Primary path: payment_check endpoint
    const checkBody: Record<string, unknown> = { handle };
    if (order.order_nsu) checkBody.order_nsu = order.order_nsu;
    if (order.invoice_slug) checkBody.slug = order.invoice_slug;
    if (order.payment_provider_reference)
      checkBody.transaction_nsu = order.payment_provider_reference;

    const res = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/payment_check",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkBody),
      }
    );
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    console.log("[reconcile] payment_check response:", res.status, JSON.stringify(data));

    const paid =
      (data && (data as any).paid === true) ||
      (typeof (data as any).paid_amount === "number" && (data as any).paid_amount > 0);

    if (paid) {
      return {
        paid: true,
        paid_amount: typeof (data as any).paid_amount === "number" ? (data as any).paid_amount : undefined,
        raw: data,
      };
    }

    return { paid: false, raw: data };
  } catch (err) {
    console.error("[reconcile] payment_check failed:", err);
    return { paid: false };
  }
}

/**
 * Apply the SAME approval flow used by payment-webhook.
 * Marks order as approved, sets paid_at, generates qr_token for every
 * registration in the order and updates registration_status to confirmed.
 */
async function applyApproval(
  supabase: any,
  order: any,
  payload: { paid_amount?: number; raw?: unknown; source: string }
) {
  const orderUpdate: Record<string, unknown> = {
    payment_status: "approved",
    paid_at: new Date().toISOString(),
    webhook_status_last_seen: order.webhook_status_last_seen ?? "approved",
  };
  await supabase.from("orders").update(orderUpdate).eq("id", order.id);

  const { data: regs } = await supabase
    .from("registrations")
    .select("id, qr_token")
    .eq("order_id", order.id);

  let confirmedCount = 0;
  if (regs && regs.length > 0) {
    for (const reg of regs) {
      const update: Record<string, unknown> = {
        payment_status: "approved",
        registration_status: "confirmed",
      };
      if (!reg.qr_token) {
        update.qr_token = crypto.randomUUID();
        update.qr_generated_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("registrations")
        .update(update)
        .eq("id", reg.id);
      if (!error) confirmedCount += 1;
    }
  }

  // Log for audit
  await supabase.from("payment_events").insert({
    order_id: order.id,
    provider: "infinitepay",
    event_type: `reconciliation:${payload.source}`,
    external_event_id: null,
    raw_payload_json: { paid_amount: payload.paid_amount, raw: payload.raw },
    processed: true,
    processed_at: new Date().toISOString(),
  });

  await supabase.from("audit_logs").insert({
    action: "payment_reconciled_to_approved",
    entity_type: "order",
    entity_id: order.id,
    details: {
      source: payload.source,
      order_code: order.order_code,
      paid_amount_cents: payload.paid_amount ?? null,
      expected_total_cents: order.total_price_cents,
      confirmed_registrations: confirmedCount,
    },
  });

  return confirmedCount;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const handle = Deno.env.get("INFINITEPAY_HANDLE");
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!handle) {
      return respond({ error: "INFINITEPAY_HANDLE não configurado" }, 500);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const orderCode = typeof body.order_code === "string" ? body.order_code : null;
    const orderId = typeof body.order_id === "string" ? body.order_id : null;
    const cpf = typeof body.cpf === "string" ? body.cpf.replace(/\D/g, "") : null;
    const scanAll = body.scan_all === true;

    // Resolve which orders to check
    let orders: any[] = [];

    if (orderCode || orderId) {
      const q = supabase.from("orders").select("*").limit(1);
      const { data } = orderCode
        ? await q.eq("order_code", orderCode).maybeSingle()
        : await q.eq("id", orderId!).maybeSingle();
      if (data) orders = [data];
    } else if (cpf) {
      const { data: regs } = await supabase
        .from("registrations")
        .select("order_id")
        .eq("cpf", cpf)
        .eq("registration_status", "pending_payment");
      const ids = Array.from(new Set((regs || []).map((r: any) => r.order_id)));
      if (ids.length > 0) {
        const { data } = await supabase
          .from("orders")
          .select("*")
          .in("id", ids)
          .eq("payment_status", "pending");
        orders = data || [];
      }
    } else if (scanAll) {
      // Backfill mode: check up to 100 oldest pending orders
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("payment_status", "pending")
        .order("created_at", { ascending: true })
        .limit(100);
      orders = data || [];
    } else {
      return respond({ error: "Informe order_code, order_id, cpf ou scan_all" }, 400);
    }

    const results: Array<Record<string, unknown>> = [];

    for (const order of orders) {
      // Skip non-pending orders — don't downgrade or rewrite anything
      if (order.payment_status !== "pending") {
        results.push({
          order_code: order.order_code,
          status: order.payment_status,
          changed: false,
          reason: "not_pending",
        });
        continue;
      }

      const check = await checkInfinitePayStatus(handle, {
        order_nsu: order.order_nsu,
        invoice_slug: order.invoice_slug ?? null,
        payment_provider_reference: order.payment_provider_reference ?? null,
      });

      if (check.paid) {
        const confirmed = await applyApproval(supabase, order, {
          paid_amount: check.paid_amount,
          raw: check.raw,
          source: "manual_reconcile",
        });
        results.push({
          order_code: order.order_code,
          status: "approved",
          changed: true,
          confirmed_registrations: confirmed,
        });
      } else {
        results.push({
          order_code: order.order_code,
          status: "pending",
          changed: false,
        });
      }
    }

    const approvedCount = results.filter((r) => r.changed).length;

    return respond({
      checked: results.length,
      approved: approvedCount,
      results,
    });
  } catch (err) {
    console.error("[reconcile] Unexpected error:", err);
    return respond({ error: "Erro interno do servidor" }, 500);
  }
});
