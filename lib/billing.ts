export const BILLING_GRACE_PERIOD_DAYS = 3;
export type BillingStatus = "Due soon" | "Grace" | "Overdue" | "Paid";

export interface WorkspaceInvoice {
  invoice: string;
  workspaceId: string;
  memberId: string;
  account: string;
  period: string;
  amount: string;
  unitPrice: string;
  qty: string;
  itemDescription: string;
  issueDate: string;
  dueDate: string;
  billingStartDate?: string;
  dueDay?: number;
  manualDateOverride?: boolean;
  subtotal?: string;
  charges?: Array<{ description: string; amount: string }>;
  items?: Array<{ description: string; price: string | number; quantity?: number }>;
  taxEnabled?: boolean;
  taxRate?: string;
  taxAmount?: string;
  taxLabel?: string;
  whtEnabled?: boolean;
  whtRate?: string;
  whtAmount?: string;
  salesTaxEnabled?: boolean;
  salesTaxRate?: string;
  salesTaxAmount?: string;
  graceUntil: string;
  paymentStatus: BillingStatus;
  emailStatus: string;
  membershipPeriodId?: string;
}

/**
 * Return only invoices that resolve to a current member record. Older demo
 * invoices may not have memberId, so exact account matches are migrated while
 * stale or manually-created non-member records are excluded.
 */
export function getValidMemberInvoices(invoices: readonly any[], members: readonly any[]) {
  const memberList = Array.isArray(members) ? members : [];
  const memberIds = new Set(memberList.map((member) => member.id).filter(Boolean));
  const memberByAccount = new Map(memberList.map((member) => [
    `${member.member} - ${member.company || "No company"}`,
    member.id
  ]));

  return (Array.isArray(invoices) ? invoices : []).flatMap((invoice) => {
    if (!invoice || typeof invoice !== "object") return [];
    const resolvedMemberId = invoice.memberId && memberIds.has(invoice.memberId) ? invoice.memberId : memberByAccount.get(String(invoice.account || ""));
    const member = memberList.find((item) => item.id === resolvedMemberId);
    const billingStartDate = invoice.billingStartDate || member?.billingStartDate || member?.joined || "";
    const repairedInvoice = resolvedMemberId && billingStartDate && invoice.dueDate && invoice.dueDate < billingStartDate
      ? { ...invoice, memberId: resolvedMemberId, billingStartDate, dueDate: billingStartDate, dueDay: Number(String(billingStartDate).slice(-2)) || invoice.dueDay, manualDateOverride: false }
      : (invoice.memberId === resolvedMemberId ? invoice : { ...invoice, memberId: resolvedMemberId });
    if (invoice.memberId && memberIds.has(invoice.memberId)) return [repairedInvoice];
    const inferredMemberId = memberByAccount.get(String(invoice.account || ""));
    return inferredMemberId ? [repairedInvoice] : [];
  });
}

function isActiveMember(member: any) {
  return !["inactive", "deactivated", "disabled", "archived"].includes(String(member?.status || "active").trim().toLowerCase());
}

function invoicePeriodKey(invoice: any) {
  const issueDate = String(invoice?.issueDate || "").slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(issueDate)) return issueDate;
  return String(invoice?.period || "");
}

function invoiceSequence(invoice: any) {
  return Number(String(invoice?.invoice || "").match(/(\d+)$/)?.[1] || 0);
}

/**
 * Invoice read model used by the dashboard and register. It removes inactive
 * members, stale workspace assignments, and duplicate invoices for the same
 * member and billing period while preserving the best current assignment.
 */
export function getActiveMemberInvoices(invoices: readonly any[], members: readonly any[], workspaces: readonly any[] = []) {
  const memberList = Array.isArray(members) ? members : [];
  const activeMembers = memberList.filter(isActiveMember);
  const activeMemberIds = new Set(activeMembers.map((member) => member.id).filter(Boolean));
  const memberById = new Map(activeMembers.map((member) => [member.id, member]));
  const workspaceById = new Map((Array.isArray(workspaces) ? workspaces : []).map((workspace) => [workspace.id, workspace]));
  const validInvoices = getValidMemberInvoices(invoices, memberList).filter((invoice) => {
    if (!invoice.memberId || !activeMemberIds.has(invoice.memberId)) return false;
    if (!invoice.workspaceId) return true;
    const workspace = workspaceById.get(invoice.workspaceId);
    return Boolean(workspace && workspace.memberId === invoice.memberId && workspace.status === "occupied");
  });
  const bestByPeriod = new Map<string, any>();

  for (const invoice of validInvoices) {
    const member = memberById.get(invoice.memberId);
    const key = `${invoice.memberId}::${invoicePeriodKey(invoice)}`;
    const current = bestByPeriod.get(key);
    const preferredWorkspace = member?.spaceId && invoice.workspaceId === member.spaceId;
    const currentPreferredWorkspace = member?.spaceId && current?.workspaceId === member.spaceId;
    if (!current || (preferredWorkspace && !currentPreferredWorkspace) || (preferredWorkspace === currentPreferredWorkspace && invoiceSequence(invoice) > invoiceSequence(current))) {
      bestByPeriod.set(key, invoice);
    }
  }

  return [...bestByPeriod.values()];
}

const invoiceAmount = (value: unknown) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function nextMonth(year: number, month: number) {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

function getDueDate(year: number, month: number, dueDay: number, billingStartDate: Date) {
  const day = Math.min(Math.max(dueDay, 1), daysInMonth(year, month));
  const dueDate = new Date(year, month, day, 12);
  if (billingStartDate.getFullYear() === year && billingStartDate.getMonth() === month && dueDate < billingStartDate) {
    return new Date(billingStartDate);
  }
  return dueDate;
}

export function getBillingStatus(invoice: Pick<WorkspaceInvoice, "paymentStatus" | "dueDate" | "graceUntil">, today = new Date()): BillingStatus {
  if (invoice.paymentStatus === "Paid") return "Paid";
  const dueDate = parseDate(invoice.dueDate);
  const graceUntil = parseDate(invoice.graceUntil) || (dueDate ? addDays(dueDate, BILLING_GRACE_PERIOD_DAYS) : null);
  if (!dueDate || !graceUntil) return "Due soon";
  const todayKey = localDateKey(today);
  if (todayKey < localDateKey(dueDate)) return "Due soon";
  if (todayKey <= localDateKey(graceUntil)) return "Grace";
  return "Overdue";
}

function createInvoiceId(existing: readonly WorkspaceInvoice[], year: number) {
  const used = new Set(existing.map((invoice) => invoice.invoice));
  let sequence = 1000 + existing.length + 1;
  let id = `INV-${year}-${sequence}`;
  while (used.has(id)) {
    sequence += 1;
    id = `INV-${year}-${sequence}`;
  }
  return id;
}

/**
 * Workspace billing is read from Supabase now. This helper remains as a
 * compatibility boundary for dashboard workspace data, but it must not create
 * or persist invoice records in browser storage.
 */
export function syncWorkspaceBilling(workspaces: readonly any[]) {
  const today = new Date();
  const currentPeriod = monthKey(today.getFullYear(), today.getMonth());
  return { workspaces: Array.isArray(workspaces) ? workspaces : [], invoices: [], currentPeriod };
}
