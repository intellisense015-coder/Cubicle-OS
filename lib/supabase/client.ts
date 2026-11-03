import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

// Short-lived same-tab fallback used while handing a fresh login to MFA.
// It is never placed in the URL and is cleared once the protected shell
// confirms the AAL2 session.
export const BROWSER_SESSION_HANDOFF_KEY = "cubicle-os-session-handoff";

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

/** Supabase remains opt-in until the full backend is ready. */
export function isSupabaseLeadsEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_SUPABASE_LEADS === "true" && hasSupabaseConfig();
}

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, key);
  }

  return browserClient;
}
