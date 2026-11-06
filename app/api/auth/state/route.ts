import { NextResponse } from "next/server";
import { ensureOsAuthState, getOsAuthContext, getOsDeviceState } from "@/lib/server-os-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await getOsAuthContext();
    if (context.kind === "configuration_error") {
      return NextResponse.json({ error: "OS authentication is not configured." }, { status: 503 });
    }
    if (context.kind === "unauthenticated") {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    if (context.kind === "mfa_required") {
      return NextResponse.json({ authenticated: true, mfaRequired: true, currentLevel: context.currentLevel }, { status: 403 });
    }
    if (context.kind === "unauthorized") {
      return NextResponse.json({ error: "This account does not have OS access." }, { status: 403 });
    }

    const [authState, device] = await Promise.all([
      ensureOsAuthState(context),
      getOsDeviceState(context),
    ]);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: context.user.id,
        email: context.user.email || "",
        name: context.user.user_metadata?.full_name || context.user.user_metadata?.name || "",
      },
      role: context.role,
      isOwner: context.role.trim().toLowerCase() === "owner",
      isOnboarded: authState.is_onboarded === true,
      invitationStatus: authState.invitation_status,
      device,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to read the OS authentication state." }, { status: 500 });
  }
}
