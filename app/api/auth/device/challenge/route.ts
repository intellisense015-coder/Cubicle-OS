import { NextResponse } from "next/server";
import { getOsAuthContext, hashOsDeviceToken } from "@/lib/server-os-auth";
import { challengeExpiry, createChallenge, getActiveDevice } from "@/lib/server-os-device";

export const runtime = "nodejs";

export async function POST() {
  const context = await getOsAuthContext();
  if (context.kind !== "authenticated") return NextResponse.json({ error: "MFA verification is required." }, { status: 403 });

  const { deviceToken, device } = await getActiveDevice(context);
  if (!deviceToken || !device) return NextResponse.json({ error: "Trusted-device setup is required." }, { status: 409 });

  const challenge = createChallenge();
  const expiresAt = challengeExpiry();
  const { data: challengeRow, error } = await context.serviceClient
    .from("os_device_challenges")
    .insert({
      device_session_id: device.id,
      challenge_hash: hashOsDeviceToken(challenge),
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (error || !challengeRow) return NextResponse.json({ error: "The trusted-device challenge could not be created." }, { status: 500 });
  return NextResponse.json({ challengeId: challengeRow.id, challenge, expiresAt: challengeRow.expires_at, deviceSessionId: device.id });
}
