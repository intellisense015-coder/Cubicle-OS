import { cn } from "./dialog";

type WorkspaceBadgeProps = {
  value?: string | null;
  className?: string;
};

function workspaceTone(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("private office")) return "private-office";
  if (normalized.includes("dedicated desk")) return "dedicated-desk";
  if (normalized.includes("shared desk")) return "shared-desk";
  if (normalized.includes("meeting room")) return "meeting-room";
  if (normalized.includes("shared room")) return "shared-room";
  if (normalized.includes("phone booth")) return "phone-booth";
  if (normalized.includes("event space")) return "event-space";
  if (normalized.includes("cabin")) return "cabin";
  if (normalized.includes("shared facility")) return "shared-facility";
  if (normalized === "unassigned") return "unassigned";
  return "default";
}

export function WorkspaceBadge({ value, className }: WorkspaceBadgeProps) {
  const label = String(value || "").trim();
  if (!label || label === "—") return <span>—</span>;
  return <span className={cn("workspace-badge", `workspace-badge-${workspaceTone(label)}`, className)}>{label}</span>;
}
