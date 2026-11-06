import { webcrypto } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOsAuthContext, hashOsDeviceToken, verifyOrInitializeOsPin } from "@/lib/server-os-auth";
import { clearDeviceCookies, createDeviceToken, getActiveDevice, setDeviceCookies, unlockedExpiry } from "@/lib/server-os-device";

export const runtime = "nodejs";

const unlockSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "A four-digit PIN is required."),
  challengeId: z.string().uuid(),
  challenge: z.string().min(20).max(200),
  signature: z.string().min(20).max(500),
}).strict();

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export async function POST(request: Request) {
  const context = await getOsAuthContext();
  if (context.kind !== "authenticated") return NextResponse.json({ error: "MFA verification is required." }, { status: 403 });

  const parsed = unlockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The unlock attempt is invalid." }, { status: 400 });

  const { device } = await getActiveDevice(context);
  if (!device) return NextResponse.json({ error: "Trusted-device setup is required." }, { status: 409 });

  const { data: challengeRow, error: challengeError } = await context.serviceClient
    .from("os_device_challenges")
    .select("id, challenge_hash, consumed_at, expires_at")
    .eq("id", parsed.data.challengeId)
    .eq("device_session_id", device.id)
    .maybeSingle();
  if (challengeError || !challengeRow || challengeRow.consumed_at || new Date(challengeRow.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The unlock challenge has expired." }, { status: 400 });
  }

  if (hashOsDeviceToken(parsed.data.challenge) !== challengeRow.challenge_hash) {
    return NextResponse.json({ error: "The unlock attempt is invalid." }, { status: 400 });
  }

  let validSignature = false;
  try {
    const publicKey = await webcrypto.subtle.importKey(
      "jwk",
      device.public_key_jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    validSignature = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      decodeBase64Url(parsed.data.signature),
      new TextEncoder().encode(parsed.data.challenge),
    );
  } catch {
    validSignature = false;
  }

  await context.serviceClient
    .from("os_device_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challengeRow.id)
    .is("consumed_at", null);

  if (!validSignature) {
    const { data: failure } = await context.serviceClient.rpc("record_os_device_unlock_failure", {
      p_device_session_id: device.id,
    });
    const result = Array.isArray(failure) ? failure[0] : failure;
    const response = NextResponse.json({ error: "The PIN could not unlock this browser.", locked: result?.locked === true }, { status: 401 });
    if (result?.locked === true) clearDeviceCookies(response);
    return response;
  }

  const pinAccepted = await verifyOrInitializeOsPin(context, parsed.data.pin);
  if (!pinAccepted) {
    const { data: failure } = await context.serviceClient.rpc("record_os_device_unlock_failure", {
      p_device_session_id: device.id,
    });
    const result = Array.isArray(failure) ? failure[0] : failure;
    const response = NextResponse.json({ error: "Incorrect PIN.", locked: result?.locked === true }, { status: 401 });
    if (result?.locked === true) clearDeviceCookies(response);
    return response;
  }

  const unlockedToken = createDeviceToken();
  const unlockedUntil = unlockedExpiry();
  const { error: updateError } = await context.serviceClient
    .from("os_device_sessions")
    .update({
      unlocked_token_hash: hashOsDeviceToken(unlockedToken),
      unlocked_until: unlockedUntil,
      last_used_at: new Date().toISOString(),
      failed_unlock_attempts: 0,
    })
    .eq("id", device.id)
    .is("revoked_at", null)
    .is("locked_at", null);
  if (updateError) return NextResponse.json({ error: "The browser could not be unlocked." }, { status: 500 });

  const response = NextResponse.json({ unlockedUntil });
  setDeviceCookies(response, context.cookieStore.get("os_device_token")?.value || "", unlockedToken);
  return response;
}
