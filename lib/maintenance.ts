import { getDemoValue, saveDemoValue } from "@/lib/demo-session";

export type WorkspaceOperationalStatus = "ACTIVE" | "UNDER_MAINTENANCE" | "OUT_OF_SERVICE";
export type MaintenanceRecordStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
export type MaintenanceSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Legacy field retained only for backwards-compatible category/status data.
 * The maintenance lifecycle itself uses WorkspaceOperationalStatus and
 * MaintenanceRecordStatus below.
 */
export type MaintenanceStatus = "active" | "locked" | "blocked" | "deactivated";

export interface MaintenanceCategory {
  id: string;
  name: string;
  active: boolean;
}

export interface MaintenanceRecord {
  id: string;
  workspaceId: string;
  status: MaintenanceRecordStatus;
  category: string;
  severity: MaintenanceSeverity;
  title: string;
  description: string;
  reportedById?: string;
  reportedAt: string;
  assignedToId?: string;
  startedAt?: string;
  resolvedById?: string;
  resolvedAt?: string;
  cancellationReason?: string;
  resolutionSummary?: string;
  partsUsed?: string;
  resolutionNotes?: string;
  verifiedReadyForUse?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceEvent {
  id: string;
  maintenanceId: string;
  fromStatus?: string;
  toStatus: string;
  action: string;
  notes?: string;
  actorId?: string;
  createdAt: string;
}

export const MAINTENANCE_RECORD_STATUS_LABELS: Record<MaintenanceRecordStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
};

export const MAINTENANCE_SEVERITY_LABELS: Record<MaintenanceSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const OPERATIONAL_STATUS_LABELS: Record<WorkspaceOperationalStatus, string> = {
  ACTIVE: "Active",
  UNDER_MAINTENANCE: "Under Maintenance",
  OUT_OF_SERVICE: "Out of Service",
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  active: "Active Maintenance",
  locked: "Locked",
  blocked: "Blocked",
  deactivated: "Deactivated",
};

export const MAINTENANCE_STATUS_OPTIONS: MaintenanceStatus[] = ["active", "locked", "blocked", "deactivated"];

const MAINTENANCE_RECORDS_KEY = "maintenanceRecords";
const MAINTENANCE_EVENTS_KEY = "maintenanceEvents";

const defaultCategories: MaintenanceCategory[] = [
  { id: "routine-cleaning", name: "Routine Cleaning", active: true },
  { id: "electrical-repair", name: "Electrical Repair", active: true },
  { id: "locked-blocked", name: "Locked / Blocked", active: true },
  { id: "renovations", name: "Renovations", active: true },
];

function nowIso() {
  return new Date().toISOString();
}

function actorId() {
  return String(getDemoValue("profileName") || getDemoValue("email") || "demo-user");
}

function dispatchMaintenanceChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cubicle-demo-change", { detail: { key: "maintenance" } }));
}

export function normalizeMaintenanceStatus(value: unknown): MaintenanceStatus {
  const normalized = String(value || "deactivated").trim().toLowerCase();
  if (["active maintenance", "maintenance", "active"].includes(normalized)) return "active";
  if (["locked", "lock"].includes(normalized)) return "locked";
  if (["blocked", "block"].includes(normalized)) return "blocked";
  return "deactivated";
}

export function normalizeWorkspaceOperationalStatus(value: unknown, legacyStatus?: unknown): WorkspaceOperationalStatus {
  const normalized = String(value || "").trim().toUpperCase().replaceAll(" ", "_");
  if (normalized === "UNDER_MAINTENANCE" || normalized === "MAINTENANCE") return "UNDER_MAINTENANCE";
  if (normalized === "OUT_OF_SERVICE" || normalized === "OUT_OF_ORDER") return "OUT_OF_SERVICE";

  // Locked historically represented an unavailable maintenance state in this
  // demo. Access-control locks should be stored separately going forward.
  const legacy = normalizeMaintenanceStatus(legacyStatus);
  if (legacy === "locked" || legacy === "blocked") return "OUT_OF_SERVICE";
  if (legacy === "active") return "UNDER_MAINTENANCE";
  return "ACTIVE";
}

