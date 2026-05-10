// Idempotent seed of the check-in operator user.
// Creates auth user "conferencia@gmail.com" and grants role "checkin_operator".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL = Deno.env.get("CHECKIN_OPERATOR_EMAIL") || "conferencia@gmail.com";
const PASSWORD = Deno.env.get("CHECKIN_OPERATOR_PASSWORD") || "conferencia33";
const NAME = Deno.env.get("CHECKIN_OPERATOR_NAME") || "Equipe Check-in";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find existing user by email
    let userId: string | null = null;
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;
    const existing = list.users.find(u => (u.email || "").toLowerCase() === EMAIL);

    if (existing) {
      userId = existing.id;
      // Ensure password matches and email confirmed (idempotent)
      await supabase.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
        email_confirm: true,
      });
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      userId = created.user!.id;
    }

    // Upsert admin_users record with checkin_operator role
    const { data: existingAdmin } = await supabase
      .from("admin_users")
      .select("id, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingAdmin) {
      await supabase
        .from("admin_users")
        .update({ role: "checkin_operator", name: NAME, email: EMAIL })
        .eq("id", existingAdmin.id);
    } else {
      await supabase.from("admin_users").insert({
        user_id: userId,
        email: EMAIL,
        name: NAME,
        role: "checkin_operator",
      });
    }

    return new Response(JSON.stringify({ ok: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("seed-checkin-operator error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
