import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { hashOsDeviceToken, type OsAuthContext } from "@/lib/server-os-auth";

export const DEVICE_COOKIE = "os_device_token";
export const UNLOCKED_COOKIE = "os_device_unlocked";
export const DEVICE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const UNLOCKED_MAX_AGE_SECONDS = 2 * 60 * 60;

export function createDeviceToken() {
  return randomBytes(32).toString("base64url");
}

export function createChallenge() {
  return randomBytes(32).toString("base64url");
}

export function deviceExpiry() {
  return new Date(Date.now() + DEVICE_MAX_AGE_SECONDS * 1000).toISOString();
}

export function challengeExpiry() {
  return new Date(Date.now() + 2 * 60 * 1000).toISOString();
}

export function unlockedExpiry() {
  return new Date(Date.now() + UNLOCKED_MAX_AGE_SECONDS * 1000).toISOString();
}

export function setDeviceCookies(response: NextResponse, deviceToken: string, unlockedToken?: string) {
  response.cookies.set(DEVICE_COOKIE, deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DEVICE_MAX_AGE_SECONDS,
  });
  if (unlockedToken) {
    response.cookies.set(UNLOCKED_COOKIE, unlockedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: UNLOCKED_MAX_AGE_SECONDS,
    });
  }
}

export function clearDeviceCookies(response: NextResponse) {
  response.cookies.set(DEVICE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  response.cookies.set(UNLOCKED_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}

export async function getActiveDevice(context: OsAuthContext) {
  const deviceToken = context.cookieStore.get(DEVICE_COOKIE)?.value || "";
  if (!deviceToken) return { deviceToken: "", device: null };

  const { data: device, error } = await context.serviceClient
    .from("os_device_sessions")
    .select("id, user_id, public_key_jwk, expires_at, revoked_at, locked_at, failed_unlock_attempts")
    .eq("user_id", context.user.id)
    .eq("device_token_hash", hashOsDeviceToken(deviceToken))
    .maybeSingle();
  if (error) throw error;
  if (!device || device.revoked_at || device.locked_at || new Date(device.expires_at).getTime() <= Date.now()) {
    return { deviceToken, device: null };
  }
  return { deviceToken, device };
}
