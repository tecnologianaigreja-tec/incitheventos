// Reconcile pending payments with InfinitePay.
// IMPORTANT: This function does NOT change pricing or payment logic.
// It only checks if InfinitePay already considers a pending order as PAID
// (via the public payment_check endpoint or a returning paid_amount on
// the checkout page) and, when so, runs the SAME approval flow used by
// the webhook: marks order as approved, generates qr_token, and confirms
// every registration in that order. If the order is not paid, nothing
// changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";
import { approveOrder } from "../_shared/approveOrder.ts";

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
  // Try multiple identifiers because InfinitePay's payment_check accepts
  // different shapes depending on the link version. The `lenc` value
  // (stored as invoice_slug) is the one that works for recent links.
  const attempts: Array<{ name: string; body: Record<string, unknown> }> = [];
  if (order.invoice_slug) {
    attempts.push({ name: "slug", body: { handle, slug: order.invoice_slug } });
    attempts.push({ name: "lenc", body: { handle, lenc: order.invoice_slug } });
  }
  if (order.order_nsu) {
    attempts.push({ name: "order_nsu", body: { handle, order_nsu: order.order_nsu } });
  }
  if (order.payment_provider_reference) {
    attempts.push({
      name: "transaction_nsu",
      body: { handle, transaction_nsu: order.payment_provider_reference },
    });
  }

  for (const attempt of attempts) {
    try {
      const res = await fetch(
        "https://api.infinitepay.io/invoices/public/checkout/payment_check",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt.body),
        }
      );
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      console.log(`[reconcile] payment_check[${attempt.name}] ${res.status}:`, JSON.stringify(data));

      const paid =
        (data && (data as any).paid === true) ||
        (typeof (data as any).paid_amount === "number" && (data as any).paid_amount > 0) ||
        (typeof (data as any).receipt_url === "string" && (data as any).receipt_url.length > 0);

      if (paid) {
        return {
          paid: true,
          paid_amount:
            typeof (data as any).paid_amount === "number" ? (data as any).paid_amount : undefined,
          raw: data,
        };
      }
    } catch (err) {
      console.error(`[reconcile] payment_check[${attempt.name}] failed:`, err);
    }
  }

  return { paid: false };
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
      // scan_all requires admin auth — it triggers up to 100 InfinitePay API calls.
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return respond({ error: "scan_all requer autenticação de admin" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return respond({ error: "Token inválido" }, 401);
      const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
      if (!isAdmin) return respond({ error: "Acesso negado. scan_all requer permissão de admin" }, 403);

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
        const { confirmedCount: confirmed } = await approveOrder({
          supabase,
          order,
          source: "reconciliation:manual_reconcile",
          rawPayload: { paid_amount: check.paid_amount, raw: check.raw },
          eventType: "reconciliation:manual_reconcile",
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
