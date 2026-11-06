import { NextResponse } from "next/server";
import { z } from "zod";
import { getOsAuthContext } from "@/lib/server-os-auth";
import { clearDeviceCookies, getActiveDevice } from "@/lib/server-os-device";

export const runtime = "nodejs";

const failureSchema = z.object({ challengeId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  const context = await getOsAuthContext();
  if (context.kind !== "authenticated") return NextResponse.json({ error: "MFA verification is required." }, { status: 403 });

  const parsed = failureSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The unlock attempt is invalid." }, { status: 400 });

  const { device } = await getActiveDevice(context);
  if (!device) return NextResponse.json({ error: "Trusted-device setup is required." }, { status: 409 });

  const { data: challenge, error: challengeError } = await context.serviceClient
    .from("os_device_challenges")
    .select("id, device_session_id, consumed_at, expires_at")
    .eq("id", parsed.data.challengeId)
    .eq("device_session_id", device.id)
    .maybeSingle();
  if (challengeError || !challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The unlock attempt has expired." }, { status: 400 });
  }

  await context.serviceClient
    .from("os_device_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id)
    .is("consumed_at", null);

  const { data: failure, error: failureError } = await context.serviceClient.rpc("record_os_device_unlock_failure", {
    p_device_session_id: device.id,
  });
  if (failureError) return NextResponse.json({ error: "The unlock attempt could not be recorded." }, { status: 500 });

  const result = Array.isArray(failure) ? failure[0] : failure;
  const locked = result?.locked === true;
  const response = NextResponse.json({ locked, failedAttempts: result?.failed_attempts || 0 });
  if (locked) clearDeviceCookies(response);
  return response;
}
