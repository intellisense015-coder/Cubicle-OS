import { getDemoValue, saveDemoValue } from "@/lib/demo-session";

export const DEFAULT_LOST_REASONS = ["Location", "Budget"] as const;

/**
 * Lost reasons are kept in one place so additional categories can be added
 * later without changing the lead form contract.
 */
export function getLeadLostReasons() {
  const saved = getDemoValue("leadLostReasons");
  const customReasons = Array.isArray(saved) ? saved : [];
  return [...new Set([...DEFAULT_LOST_REASONS, ...customReasons].map((value) => String(value || "").trim()).filter(Boolean))];
}

export function addLeadLostReason(value: unknown) {
  const reason = String(value || "").trim();
  if (!reason) return getLeadLostReasons();
  const existingCustom = getDemoValue("leadLostReasons");
  const customReasons = Array.isArray(existingCustom) ? existingCustom.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const next = [...new Set([...customReasons, reason])];
  saveDemoValue("leadLostReasons", next);
  return getLeadLostReasons();
}
