import { supabase } from "@/integrations/supabase/client";

/**
 * Auth bootstrap.
 *
 * We intentionally do NOT proactively call signOut() on transient errors —
 * doing so was killing valid sessions on slow networks (TOKEN_REFRESHED with
 * a null session can occur during temporary network failures).
 *
 * The Supabase SDK already handles invalid refresh tokens by emitting
 * SIGNED_OUT, which clears local state. We just listen and log.
 */
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    // SDK already cleaned local storage; nothing to do.
    return;
  }
});
