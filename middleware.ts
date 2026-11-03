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
