import { floor4 } from "@/features/floor-plan/floor-4";
import { isRentable, type AreaLiveData, type FloorArea, type FloorConfig } from "@/features/floor-plan/types";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { syncWorkspaceBilling } from "@/lib/billing";

export const workspaceTypes = ["Private office", "Cabin", "Dedicated desk", "Shared desk", "Meeting room", "Shared room", "Phone booth", "Shared facility"];
const EMPTY_WORKSPACE_DATA_VERSION = "empty-floor-plan-v2";
const WORKSPACE_DATA_VERSION_KEY = "floorPlanDataVersion";

const typeLabels = {
  office: "Private office",
  cabin: "Cabin",
  seat: "Shared desk",
  meeting: "Meeting room",
  huddle: "Shared room",
  phone: "Phone booth",
  amenity: "Shared facility"
};

const kindForType = {
  "Private office": "office",
  Cabin: "cabin",
  "Dedicated desk": "seat",
  "Shared desk": "seat",
  "Meeting room": "meeting",
  "Shared room": "huddle",
  "Phone booth": "phone",
  "Shared facility": "amenity"
};

function statusFor(area: FloorArea, live?: AreaLiveData) {
  if (!live) return "available";
  return live.occupancy === "occupied" ? "occupied" : live.occupancy;
}

function paymentLabel(live?: AreaLiveData) {
  if (!live?.paymentStatus) return "Not assigned";
  if (live.paymentStatus === "due-soon" || live.paymentStatus === "grace") return "Due soon";
  if (live.paymentStatus === "overdue") return "Overdue";
  if (live.paymentStatus === "paid") return "Paid";
  return "Not assigned";
}

function baseRecord(area: FloorArea) {
  const company = "Unassigned";
  const occupant = "Available";
  return {
    id: area.id,
    areaId: area.id,
    label: area.name,
    type: typeLabels[area.kind] || "Shared facility",
    kind: area.kind,
    zone: floor4.name,
    capacity: area.capacity,
    occupant,
    company,
    memberId: "",
    monthlyRent: "PKR 0",
    billingStartDate: "",
    dueDay: 5,
    gracePeriodDays: 3,
    paymentStatus: "Not assigned",
    status: "available",
    floor: floor4.name
  };
}

export function getInitialWorkspaceRecords() {
  return floor4.areas.map(baseRecord);
}

export function getWorkspaceRecords() {
  const saved = getDemoValue("workspaces");
  const currentVersion = getDemoValue(WORKSPACE_DATA_VERSION_KEY);
  const hasSavedRecords = Array.isArray(saved) && saved.length > 0;
  const merged = mergeWorkspaceRecords(hasSavedRecords ? saved : getInitialWorkspaceRecords());
  const records = currentVersion === EMPTY_WORKSPACE_DATA_VERSION || !hasSavedRecords
    ? merged
    : merged.map((record) => ({
      ...record,
      occupant: "Available",
      company: "Unassigned",
      memberId: "",
      monthlyRent: "PKR 0",
      paymentStatus: "Not assigned",
      status: "available"
    }));
  saveDemoValue("workspaces", records);
  saveDemoValue(WORKSPACE_DATA_VERSION_KEY, EMPTY_WORKSPACE_DATA_VERSION);
  return syncWorkspaceBilling(records).workspaces;
}

export function isAssignableWorkspace(workspace) {
  return ["office", "seat", "cabin"].includes(workspace.kind);
}

/** Keep user-edited workspace fields while enforcing the developer-mapped floor areas. */
export function mergeWorkspaceRecords(saved) {
  const savedByAreaId = new Map((Array.isArray(saved) ? saved : []).map((record) => [record.areaId || record.id, record]));
  return floor4.areas.map((area) => {
    const savedRecord = savedByAreaId.get(area.id) || {};
    return { ...baseRecord(area), ...savedRecord, id: area.id, areaId: area.id, kind: kindForType[savedRecord.type] || area.kind };
  });
}

export function applyWorkspaceRecordsToFloor(records): FloorConfig {
  const byAreaId = new Map((Array.isArray(records) ? records : []).map((record) => [record.areaId || record.id, record]));
  return {
    ...floor4,
    areas: floor4.areas.map((area) => {
      const record = byAreaId.get(area.id);
      return record ? { ...area, name: record.label || area.name, kind: kindForType[record.type] || area.kind, capacity: record.capacity ?? area.capacity } : area;
    })
  };
}

export function workspaceRecordsToAreaData(records): AreaLiveData[] {
  const byAreaId = new Map((Array.isArray(records) ? records : []).map((record) => [record.areaId || record.id, record]));
  const memberById = new Map<any, any>((getDemoValue("members") || []).map((member: any) => [member.id, member]));
  const mappedFloor = applyWorkspaceRecordsToFloor(records);
  return mappedFloor.areas.filter(isRentable).map((area) => {
    const record = byAreaId.get(area.id) || baseRecord(area);
    const assignedMember = memberById.get(record.memberId);
    const occupied = record.status === "occupied";
    return {
      areaId: area.id,
      occupancy: record.status === "reserved" || record.status === "maintenance" ? record.status : occupied ? "occupied" : "available",
      paymentStatus: record.paymentStatus === "Overdue" ? "overdue" : record.paymentStatus === "Grace" ? "grace" : record.paymentStatus === "Due soon" ? "due-soon" : record.paymentStatus === "Paid" ? "paid" : "unknown",
      ...(occupied ? { member: { id: record.memberId || area.id, name: assignedMember?.company || record.company || "No company", contactName: assignedMember?.member || record.occupant || undefined, email: assignedMember?.email || undefined, employees: record.capacity || undefined, monthlyRent: assignedMember?.rent || record.monthlyRent || undefined } } : {})
    };
  });
}
