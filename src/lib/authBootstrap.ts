import { supabase } from "@/integrations/supabase/client";

/**
 * Silently clears stale Supabase sessions from localStorage when the stored
 * refresh token is invalid (e.g. revoked, expired, or from a previous project).
 *
 * Without this, every page load logs a noisy `400 Invalid Refresh Token`
 * error in the console and leaves a "ghost" session in storage that keeps
 * trying (and failing) to refresh.
 *
 * Protected pages (Admin, Checkin Operator) already redirect to /login when
 * `getUser()` returns null, so this does NOT log out valid users — it only
 * cleans up corrupted local state.
 */
supabase.auth.onAuthStateChange((event, session) => {
  // When the auto-refresh fails, the SDK emits TOKEN_REFRESHED with a null session.
  if (event === "TOKEN_REFRESHED" && !session) {
    supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
});

// Also: on boot, if getSession() throws or returns no valid session while
// localStorage still holds keys, force a local sign-out to flush them.
(async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || (!data?.session && hasStaleAuthKeys())) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }
  } catch {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
})();

function hasStaleAuthKeys(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch {}
  return false;
}
