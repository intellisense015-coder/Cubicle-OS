import type { MaintenanceRecordStatus, MaintenanceSeverity, MaintenanceStatus, WorkspaceOperationalStatus } from "@/lib/maintenance";

/** All geometry is measured in original floor-image pixels. */
export type Point = [number, number];
export type AreaShape =
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | { type: "polygon"; points: Point[] }
  | { type: "circle"; cx: number; cy: number; r: number };
export type AreaKind = "office" | "seat" | "cabin" | "meeting" | "huddle" | "phone" | "amenity";
export interface FloorArea { id: string; name: string; kind: AreaKind; capacity: number | null; shape: AreaShape }
export interface FloorConfig { id: string; name: string; image: string; width: number; height: number; areas: FloorArea[] }
export type MapStatus = "available" | "occupied" | "notice-period" | "due-soon" | "grace" | "overdue" | "reserved" | "maintenance" | "unknown" | "shared";
/** Return only fields the signed-in user has permission to see. */
export interface AreaLiveData {
  areaId: string;
  occupancy: "available" | "occupied" | "reserved" | "maintenance";
  paymentStatus?: "paid" | "due-soon" | "grace" | "overdue" | "unknown";
  membershipStatus?: "active" | "notice-period";
  noticeStartDate?: string;
  expectedLeavingDate?: string;
  noticeNotes?: string;
  member?: { id: string; name: string; contactName?: string; email?: string; phone?: string; employees?: number; monthlyRent?: string };
  outstandingPkr?: number;
  dueDate?: string; // YYYY-MM-DD, already interpreted using your business timezone
  operationalStatus?: WorkspaceOperationalStatus;
  maintenance?: { category: string; status: MaintenanceRecordStatus | MaintenanceStatus; reason: string; title?: string; severity?: MaintenanceSeverity; assignedToId?: string; reportedAt?: string };
}
export const STATUS_LABELS: Record<MapStatus, string> = {
  available: "Available / Free", occupied: "Occupied / Good standing", "notice-period": "Notice period", "due-soon": "Payment due soon", grace: "Payment grace period",
  overdue: "Overdue payments", reserved: "Reserved", maintenance: "Under maintenance",
  unknown: "Status unavailable", shared: "Shared facility",
};
export function isRentable(area: FloorArea): boolean {
  return area.kind === "office" || area.kind === "seat" || area.kind === "cabin";
}
/** Missing API records must never imply an office is vacant. */
export function getAreaStatus(area: FloorArea, live?: AreaLiveData): MapStatus {
  if (!live) return isRentable(area) ? "unknown" : "shared";
  // The floor plan uses one neutral grey maintenance treatment for every
  // maintenance state. Payment urgency remains the only red map treatment.
  if (live.operationalStatus === "OUT_OF_SERVICE") return "maintenance";
  if (live.operationalStatus === "UNDER_MAINTENANCE") return "maintenance";
  const maintenanceStatus = String(live.maintenance?.status || "").toUpperCase();
  if (["OPEN", "IN_PROGRESS", "ACTIVE", "LOCKED", "BLOCKED"].includes(maintenanceStatus)) return "maintenance";
  if (live.membershipStatus === "notice-period") return "notice-period";
  if (live.occupancy === "available") return "available";
  if (live.occupancy === "reserved") return "reserved";
  if (live.occupancy === "maintenance") return "maintenance";
  if (live.paymentStatus === "grace") return "grace";
  if (live.paymentStatus === "due-soon") return "due-soon";
  if (live.paymentStatus === "overdue") return "overdue";
  if (live.occupancy === "occupied") return "occupied";
  return "unknown";
}
