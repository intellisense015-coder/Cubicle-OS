export const DEFAULT_LOST_REASONS = ["Location", "Budget"] as const;

/**
 * Lost reasons are kept in one place so additional categories can be added
 * later without changing the lead form contract.
 */
export function getLeadLostReasons() {
  return [...DEFAULT_LOST_REASONS];
}

export function addLeadLostReason(value: unknown) {
  const reason = String(value || "").trim();
  if (!reason) return getLeadLostReasons();
  return [...new Set([...getLeadLostReasons(), reason])];
}
