import { getDemoValue, saveDemoValue } from "@/lib/demo-session";

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
  graceUntil: string;
  paymentStatus: BillingStatus;
  emailStatus: string;
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
 * Creates missing monthly workspace invoices and recalculates unpaid statuses.
 * Paid invoices are never changed back to an unpaid state.
 */
export function syncWorkspaceBilling(workspaces: readonly any[]) {
  const savedInvoices = getDemoValue("invoices");
  const savedMembers = getDemoValue("members");
  const invoices: WorkspaceInvoice[] = Array.isArray(savedInvoices) ? [...savedInvoices] : [];
  const members = Array.isArray(savedMembers) ? savedMembers : [];
  const today = new Date();
  const todayKey = localDateKey(today);

  for (const workspace of workspaces) {
    if (!workspace.memberId) continue;
    const member = members.find((item) => item.id === workspace.memberId);
    const billingStartDate = parseDate(workspace.billingStartDate || member?.billingStartDate || member?.joined);
    if (!billingStartDate || todayKey < localDateKey(billingStartDate)) continue;

    const dueDay = Number(workspace.dueDay || member?.dueDay || 5);
    const startMonth = { year: billingStartDate.getFullYear(), month: billingStartDate.getMonth() };
    let cursor = startMonth;
    const currentMonth = { year: today.getFullYear(), month: today.getMonth() };

    while (cursor.year < currentMonth.year || (cursor.year === currentMonth.year && cursor.month <= currentMonth.month)) {
      const period = monthKey(cursor.year, cursor.month);
      const dueDate = getDueDate(cursor.year, cursor.month, dueDay, billingStartDate);
      const graceUntil = addDays(dueDate, Number(workspace.gracePeriodDays || BILLING_GRACE_PERIOD_DAYS));
      const existingIndex = invoices.findIndex((invoice) => invoice.workspaceId === workspace.id && invoice.period === period);
      const existing = existingIndex >= 0 ? invoices[existingIndex] : null;
      const memberName = member?.member || workspace.occupant || "Assigned member";
      const account = `${memberName} - ${member?.company || workspace.company || "No company"}`;
      const amount = workspace.monthlyRent || member?.rent || "PKR 0";
      const invoice = {
        invoice: existing?.invoice || createInvoiceId(invoices, cursor.year),
        workspaceId: workspace.id,
        memberId: workspace.memberId,
        account,
        period: new Date(cursor.year, cursor.month, 1, 12).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        amount,
        unitPrice: amount,
        qty: "1",
        itemDescription: `${workspace.label || "Workspace"} monthly rent`,
        issueDate: localDateKey(billingStartDate.getFullYear() === cursor.year && billingStartDate.getMonth() === cursor.month ? billingStartDate : new Date(cursor.year, cursor.month, 1, 12)),
        dueDate: localDateKey(dueDate),
        graceUntil: localDateKey(graceUntil),
        paymentStatus: existing?.paymentStatus === "Paid" ? "Paid" : getBillingStatus({ paymentStatus: existing?.paymentStatus || "Due soon", dueDate: localDateKey(dueDate), graceUntil: localDateKey(graceUntil) }, today),
        emailStatus: existing?.emailStatus || "Not sent"
      } satisfies WorkspaceInvoice;
      if (existingIndex >= 0) invoices[existingIndex] = invoice;
      else invoices.push(invoice);
      cursor = nextMonth(cursor.year, cursor.month);
    }
  }

  saveDemoValue("invoices", invoices);

  const currentPeriod = monthKey(today.getFullYear(), today.getMonth());
  const nextWorkspaces = workspaces.map((workspace) => {
    const currentInvoice = invoices.find((invoice) => invoice.workspaceId === workspace.id && invoice.period === new Date(today.getFullYear(), today.getMonth(), 1, 12).toLocaleDateString("en-US", { month: "long", year: "numeric" }));
    return currentInvoice ? { ...workspace, paymentStatus: currentInvoice.paymentStatus, billingInvoiceId: currentInvoice.invoice } : workspace;
  });
  saveDemoValue("workspaces", nextWorkspaces);
  return { workspaces: nextWorkspaces, invoices, currentPeriod };
}
