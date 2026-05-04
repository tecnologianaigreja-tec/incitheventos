import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genCode() {
  const s = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  return "CERT-" + s.slice(0, 8);
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

    // Validate user via anon client
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Confirm admin role
    const { data: adminRow } = await admin.from("admin_users").select("role").eq("user_id", userData.user.id).maybeSingle();
    if (!adminRow || !["superadmin", "admin"].includes((adminRow as any).role)) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const eventId = body?.event_id as string | undefined;
    if (!eventId) {
      return new Response(JSON.stringify({ error: "event_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate event status
    const { data: event } = await admin.from("events").select("id, status").eq("id", eventId).maybeSingle();
    if (!event || !["closed", "concluded"].includes((event as any).status)) {
      return new Response(JSON.stringify({ error: "event must be closed or concluded" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate template
    const { data: tpl } = await admin.from("certificate_templates").select("background_url").eq("event_id", eventId).maybeSingle();
    if (!tpl || !(tpl as any).background_url) {
      return new Response(JSON.stringify({ error: "template not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch all eligible registrations (paged to overcome 1000 row default)
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

    // Fetch existing certificates for these IDs
    const existing = new Set<string>();
    for (let i = 0; i < eligibleIds.length; i += 500) {
      const chunk = eligibleIds.slice(i, i + 500);
      const { data } = await admin.from("certificates").select("registration_id").in("registration_id", chunk);
      (data || []).forEach((c: any) => existing.add(c.registration_id));
    }

    let toCreate = eligibleIds.filter((id) => !existing.has(id));
    let created = 0;

    // Bulk insert with retry on unique-code collision
    for (let attempt = 0; attempt < 3 && toCreate.length > 0; attempt++) {
      const rows = toCreate.map((registration_id) => ({
        registration_id,
        certificate_code: genCode(),
        validation_hash: crypto.randomUUID(),
      }));
      // Insert in chunks of 500
      const failed: string[] = [];
      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { data, error } = await admin.from("certificates").insert(slice).select("registration_id");
        if (error) {
          // On any error in this chunk, re-fetch existing for the slice and mark missing as failed for retry
          const sliceIds = slice.map((s) => s.registration_id);
          const { data: existRows } = await admin.from("certificates").select("registration_id").in("registration_id", sliceIds);
          const nowExist = new Set((existRows || []).map((c: any) => c.registration_id));
          sliceIds.forEach((id) => { if (nowExist.has(id)) created++; else failed.push(id); });
        } else {
          created += (data || []).length;
        }
      }
      toCreate = failed;
    }

    // Bulk update registrations that now have a certificate
    if (created > 0) {
      // Re-resolve the IDs that have a cert but registration not yet marked
      const allCerted: string[] = [];
      for (let i = 0; i < eligibleIds.length; i += 500) {
        const chunk = eligibleIds.slice(i, i + 500);
        const { data } = await admin.from("certificates").select("registration_id").in("registration_id", chunk);
        (data || []).forEach((c: any) => allCerted.push(c.registration_id));
      }
      for (let i = 0; i < allCerted.length; i += 500) {
        const chunk = allCerted.slice(i, i + 500);
        await admin
          .from("registrations")
          .update({ certificate_status: "issued", certificate_issued_at: new Date().toISOString() })
          .in("id", chunk)
          .neq("certificate_status", "issued");
      }
    }

    return new Response(
      JSON.stringify({
        total_eligible: eligibleIds.length,
        already_existed: existing.size,
        created,
        failed: toCreate.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[issue-all-certificates]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
