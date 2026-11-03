// TITLE: DEMO SESSION STORAGE
const SESSION_PREFIX = "cubicle-demo-";
const EMPTY_WORKSPACE_MARKER = "empty-workspace-v1";
const LEGACY_SENSITIVE_KEYS = new Set(["password", "passwordDraft", "pin", "pinChangedAt"]);

export function clearLegacySensitiveDemoValues() {
  if (typeof window === "undefined") return;
  LEGACY_SENSITIVE_KEYS.forEach((key) => window.sessionStorage.removeItem(`${SESSION_PREFIX}${key}`));
}

if (typeof window !== "undefined") clearLegacySensitiveDemoValues();

export function saveDemoValue(key, value, options: { notify?: boolean } = {}) {
  if (typeof window === "undefined") return;
  if (LEGACY_SENSITIVE_KEYS.has(key)) {
    clearLegacySensitiveDemoValues();
    return;
  }
  window.sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(value));
  if (options.notify === false) return;
  // sessionStorage does not emit a storage event in the same document. The
  // custom event keeps open modules in sync after a lead/quotation update.
  window.dispatchEvent(new CustomEvent("cubicle-demo-change", { detail: { key } }));
}

export function getDemoValue(key) {
  if (typeof window === "undefined") return null;
  if (LEGACY_SENSITIVE_KEYS.has(key)) {
    clearLegacySensitiveDemoValues();
    return null;
  }
  const raw = window.sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// TITLE: DEMO SESSION READER
export function getDemoSession() {
  return {
    email: getDemoValue("email") || "",
    mfaVerified: getDemoValue("mfaVerified") === true
  };
}

// TITLE: DEMO SESSION RESET
export function clearDemoSession() {
  if (typeof window === "undefined") return;
  clearLegacySensitiveDemoValues();
  Object.keys(window.sessionStorage).filter((key) => key.startsWith(SESSION_PREFIX)).forEach((key) => window.sessionStorage.removeItem(key));
}

// TITLE: DEMO WORKSPACE RESET
export function resetDemoWorkspace() {
  if (typeof window === "undefined") return;
  const protectedKeys = new Set(["email", "mfaVerified", "theme"]);
  Object.keys(window.sessionStorage).filter((key) => key.startsWith(SESSION_PREFIX) && !protectedKeys.has(key.replace(SESSION_PREFIX, ""))).forEach((key) => window.sessionStorage.removeItem(key));
}

// TITLE: CLEAR SEEDED BUSINESS RECORDS ONCE
export function clearSeededBusinessDataOnce() {
  if (typeof window === "undefined") return;
  if (getDemoValue("workspaceDataVersion") === EMPTY_WORKSPACE_MARKER) return;
  resetDemoWorkspace();
  saveDemoValue("workspaceDataVersion", EMPTY_WORKSPACE_MARKER);
}
