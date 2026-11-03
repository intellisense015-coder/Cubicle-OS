import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Sends an OS mutation through the authenticated Next.js boundary.
 *
 * Reads remain direct Supabase reads and are protected by RLS. Writes use this
 * helper so the server can apply request limits, validation, audit logging and
 * the same caller identity before Supabase evaluates RLS.
 */
export async function secureOsMutation<T>(action: string, payload: unknown): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Sign in again.");

  const response = await fetch("/api/os/mutations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action, payload }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "The requested change could not be saved.");
  if (!result || result.ok !== true) throw new Error("The requested change could not be saved.");
  return result.data as T;
}
