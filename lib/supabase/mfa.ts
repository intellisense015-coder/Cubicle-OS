import type { SupabaseClient } from "@supabase/supabase-js";

export async function removeUnverifiedTotpFactors(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;

  const unverifiedFactors = (data?.all || []).filter(
    (factor) => factor.factor_type === "totp" && factor.status !== "verified",
  );
  for (const factor of unverifiedFactors) {
    const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (removeError) throw removeError;
  }
}

export async function enrollSupabaseTotp(supabase: SupabaseClient) {
  const friendlyNames = [
    "Cubicle OS Authenticator",
    `Cubicle OS Authenticator ${Date.now()}`,
  ];
  let lastError: Error | null = null;

  for (const friendlyName of friendlyNames) {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName });
    if (!error && data) return data;
    lastError = error;
    if (!error || !/already exists|friendly name|unique/i.test(error.message)) break;
  }

  throw lastError || new Error("The authenticator could not be enrolled.");
}
