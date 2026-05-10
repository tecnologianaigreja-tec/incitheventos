import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genCode() {
  const s = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  return "CERT-" + s.slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: adminRow } = await admin.from("admin_users").select("role").eq("user_id", userData.user.id).maybeSingle();
    if (!adminRow || !["superadmin", "admin"].includes((adminRow as any).role)) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const eventId = body?.event_id as string | undefined;
    if (!eventId) {
      return new Response(JSON.stringify({ error: "event_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: event } = await admin.from("events").select("id, status").eq("id", eventId).maybeSingle();
    if (!event || !["closed", "concluded"].includes((event as any).status)) {
      return new Response(JSON.stringify({ error: "event must be closed or concluded" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tpl } = await admin.from("certificate_templates").select("background_url").eq("event_id", eventId).maybeSingle();
    if (!tpl || !(tpl as any).background_url) {
      return new Response(JSON.stringify({ error: "template not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch all eligible registration ids (paged to overcome 1000-row default)
    const eligibleIds: string[] = [];
    {
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await admin
          .from("registrations")
          .select("id")
          .eq("event_id", eventId)
          .eq("payment_status", "approved")
          .eq("checkin_status", "checked_in")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (data || []) as Array<{ id: string }>;
        eligibleIds.push(...rows.map((r) => r.id));
        if (rows.length < pageSize) break;
        from += pageSize;
      }
    }

    // Bulk upsert with ON CONFLICT DO NOTHING — DB dedupes via UNIQUE(registration_id).
    let created = 0;
    const CHUNK = 200;
    for (let i = 0; i < eligibleIds.length; i += CHUNK) {
      const chunk = eligibleIds.slice(i, i + CHUNK).map((registration_id) => ({
        registration_id,
        certificate_code: genCode(),
        validation_hash: crypto.randomUUID(),
      }));
      const { data, error } = await admin
        .from("certificates")
        .upsert(chunk, { onConflict: "registration_id", ignoreDuplicates: true })
        .select("registration_id");
      if (error) {
        console.error("[issue-all-certificates] upsert error", error.message);
        // Fallback: row-by-row insert for this chunk
        for (const row of chunk) {
          const { error: e2 } = await admin.from("certificates").insert(row);
          if (!e2) created++;
        }
      } else {
        created += (data || []).length;
      }
    }

    // Mark all eligible regs as issued (idempotent)
    for (let i = 0; i < eligibleIds.length; i += 500) {
      const chunk = eligibleIds.slice(i, i + 500);
      await admin
        .from("registrations")
        .update({ certificate_status: "issued", certificate_issued_at: new Date().toISOString() })
        .in("id", chunk)
        .neq("certificate_status", "issued");
    }

    // Final accurate count
    let totalIssued = 0;
    for (let i = 0; i < eligibleIds.length; i += 200) {
      const chunk = eligibleIds.slice(i, i + 200);
      const { count } = await admin
        .from("certificates")
        .select("registration_id", { count: "exact", head: true })
        .in("registration_id", chunk);
      totalIssued += count || 0;
    }

    console.log(`[issue-all-certificates] event=${eventId} eligible=${eligibleIds.length} created=${created} totalIssued=${totalIssued}`);

    return new Response(
      JSON.stringify({
        total_eligible: eligibleIds.length,
        created,
        total_issued: totalIssued,
        already_existed: Math.max(totalIssued - created, 0),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[issue-all-certificates]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
