import { getDemoValue, saveDemoValue } from "@/lib/demo-session";

export type MaintenanceStatus = "active" | "locked" | "blocked" | "deactivated";

export interface MaintenanceCategory {
  id: string;
  name: string;
  active: boolean;
}

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  active: "Active Maintenance",
  locked: "Locked",
  blocked: "Blocked",
  deactivated: "Deactivated",
};

export const MAINTENANCE_STATUS_OPTIONS: MaintenanceStatus[] = ["active", "locked", "blocked", "deactivated"];

const defaultCategories: MaintenanceCategory[] = [
  { id: "routine-cleaning", name: "Routine Cleaning", active: true },
  { id: "electrical-repair", name: "Electrical Repair", active: true },
  { id: "locked-blocked", name: "Locked / Blocked", active: true },
  { id: "renovations", name: "Renovations", active: true },
];

export function normalizeMaintenanceStatus(value: unknown): MaintenanceStatus {
  const normalized = String(value || "deactivated").trim().toLowerCase();
  if (normalized === "active maintenance" || normalized === "maintenance" || normalized === "active") return "active";
  if (normalized === "locked" || normalized === "lock") return "locked";
  if (normalized === "blocked" || normalized === "block") return "blocked";
  return "deactivated";
}

export function isMaintenanceVisible(value: unknown) {
  return normalizeMaintenanceStatus(value) !== "deactivated";
}

function normalizeCategory(category: any, index: number): MaintenanceCategory {
  return {
    id: String(category?.id || `maintenance-category-${index}`),
    name: String(category?.name || "").trim(),
    active: category?.active !== false,
  };
}

export function getMaintenanceCategories(): MaintenanceCategory[] {
  const saved = getDemoValue("maintenanceCategories");
  if (!Array.isArray(saved) || !saved.length) return defaultCategories;
  return saved.map(normalizeCategory).filter((category) => category.name);
}

export function saveMaintenanceCategories(categories: MaintenanceCategory[]) {
  const normalized = categories.map(normalizeCategory).filter((category) => category.name);
  saveDemoValue("maintenanceCategories", normalized);
  return normalized;
}

export function maintenanceCategoryName(categoryId: unknown, fallback = "Uncategorized") {
  const category = getMaintenanceCategories().find((item) => item.id === categoryId || item.name === categoryId);
  return category?.name || fallback;
}
