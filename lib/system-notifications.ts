import { getActiveMemberInvoices } from "@/lib/billing";
import { getDemoValue } from "@/lib/demo-session";
import { isMaintenanceVisible } from "@/lib/maintenance";

export interface SystemNotification {
  id: string;
  title: string;
  detail: string;
  count: number;
  tone: "danger" | "brand" | "accent" | "success";
  href: string;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isToday(value: unknown, todayKey: string) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.startsWith(todayKey) || normalized.startsWith("today");
}

export function getSystemNotifications(today = new Date()): SystemNotification[] {
  const members = getDemoValue("members");
  const memberList = Array.isArray(members) ? members : [];
  const workspaces = getDemoValue("workspaces");
  const workspaceList = Array.isArray(workspaces) ? workspaces : [];
  const invoices = getActiveMemberInvoices(getDemoValue("invoices"), memberList, workspaceList);
  const todayKey = dateKey(today);
  const notifications: SystemNotification[] = [];

  const overdueInvoices = invoices.filter((invoice) => invoice.paymentStatus === "Overdue" || invoice.paymentStatus === "Grace");
  const dueSoonInvoices = invoices.filter((invoice) => invoice.paymentStatus === "Due soon");
  const pendingApprovals = (Array.isArray(getDemoValue("approvals")) ? getDemoValue("approvals") : []).filter((approval) => approval.status === "Pending");
  const followUps = (Array.isArray(getDemoValue("leads")) ? getDemoValue("leads") : []).filter((lead) => lead.stage === "Follow-up due" && isToday(lead.nextFollowUp, todayKey));
  const visits = (Array.isArray(getDemoValue("visits")) ? getDemoValue("visits") : []).filter((visit) => visit.status === "Scheduled" && isToday(visit.date, todayKey));
  const maintenanceSpaces = workspaceList.filter((workspace) => isMaintenanceVisible(workspace.maintenanceStatus));

  if (overdueInvoices.length) notifications.push({ id: "overdue-invoices", title: "Overdue member invoices", detail: "Review active member balances that need attention.", count: overdueInvoices.length, tone: "danger", href: "/invoices" });
  if (dueSoonInvoices.length) notifications.push({ id: "due-soon-invoices", title: "Member payments due soon", detail: "Active member invoices are approaching their due date.", count: dueSoonInvoices.length, tone: "brand", href: "/invoices" });
  if (pendingApprovals.length) notifications.push({ id: "pending-approvals", title: "Pending approvals", detail: "Workspace requests are waiting for an administrator.", count: pendingApprovals.length, tone: "accent", href: "/approvals" });
  if (followUps.length) notifications.push({ id: "follow-ups", title: "Follow-ups due today", detail: "Leads need their next workspace conversation.", count: followUps.length, tone: "accent", href: "/leads" });
  if (visits.length) notifications.push({ id: "visits-today", title: "Visits scheduled today", detail: "Review today’s workspace visits and hosts.", count: visits.length, tone: "success", href: "/visits" });
  if (maintenanceSpaces.length) notifications.push({ id: "maintenance-spaces", title: "Spaces under maintenance", detail: "Review active maintenance, locked, or blocked spaces.", count: maintenanceSpaces.length, tone: "danger", href: "/workspaces" });

  return notifications;
}
