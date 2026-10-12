import type { MaintenanceStatus } from "@/lib/maintenance";

/** All geometry is measured in original floor-image pixels. */
export type Point = [number, number];
export type AreaShape =
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | { type: "polygon"; points: Point[] }
  | { type: "circle"; cx: number; cy: number; r: number };
export type AreaKind = "office" | "seat" | "cabin" | "meeting" | "huddle" | "phone" | "amenity";
export interface FloorArea { id: string; name: string; kind: AreaKind; capacity: number | null; shape: AreaShape }
export interface FloorConfig { id: string; name: string; image: string; width: number; height: number; areas: FloorArea[] }
export type MapStatus = "available" | "occupied" | "due-soon" | "grace" | "overdue" | "reserved" | "maintenance" | "unknown" | "shared";
/** Return only fields the signed-in user has permission to see. */
export interface AreaLiveData {
  areaId: string;
  occupancy: "available" | "occupied" | "reserved" | "maintenance";
  paymentStatus?: "paid" | "due-soon" | "grace" | "overdue" | "unknown";
  member?: { id: string; name: string; contactName?: string; email?: string; phone?: string; employees?: number; monthlyRent?: string };
  outstandingPkr?: number;
  dueDate?: string; // YYYY-MM-DD, already interpreted using your business timezone
  maintenance?: { category: string; status: MaintenanceStatus; reason: string };
}
export const STATUS_LABELS: Record<MapStatus, string> = {
  available: "Available", occupied: "Occupied", "due-soon": "Due soon", grace: "Due",
  overdue: "Overdue", reserved: "Reserved", maintenance: "Maintenance",
  unknown: "Status unavailable", shared: "Shared facility",
};
export function isRentable(area: FloorArea): boolean {
  return area.kind === "office" || area.kind === "seat" || area.kind === "cabin";
}
/** Missing API records must never imply an office is vacant. */
export function getAreaStatus(area: FloorArea, live?: AreaLiveData): MapStatus {
  if (!live) return isRentable(area) ? "unknown" : "shared";
  if (live.maintenance && live.maintenance.status !== "deactivated") return "maintenance";
  if (live.occupancy === "available") return "available";
  if (live.occupancy === "reserved") return "reserved";
  if (live.occupancy === "maintenance") return "maintenance";
  if (live.paymentStatus === "grace") return "grace";
  if (live.paymentStatus === "due-soon") return "due-soon";
  if (live.paymentStatus === "overdue") return "overdue";
  if (live.occupancy === "occupied") return "occupied";
  return "unknown";
}
