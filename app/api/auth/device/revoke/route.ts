import { NextResponse } from "next/server";
import { getOsAuthContext, hashOsDeviceToken } from "@/lib/server-os-auth";
import { clearDeviceCookies } from "@/lib/server-os-device";

export const runtime = "nodejs";

export async function POST() {
  const context = await getOsAuthContext();
  const response = NextResponse.json({ revoked: true });
  clearDeviceCookies(response);
  if (context.kind !== "authenticated") return response;

  const deviceToken = context.cookieStore.get("os_device_token")?.value;
  if (deviceToken) {
    await context.serviceClient
      .from("os_device_sessions")
      .update({ revoked_at: new Date().toISOString(), unlocked_token_hash: null, unlocked_until: null })
      .eq("user_id", context.user.id)
      .eq("device_token_hash", hashOsDeviceToken(deviceToken))
      .is("revoked_at", null);
  }
  return response;
}
