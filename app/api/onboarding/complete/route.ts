import { NextResponse } from "next/server";
import { getOsAuthContext } from "@/lib/server-os-auth";

export const runtime = "nodejs";

export async function POST() {
  const context = await getOsAuthContext();
  if (context.kind !== "authenticated") return NextResponse.json({ error: "MFA verification is required." }, { status: 403 });
  if (context.role.trim().toLowerCase() !== "owner") return NextResponse.json({ error: "Only the workspace owner can complete onboarding." }, { status: 403 });

  const { data: profile, error: profileError } = await context.serviceClient
    .from("os_user_profiles")
    .select("user_id")
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (profileError || !profile) return NextResponse.json({ error: "Complete the owner profile before launching the workspace." }, { status: 400 });

  const { data: companyProfile, error: companyProfileError } = await context.serviceClient
    .from("os_company_profile")
    .select("id")
    .eq("id", 1)
    .maybeSingle();
  if (companyProfileError || !companyProfile) return NextResponse.json({ error: "Complete the company profile before launching the workspace." }, { status: 400 });

  const { error } = await context.serviceClient
    .from("os_auth_state")
    .update({ is_onboarded: true, updated_at: new Date().toISOString() })
    .eq("user_id", context.user.id);
  if (error) return NextResponse.json({ error: "Onboarding could not be completed." }, { status: 500 });

  return NextResponse.json({ completed: true });
}
