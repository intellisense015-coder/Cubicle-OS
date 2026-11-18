import { floor4 } from "@/features/floor-plan/floor-4";

function findWorkspaceArea(workspaceId: unknown, rawDescription: unknown) {
  const candidates = [String(workspaceId || ""), String(rawDescription || "")]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return floor4.areas.find((area) => candidates.some((candidate) => candidate === area.id.toLowerCase() || candidate.includes(area.id.toLowerCase())));
}

export function workspaceInvoiceDescription(workspaceId: unknown, rawDescription: unknown, quantity?: unknown) {
  const area = findWorkspaceArea(workspaceId, rawDescription);
  if (area) {
    const capacity = Math.max(1, Number(area.capacity) || Number(quantity) || 1);
    if (area.kind === "office" || area.kind === "cabin") {
      const officeNumber = area.id.match(/(?:office|cabin)(\d+)$/i)?.[1] || area.name.match(/\d+/)?.[0] || area.name;
      return `${capacity} Private Desks - Office No. ${officeNumber}`;
    }
    if (area.kind === "seat") return `${capacity} Dedicated Desk`;
  }

  const fallback = String(rawDescription || "").replace(/\s+workspace\s+service$/i, "").trim();
  return fallback || "Workspace service";
}
