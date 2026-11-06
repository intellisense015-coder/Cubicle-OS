import { createHash } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { hashOsPin, isValidOsPin, verifyOsPin } from "@/lib/server-os-pin";

export type OsAuthContext = {
  supabase: SupabaseClient;
  serviceClient: SupabaseClient;
  cookieStore: Awaited<ReturnType<typeof cookies>>;
  user: User;
  role: string;
  currentLevel: string;
};

export type OsSessionContext = {
  supabase: SupabaseClient;
  serviceClient: SupabaseClient;
  cookieStore: Awaited<ReturnType<typeof cookies>>;
  user: User;
};

export function hashOsDeviceToken(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function getOsSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceRoleKey) return null;
  return { url, publicKey, serviceRoleKey };
}

export async function getOsSessionContext() {
  const config = getOsSupabaseConfig();
  if (!config) return { kind: "configuration_error" as const };

  const cookieStore = await cookies();
  const supabase = createServerClient(config.url, config.publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { kind: "unauthenticated" as const };

  return {
    kind: "authenticated" as const,
    supabase,
    serviceClient: createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    cookieStore,
    user: userData.user,
  } satisfies OsSessionContext & { kind: "authenticated" };
}

export async function getOsAuthContext() {
  const config = getOsSupabaseConfig();
  if (!config) return { kind: "configuration_error" as const };

  const cookieStore = await cookies();
  const supabase = createServerClient(config.url, config.publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { kind: "unauthenticated" as const };

  const { data: assuranceData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = assuranceData?.currentLevel || "aal1";
  if (currentLevel !== "aal2") {
    return { kind: "mfa_required" as const, currentLevel };
  }

  const { data: roleData, error: roleError } = await supabase.rpc("get_my_admin_role");
  if (roleError || !roleData) return { kind: "unauthorized" as const };

  return {
    kind: "authenticated" as const,
    supabase,
    serviceClient: createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    cookieStore,
    user: userData.user,
    role: String(roleData),
    currentLevel,
  } satisfies OsAuthContext & { kind: "authenticated" };
}

export async function ensureOsAuthState(context: OsAuthContext) {
  const { data: existing, error: existingError } = await context.serviceClient
    .from("os_auth_state")
    .select("user_id, role, is_onboarded, invitation_status, invited_by, invited_at, accepted_at")
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    const isOwner = context.role.trim().toLowerCase() === "owner";
    let nextOnboarded = existing.is_onboarded;
    if (isOwner) {
      const { data: companyProfile, error: companyProfileError } = await context.serviceClient
        .from("os_company_profile")
        .select("id")
        .eq("id", 1)
        .maybeSingle();
      if (companyProfileError) throw companyProfileError;
      nextOnboarded = Boolean(companyProfile);
    }

    if (existing.role !== context.role || existing.is_onboarded !== nextOnboarded) {
      const { error: updateError } = await context.serviceClient
        .from("os_auth_state")
        .update({ role: context.role, is_onboarded: nextOnboarded, updated_at: new Date().toISOString() })
        .eq("user_id", context.user.id);
      if (updateError) throw updateError;
      return { ...existing, role: context.role, is_onboarded: nextOnboarded };
    }
    return existing;
  }

  const isOwner = context.role.trim().toLowerCase() === "owner";
  let isOnboarded = !isOwner;

  if (isOwner) {
    const { data: companyProfiles, error: companyProfileError } = await context.serviceClient
      .from("os_company_profile")
      .select("id")
      .eq("id", 1)
      .limit(1);
    if (companyProfileError) throw companyProfileError;
    isOnboarded = Boolean(companyProfiles?.length);
  }

  const state = {
    user_id: context.user.id,
    role: context.role,
    is_onboarded: isOnboarded,
    invitation_status: isOwner ? "not_applicable" : "accepted",
    accepted_at: isOwner ? null : new Date().toISOString(),
  };
  const { data: created, error: createError } = await context.serviceClient
    .from("os_auth_state")
    .insert(state)
    .select("user_id, role, is_onboarded, invitation_status, invited_by, invited_at, accepted_at")
    .single();
  if (createError) throw createError;
  return created;
}

/**
 * Verify the account-level PIN, initializing it once for accounts created
 * before the shared PIN migration. The raw PIN exists only in request memory.
 */
export async function verifyOrInitializeOsPin(context: OsAuthContext, pin: string) {
  if (!isValidOsPin(pin)) return false;

  const { data: current, error: currentError } = await context.serviceClient
    .from("os_auth_state")
    .select("pin_verifier")
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (currentError) throw currentError;
  if (current?.pin_verifier) return verifyOsPin(pin, current.pin_verifier);

  const verifier = await hashOsPin(pin);
  const { data: claimed, error: claimError } = await context.serviceClient
    .from("os_auth_state")
    .update({ pin_verifier: verifier, pin_updated_at: new Date().toISOString() })
    .eq("user_id", context.user.id)
    .is("pin_verifier", null)
    .select("pin_verifier")
    .maybeSingle();
  if (claimError) throw claimError;
  if (claimed?.pin_verifier) return verifyOsPin(pin, claimed.pin_verifier);

  // Another request may have initialized the PIN at the same time. Verify
  // against whichever verifier won the race instead of overwriting it.
  const { data: raced, error: racedError } = await context.serviceClient
    .from("os_auth_state")
    .select("pin_verifier")
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (racedError) throw racedError;
  return Boolean(raced?.pin_verifier && await verifyOsPin(pin, raced.pin_verifier));
}

export async function getOsDeviceState(context: OsAuthContext) {
  const deviceToken = context.cookieStore.get("os_device_token")?.value || "";
  const unlockedToken = context.cookieStore.get("os_device_unlocked")?.value || "";
  if (!deviceToken) return { status: "not_registered" as const, expiresAt: null };

  const { data: device, error: deviceError } = await context.serviceClient
    .from("os_device_sessions")
    .select("id, expires_at, revoked_at, locked_at")
    .eq("user_id", context.user.id)
    .eq("device_token_hash", hashOsDeviceToken(deviceToken))
    .maybeSingle();

  if (deviceError) throw deviceError;
  const expired = !device || new Date(device.expires_at).getTime() <= Date.now();
  const unavailable = expired || Boolean(device.revoked_at) || Boolean(device.locked_at);
  if (unavailable) return { status: "reauth_required" as const, expiresAt: device?.expires_at || null };
  if (!unlockedToken) return { status: "pin_required" as const, expiresAt: device.expires_at };

  const { data: access, error: accessError } = await context.supabase.rpc("verify_os_device_access", {
    p_device_token_hash: hashOsDeviceToken(deviceToken),
    p_unlocked_token_hash: hashOsDeviceToken(unlockedToken),
  });
  if (accessError) throw accessError;
  return {
    status: Array.isArray(access) && access.length ? "unlocked" as const : "pin_required" as const,
    expiresAt: device.expires_at,
  };
}
