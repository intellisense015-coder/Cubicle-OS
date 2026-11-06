import { NextResponse } from "next/server";
import { getOsSessionContext } from "@/lib/server-os-auth";

export const runtime = "nodejs";

export async function POST() {
  const context = await getOsSessionContext();
  if (context.kind !== "authenticated") return NextResponse.json({ error: "Invitation session is invalid or expired." }, { status: 401 });

  const { data: adminUser, error: adminUserError } = await context.serviceClient
    .from("admin_users")
    .select("role, active")
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (adminUserError || !adminUser?.active) return NextResponse.json({ error: "This invitation is not active." }, { status: 403 });

  const { error } = await context.serviceClient
    .from("os_auth_state")
    .upsert({
      user_id: context.user.id,
      role: adminUser.role,
      is_onboarded: true,
      invitation_status: "accepted",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "The invitation state could not be updated." }, { status: 500 });
  return NextResponse.json({ accepted: true });
}