export function isMaintenanceVisible(value: unknown) {
  return normalizeMaintenanceStatus(value) !== "deactivated";
}

export function isActiveMaintenanceRecord(record?: Partial<MaintenanceRecord> | null) {
  return Boolean(record && ["OPEN", "IN_PROGRESS"].includes(String(record.status)));
}

function normalizeCategory(category: any, index: number): MaintenanceCategory {
  return {
    id: String(category?.id || `maintenance-category-${index}`),
    name: String(category?.name || "").trim(),
    active: category?.active !== false,
  };
}

function normalizeSeverity(value: unknown): MaintenanceSeverity {
  const normalized = String(value || "MEDIUM").trim().toUpperCase();
  return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalized) ? normalized as MaintenanceSeverity : "MEDIUM";
}

function normalizeRecord(record: any, index: number): MaintenanceRecord {
  const createdAt = String(record?.createdAt || record?.reportedAt || nowIso());
  const reportedAt = String(record?.reportedAt || createdAt);
  const status = ["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"].includes(String(record?.status))
    ? record.status as MaintenanceRecordStatus
    : "OPEN";
  return {
    id: String(record?.id || `maintenance-${index}-${Date.now()}`),
    workspaceId: String(record?.workspaceId || record?.areaId || ""),
    status,
    category: String(record?.category || "Uncategorized"),
    severity: normalizeSeverity(record?.severity),
    title: String(record?.title || record?.reason || "Maintenance issue"),
    description: String(record?.description || record?.reason || ""),
    reportedById: record?.reportedById || undefined,
    reportedAt,
    assignedToId: record?.assignedToId || undefined,
    startedAt: record?.startedAt || undefined,
    resolvedById: record?.resolvedById || undefined,
    resolvedAt: record?.resolvedAt || undefined,
    cancellationReason: record?.cancellationReason || undefined,
    resolutionSummary: record?.resolutionSummary || undefined,
    partsUsed: record?.partsUsed || undefined,
    resolutionNotes: record?.resolutionNotes || undefined,
    verifiedReadyForUse: record?.verifiedReadyForUse === true,
    createdAt,
    updatedAt: String(record?.updatedAt || createdAt),
  };
}

