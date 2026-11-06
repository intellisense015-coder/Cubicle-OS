import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

function redirectToMfa(request: NextRequest) {
  const mfaUrl = new URL("/mfa", request.url);
  mfaUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(mfaUrl);
}

function redirectToPostAuth(request: NextRequest) {
  const postAuthUrl = new URL("/post-auth", request.url);
  postAuthUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(postAuthUrl);
}

function redirectToPinLock(request: NextRequest) {
  const pinUrl = new URL("/pin-lock", request.url);
  pinUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(pinUrl);
}

async function hashDeviceToken(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  new Uint8Array(digest).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return redirectToLogin(request);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return redirectToLogin(request);

  const { data: assuranceData, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assuranceData?.currentLevel !== "aal2") return redirectToMfa(request);

  const { data: roleData, error: roleError } = await supabase.rpc("get_my_admin_role");
  if (roleError || !roleData) return redirectToLogin(request);

  const deviceToken = request.cookies.get("os_device_token")?.value || "";
  const unlockedToken = request.cookies.get("os_device_unlocked")?.value || "";
  if (!deviceToken) return redirectToPostAuth(request);
  if (!unlockedToken) return redirectToPinLock(request);

  const { data: deviceAccess, error: deviceAccessError } = await supabase.rpc("verify_os_device_access", {
    p_device_token_hash: await hashDeviceToken(deviceToken),
    p_unlocked_token_hash: await hashDeviceToken(unlockedToken),
  });
  if (deviceAccessError || !Array.isArray(deviceAccess) || !deviceAccess.length) return redirectToPinLock(request);

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/leads/:path*",
    "/members/:path*",
    "/companies/:path*",
    "/visits/:path*",
    "/invoices/:path*",
    "/quotations/:path*",
    "/proposals/:path*",
    "/employees/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/approvals/:path*",
    "/floor-plan/:path*",
    "/workspaces/:path*",
    "/email-templates/:path*",
    "/demo-controls/:path*",
    "/setup/:path*",
    "/api/communications/send",
  ],
};
