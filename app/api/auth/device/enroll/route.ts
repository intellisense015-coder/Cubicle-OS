import { createPublicKey, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureOsAuthState, getOsAuthContext, hashOsDeviceToken, verifyOrInitializeOsPin } from "@/lib/server-os-auth";
import { deviceExpiry, setDeviceCookies } from "@/lib/server-os-device";

export const runtime = "nodejs";

const enrollSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "A four-digit PIN is required."),
  publicKeyJwk: z.record(z.string(), z.unknown()),
  deviceLabel: z.string().trim().max(80).optional().default("Trusted browser"),
}).strict();

export async function POST(request: Request) {
  const context = await getOsAuthContext();
  if (context.kind !== "authenticated") return NextResponse.json({ error: "MFA verification is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A valid device key is required." }, { status: 400 });

  await ensureOsAuthState(context);
  const pinAccepted = await verifyOrInitializeOsPin(context, parsed.data.pin);
  if (!pinAccepted) return NextResponse.json({ error: "This PIN does not match the PIN already set for this account." }, { status: 409 });

  let publicKeyJwk: JsonWebKey;
  try {
    publicKeyJwk = createPublicKey({ key: parsed.data.publicKeyJwk, format: "jwk" }).export({ format: "jwk" }) as JsonWebKey;
  } catch {
    return NextResponse.json({ error: "The trusted-device key is invalid." }, { status: 400 });
  }
  if (publicKeyJwk.kty !== "EC" || publicKeyJwk.crv !== "P-256") {
    return NextResponse.json({ error: "The trusted-device key must use P-256." }, { status: 400 });
  }

  const deviceToken = randomBytes(32).toString("base64url");
  const expiresAt = deviceExpiry();
  const { data: device, error } = await context.serviceClient
    .from("os_device_sessions")
    .insert({
      user_id: context.user.id,
      device_token_hash: hashOsDeviceToken(deviceToken),
      public_key_jwk: publicKeyJwk,
      device_label: parsed.data.deviceLabel || "Trusted browser",
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (error || !device) return NextResponse.json({ error: "Trusted-device setup could not be completed." }, { status: 500 });

  const response = NextResponse.json({ deviceSessionId: device.id, expiresAt: device.expires_at });
  setDeviceCookies(response, deviceToken);
  return response;
}