function normalizeEvent(event: any, index: number): MaintenanceEvent {
  return {
    id: String(event?.id || `maintenance-event-${index}-${Date.now()}`),
    maintenanceId: String(event?.maintenanceId || ""),
    fromStatus: event?.fromStatus || undefined,
    toStatus: String(event?.toStatus || ""),
    action: String(event?.action || "Maintenance updated"),
    notes: event?.notes || undefined,
    actorId: event?.actorId || undefined,
    createdAt: String(event?.createdAt || nowIso()),
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

export function getMaintenanceRecords(): MaintenanceRecord[] {
  const saved = getDemoValue(MAINTENANCE_RECORDS_KEY);
  return Array.isArray(saved) ? saved.map(normalizeRecord).filter((record) => record.workspaceId) : [];
}

export function getMaintenanceEvents(): MaintenanceEvent[] {
  const saved = getDemoValue(MAINTENANCE_EVENTS_KEY);
  return Array.isArray(saved) ? saved.map(normalizeEvent).filter((event) => event.maintenanceId) : [];
}

export function getActiveMaintenanceRecord(workspaceId: string, records = getMaintenanceRecords()) {
  return records.find((record) => record.workspaceId === workspaceId && isActiveMaintenanceRecord(record)) || null;
}

export function getMaintenanceHistory(workspaceId: string, records = getMaintenanceRecords()) {
  return records
    .filter((record) => record.workspaceId === workspaceId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getMaintenanceTimeline(maintenanceId: string, events = getMaintenanceEvents()) {
  return events.filter((event) => event.maintenanceId === maintenanceId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function legacySeverity(workspace: any): MaintenanceSeverity {
  const legacy = normalizeMaintenanceStatus(workspace?.maintenanceStatus);
  if (legacy === "locked" || legacy === "blocked") return "HIGH";
  return "MEDIUM";
}

/**
 * Migrates the old maintenance fields into records without deleting history.
 * Legacy "locked"/"blocked" values are treated as OUT_OF_SERVICE because the
 * old demo used them as unavailable maintenance states, not access control.
 */
export function migrateMaintenanceData(workspaces: readonly any[]) {
  const sourceWorkspaces = Array.isArray(workspaces) ? workspaces : [];
  let records = getMaintenanceRecords();
  let events = getMaintenanceEvents();
  let changed = false;
  const nextWorkspaces = sourceWorkspaces.map((workspace) => ({ ...workspace }));

  for (const workspace of nextWorkspaces) {
    const workspaceId = String(workspace.areaId || workspace.id);
    const existingActive = getActiveMaintenanceRecord(workspaceId, records);
    const normalizedOperationalStatus = String(workspace.operationalStatus || "").trim().toUpperCase().replaceAll(" ", "_");
    const hasExplicitOperationalStatus = ["ACTIVE", "UNDER_MAINTENANCE", "OUT_OF_SERVICE"].includes(normalizedOperationalStatus);
    // Once a lifecycle action explicitly returns a workspace to ACTIVE, do not
    // recreate an old maintenance issue just because the legacy `status` field
    // still contains "maintenance".
    const legacyVisible = isMaintenanceVisible(workspace.maintenanceStatus)
      || (!hasExplicitOperationalStatus && workspace.status === "maintenance");
    let activeRecord = existingActive;

    if (!activeRecord && legacyVisible) {
      const timestamp = String(workspace.updatedAt || workspace.createdAt || nowIso());
      activeRecord = {
        id: `maintenance-migrated-${workspaceId}`,
        workspaceId,
        status: "OPEN",
        category: maintenanceCategoryName(workspace.maintenanceCategoryId || workspace.maintenanceCategory),
        severity: legacySeverity(workspace),
        title: String(workspace.maintenanceReason || "Legacy maintenance issue"),
        description: String(workspace.maintenanceReason || "Migrated from the previous workspace maintenance fields."),
        reportedById: "legacy-demo",
        reportedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies MaintenanceRecord;
      records = [activeRecord, ...records];
      events = [{ id: `maintenance-event-migrated-${activeRecord.id}`, maintenanceId: activeRecord.id, fromStatus: "ACTIVE", toStatus: "OPEN", action: "Issue migrated", notes: "Imported from the previous workspace maintenance fields.", actorId: "legacy-demo", createdAt: timestamp }, ...events];
      changed = true;
    }

    const operationalStatus = normalizeWorkspaceOperationalStatus(workspace.operationalStatus, workspace.maintenanceStatus);
    // A workspace with no active record is available again. This also repairs
    // stale demo snapshots left by the previous implementation, where the
    // operational status could remain UNDER_MAINTENANCE after an issue ended.
    const nextStatus = activeRecord
      ? activeRecord.severity === "HIGH" || activeRecord.severity === "CRITICAL" ? "OUT_OF_SERVICE" : operationalStatus === "OUT_OF_SERVICE" ? "OUT_OF_SERVICE" : "UNDER_MAINTENANCE"
      : "ACTIVE";
    const nextActiveId = activeRecord?.id || "";
    if (workspace.operationalStatus !== nextStatus || workspace.activeMaintenanceId !== nextActiveId) changed = true;
    if (!activeRecord && workspace.status === "maintenance") {
      workspace.status = "available";
      changed = true;
    }
    workspace.operationalStatus = nextStatus;
    workspace.activeMaintenanceId = nextActiveId;
  }

  if (changed) {
    saveDemoValue(MAINTENANCE_RECORDS_KEY, records);
    saveDemoValue(MAINTENANCE_EVENTS_KEY, events);
  }

  return { workspaces: nextWorkspaces, records, events, changed };
}

function readWorkspaces() {
  const saved = getDemoValue("workspaces");
  return Array.isArray(saved) ? saved.map((workspace) => ({ ...workspace })) : [];
}

function persistMaintenanceState(workspaces: any[], records: MaintenanceRecord[], events: MaintenanceEvent[]) {
  saveDemoValue("workspaces", workspaces);
  saveDemoValue("maintenanceRecords", records);
  saveDemoValue("maintenanceEvents", events);
  dispatchMaintenanceChange();
}

function createEvent(record: MaintenanceRecord, values: Pick<MaintenanceEvent, "fromStatus" | "toStatus" | "action" | "notes">) {
  return {
    id: `maintenance-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    maintenanceId: record.id,
    ...values,
    actorId: actorId(),
    createdAt: nowIso(),
  } satisfies MaintenanceEvent;
}

export function reportMaintenance(workspaceId: string, input: { category: string; severity: MaintenanceSeverity; title: string; description: string; reportedById?: string; assignedToId?: string }) {
  const migrated = migrateMaintenanceData(readWorkspaces());
  const workspaces = migrated.workspaces;
  const records = [...migrated.records];
  const events = [...migrated.events];
  const index = workspaces.findIndex((workspace) => String(workspace.areaId || workspace.id) === String(workspaceId));
  if (index < 0) throw new Error("Workspace could not be found.");

  const workspace = workspaces[index];
  const existing = getActiveMaintenanceRecord(String(workspace.areaId || workspace.id), records);
  if (existing) return { workspace, maintenance: existing, event: null, existing: true };
  if (normalizeWorkspaceOperationalStatus(workspace.operationalStatus, workspace.maintenanceStatus) !== "ACTIVE") {
    throw new Error("Only active workspaces can receive a new maintenance report.");
  }

  const timestamp = nowIso();
  const severity = normalizeSeverity(input.severity);
  const maintenance: MaintenanceRecord = {
    id: `maintenance-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    workspaceId: String(workspace.areaId || workspace.id),
    status: "OPEN",
    category: String(input.category || "Uncategorized").trim(),
    severity,
    title: String(input.title || "Maintenance issue").trim(),
    description: String(input.description || "").trim(),
    reportedById: input.reportedById || actorId(),
    reportedAt: timestamp,
    assignedToId: input.assignedToId || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const operationalStatus: WorkspaceOperationalStatus = severity === "HIGH" || severity === "CRITICAL" ? "OUT_OF_SERVICE" : "UNDER_MAINTENANCE";
  const event = createEvent(maintenance, { fromStatus: "ACTIVE", toStatus: "OPEN", action: "Issue reported", notes: input.title });
  const nextWorkspace = {
    ...workspace,
    operationalStatus,
    activeMaintenanceId: maintenance.id,
    maintenanceCategoryId: workspace.maintenanceCategoryId || maintenance.category,
    maintenanceReason: maintenance.title,
  };
  workspaces[index] = nextWorkspace;
  persistMaintenanceState(workspaces, [maintenance, ...records], [event, ...events]);
  return { workspace: nextWorkspace, maintenance, event, existing: false };
}

export function startMaintenance(maintenanceId: string) {
  const migrated = migrateMaintenanceData(readWorkspaces());
  const records = [...migrated.records];
  const events = [...migrated.events];
  const index = records.findIndex((record) => record.id === maintenanceId);
  if (index < 0) throw new Error("Maintenance record could not be found.");
  const current = records[index];
  if (current.status !== "OPEN") return { maintenance: current, workspace: migrated.workspaces.find((item) => item.activeMaintenanceId === current.id) || null, event: null };
  const timestamp = nowIso();
  const maintenance = { ...current, status: "IN_PROGRESS" as const, startedAt: current.startedAt || timestamp, updatedAt: timestamp };
  const event = createEvent(maintenance, { fromStatus: "OPEN", toStatus: "IN_PROGRESS", action: "Maintenance started" });
  records[index] = maintenance;
  persistMaintenanceState(migrated.workspaces, records, [event, ...events]);
  return { maintenance, workspace: migrated.workspaces.find((item) => item.activeMaintenanceId === current.id) || null, event };
}

export function resolveMaintenance(maintenanceId: string, input: { resolutionSummary: string; partsUsed?: string; resolutionNotes?: string; verifiedReadyForUse: boolean; resolvedById?: string }) {
  if (!String(input.resolutionSummary || "").trim()) throw new Error("A resolution summary is required.");
  if (!input.verifiedReadyForUse) throw new Error("Confirm that the workspace is ready for use before restoring it.");

  const migrated = migrateMaintenanceData(readWorkspaces());
  const records = [...migrated.records];
  const events = [...migrated.events];
  const index = records.findIndex((record) => record.id === maintenanceId);
  if (index < 0) throw new Error("Maintenance record could not be found.");
  const current = records[index];
  if (!isActiveMaintenanceRecord(current)) throw new Error("Only an open or in-progress issue can be resolved.");
  const workspaceIndex = migrated.workspaces.findIndex((workspace) => String(workspace.activeMaintenanceId) === String(current.id));
  if (workspaceIndex < 0) throw new Error("The affected workspace could not be found.");

  const timestamp = nowIso();
  const maintenance: MaintenanceRecord = {
    ...current,
    status: "RESOLVED",
    resolvedById: input.resolvedById || actorId(),
    resolvedAt: timestamp,
    resolutionSummary: String(input.resolutionSummary).trim(),
    partsUsed: String(input.partsUsed || "").trim() || undefined,
    resolutionNotes: String(input.resolutionNotes || "").trim() || undefined,
    verifiedReadyForUse: true,
    updatedAt: timestamp,
  };
  const restoredStatus = migrated.workspaces[workspaceIndex].status === "maintenance"
    ? "available"
    : migrated.workspaces[workspaceIndex].status;
  const workspace = { ...migrated.workspaces[workspaceIndex], status: restoredStatus, operationalStatus: "ACTIVE" as const, activeMaintenanceId: "", maintenanceStatus: "deactivated", maintenanceReason: "" };
  const event = createEvent(maintenance, { fromStatus: current.status, toStatus: "RESOLVED", action: "Workspace restored", notes: maintenance.resolutionSummary });
  records[index] = maintenance;
  migrated.workspaces[workspaceIndex] = workspace;
  persistMaintenanceState(migrated.workspaces, records, [event, ...events]);
  return { maintenance, workspace, event };
}

export function cancelMaintenance(maintenanceId: string, cancellationReason: string) {
  if (!String(cancellationReason || "").trim()) throw new Error("A cancellation reason is required.");
  const migrated = migrateMaintenanceData(readWorkspaces());
  const records = [...migrated.records];
  const events = [...migrated.events];
  const index = records.findIndex((record) => record.id === maintenanceId);
  if (index < 0) throw new Error("Maintenance record could not be found.");
  const current = records[index];
  if (!isActiveMaintenanceRecord(current)) return { maintenance: current, workspace: migrated.workspaces.find((item) => item.activeMaintenanceId === current.id) || null, event: null };
  const timestamp = nowIso();
  const maintenance = { ...current, status: "CANCELLED" as const, cancellationReason: String(cancellationReason).trim(), updatedAt: timestamp };
  const workspaceIndex = migrated.workspaces.findIndex((workspace) => String(workspace.activeMaintenanceId) === String(current.id));
  const restoredStatus = workspaceIndex >= 0 && migrated.workspaces[workspaceIndex].status === "maintenance"
    ? "available"
    : workspaceIndex >= 0 ? migrated.workspaces[workspaceIndex].status : undefined;
  const workspace = workspaceIndex >= 0 ? { ...migrated.workspaces[workspaceIndex], status: restoredStatus, operationalStatus: "ACTIVE" as const, activeMaintenanceId: "", maintenanceStatus: "deactivated", maintenanceReason: "" } : null;
  const event = createEvent(maintenance, { fromStatus: current.status, toStatus: "CANCELLED", action: "Maintenance report withdrawn", notes: maintenance.cancellationReason });
  records[index] = maintenance;
  if (workspaceIndex >= 0 && workspace) migrated.workspaces[workspaceIndex] = workspace;
  persistMaintenanceState(migrated.workspaces, records, [event, ...events]);
  return { maintenance, workspace, event };
}
