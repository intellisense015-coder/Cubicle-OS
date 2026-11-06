import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_OPTIONS = {
  N: 32_768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

export function isValidOsPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

function deriveScryptKey(pin: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(pin, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

export async function hashOsPin(pin: string) {
  const salt = randomBytes(16);
  const derivedKey = await deriveScryptKey(pin, salt);
  return `scrypt-v1$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyOsPin(pin: string, verifier: string) {
  const [version, saltValue, expectedValue] = verifier.split("$");
  if (version !== "scrypt-v1" || !saltValue || !expectedValue) return false;

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expectedKey = Buffer.from(expectedValue, "base64url");
    const derivedKey = await deriveScryptKey(pin, salt);
    return expectedKey.length === derivedKey.length && timingSafeEqual(expectedKey, derivedKey);
  } catch {
    return false;
  }
}
