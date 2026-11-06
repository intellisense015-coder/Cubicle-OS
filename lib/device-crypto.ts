"use client";

const DATABASE_NAME = "cubicle-os-secure";
const STORE_NAME = "device";
const RECORD_KEY = "trusted-device";
const KEY_VERSION = 1;
const PBKDF2_ITERATIONS = 150_000;

type DeviceKeyRecord = {
  version: number;
  deviceSessionId: string;
  publicKeyJwk: JsonWebKey;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

export class DeviceCryptoError extends Error {
  constructor(public readonly code: "missing" | "invalid_pin" | "unavailable", message: string) {
    super(message);
    this.name = "DeviceCryptoError";
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Secure device storage is unavailable."));
  });
}

async function readRecord() {
  const database = await getDatabase();
  return new Promise<DeviceKeyRecord | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
    request.onsuccess = () => resolve((request.result || null) as DeviceKeyRecord | null);
    request.onerror = () => reject(request.error || new Error("Secure device storage could not be read."));
  });
}

async function writeRecord(record: DeviceKeyRecord) {
  const database = await getDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record, RECORD_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Secure device storage could not be updated."));
  });
}

export async function clearDeviceMaterial() {
  if (typeof indexedDB === "undefined") return;
  const database = await getDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Secure device storage could not be cleared."));
  });
}

async function deriveWrappingKey(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createDeviceKeyPair(pin: string) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(pin, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    new TextEncoder().encode(JSON.stringify(privateKeyJwk)),
  );

  return {
    publicKeyJwk,
    privateKeyJwk,
    encryptedPrivateKey: {
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    },
  };
}

export async function saveDeviceMaterial(input: {
  deviceSessionId: string;
  publicKeyJwk: JsonWebKey;
  encryptedPrivateKey: { salt: string; iv: string; ciphertext: string };
}) {
  await writeRecord({
    version: KEY_VERSION,
    deviceSessionId: input.deviceSessionId,
    publicKeyJwk: input.publicKeyJwk,
    salt: input.encryptedPrivateKey.salt,
    iv: input.encryptedPrivateKey.iv,
    ciphertext: input.encryptedPrivateKey.ciphertext,
    createdAt: new Date().toISOString(),
  });
}

export async function unlockDeviceMaterial(pin: string) {
  const record = await readRecord();
  if (!record || record.version !== KEY_VERSION) throw new DeviceCryptoError("missing", "Trusted-device setup is incomplete.");

  try {
    const wrappingKey = await deriveWrappingKey(pin, base64UrlToBytes(record.salt));
    const privateKeyBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(record.iv) },
      wrappingKey,
      base64UrlToBytes(record.ciphertext),
    );
    const privateKeyJwk = JSON.parse(new TextDecoder().decode(privateKeyBytes)) as JsonWebKey;
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    return { deviceSessionId: record.deviceSessionId, publicKeyJwk: record.publicKeyJwk, privateKey };
  } catch {
    throw new DeviceCryptoError("invalid_pin", "The PIN could not unlock the stored browser key.");
  }
}

export async function signDeviceChallenge(privateKey: CryptoKey, challenge: string) {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(challenge),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}
