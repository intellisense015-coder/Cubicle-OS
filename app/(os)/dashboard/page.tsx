"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, CreditCard, Grid2X2, ListChecks, Receipt, Users } from "lucide-react";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";
import { KpiCard } from "@/components/ui/kpi-card";
import { DataTable } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDemoSession, getDemoValue } from "@/lib/demo-session";
import { getWorkspaceRecords, isAssignableWorkspace } from "@/lib/workspace-records";
import { syncWorkspaceBilling } from "@/lib/billing";
import { AppSkeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/relative-time";
import { normalizeLeadStage } from "@/lib/lead-stages";
import { getActiveMemberInvoices } from "@/lib/billing";

function formatDashboardFollowUp(value) {
  if (!value || value === "Not scheduled") return value || "Not scheduled";
  const hasTime = value.includes(" · ");
  const [date, time] = hasTime ? value.split(" · ") : [value, "00:00"];
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", hasTime ? { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true } : { day: "2-digit", month: "short", year: "numeric" }).replace(",", "");
}

function getDashboardFollowUpSortValue(value, now = new Date()) {
  if (!value || value === "Not scheduled") return Number.MAX_SAFE_INTEGER;
  const normalized = String(value).trim();
  const today = new Date(now);
  let datePart = normalized;
  let timePart = "00:00";
  if (normalized.toLowerCase().startsWith("today")) {
    datePart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const todayTime = normalized.match(/,\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i)?.[1];
    timePart = todayTime || "00:00";
  } else if (normalized.toLowerCase().startsWith("tomorrow")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    datePart = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    const tomorrowTime = normalized.match(/,\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i)?.[1];
    timePart = tomorrowTime || "00:00";
  } else {
    const parts = normalized.includes(" · ") ? normalized.split(" · ") : [normalized];
    datePart = parts[0];
    timePart = parts[1] || "00:00";
  }
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? new Date(`${datePart}T00:00:00`) : new Date(datePart);
  const timeMinutes = getVisitTimeMinutes(timePart);
  if (!Number.isNaN(baseDate.getTime()) && timeMinutes !== Number.MAX_SAFE_INTEGER) {
    baseDate.setHours(Math.floor(timeMinutes / 60), timeMinutes % 60, 0, 0);
    return baseDate.getTime();
  }
  const fallback = new Date(normalized);
  return Number.isNaN(fallback.getTime()) ? Number.MAX_SAFE_INTEGER : fallback.getTime();
}

function formatDashboardFollowUpAge(value, now = Date.now()) {
  const timestamp = getDashboardFollowUpSortValue(value, new Date(now));
  return timestamp === Number.MAX_SAFE_INTEGER ? formatDashboardFollowUp(value) : formatRelativeTime(timestamp, now);
}

function getDashboardFollowUpUrgency(value, now = Date.now()) {
  const difference = getDashboardFollowUpSortValue(value, new Date(now)) - now;
  if (difference < 0) return "overdue";
  if (difference <= 15 * 60 * 1000) return "urgent";
  if (difference <= 60 * 60 * 1000) return "soon";
  return "later";
}

function getDashboardFollowUpUrgencyClass(value, now) {
  return `dashboard-visit-${getDashboardFollowUpUrgency(value, now)}`;
}

function isFollowUpDueToday(value) {
  if (!value || value === "Not scheduled") return false;
  if (value.toLowerCase().startsWith("today")) return true;
  const followUpDate = value.split(" · ")[0];
  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return followUpDate === todayDate;
}

function isDateToday(value) {
  if (!value) return false;
  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return value === todayDate;
}

function getVisitTimeMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "am" && hours === 12) hours = 0;
  if (meridiem === "pm" && hours < 12) hours += 12;
  return hours * 60 + minutes;
}

function formatDashboardVisitTime(value) {
  const totalMinutes = getVisitTimeMinutes(value);
  if (totalMinutes === Number.MAX_SAFE_INTEGER) return value || "Time not set";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "pm" : "am"}`;
}

function getDashboardVisitSortValue(visit) {
  const dateValue = new Date(`${visit.date}T00:00:00`).getTime();
  return (Number.isNaN(dateValue) ? Number.MAX_SAFE_INTEGER : dateValue) + getVisitTimeMinutes(visit.time) * 60 * 1000;
}

function formatDashboardVisitAge(visit, now = Date.now()) {
  return formatRelativeTime(getDashboardVisitSortValue(visit), now);
}

function getDashboardVisitUrgency(visit, now = Date.now()) {
  const difference = getDashboardVisitSortValue(visit) - now;
  if (difference < 0) return "overdue";
  if (difference <= 15 * 60 * 1000) return "urgent";
  if (difference <= 60 * 60 * 1000) return "soon";
  return "later";
}

function getDashboardVisitUrgencyClass(visit, now) {
  return `dashboard-visit-${getDashboardVisitUrgency(visit, now)}`;
}

const paymentColumns = [
  { accessorKey: "account", header: "Account" },
  { accessorKey: "invoice", header: "Invoice number" },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge tone={getValue() === "Paid" ? "success" : getValue() === "Overdue" ? "danger" : "accent"}>{getValue()}</StatusBadge> },
  { accessorKey: "amount", header: "Amount" },
];

function dashboardAmount(value) {
  return Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
}

function formatDashboardAmount(value) {
  return `PKR ${dashboardAmount(value).toLocaleString("en-PK")}`;
}

function dashboardWorkspaceSeats(workspace) {
  return Math.max(1, Number(workspace.capacity) || 0);
}

function dashboardWorkspaceGroup(workspace) {
  return ["office", "cabin"].includes(workspace.kind) ? "private" : "shared";
}

function dashboardWorkspaceStatus(workspace) {
  if (["maintenance", "reserved"].includes(workspace.status) || workspace.maintenanceStatus && workspace.maintenanceStatus !== "deactivated") return "maintenance";
  if (workspace.paymentStatus === "Overdue") return "overdue";
  if (workspace.paymentStatus === "Grace") return "grace";
  if (workspace.paymentStatus === "Due soon") return "due-soon";
  if (workspace.status === "occupied") return "occupied";
  return "available";
}

function dashboardWorkspaceStatusLabel(status) {
  return { occupied: "Occupied", available: "Available", notice: "Notice period", maintenance: "Under maintenance", overdue: "Overdue payments", "due-soon": "Payment due soon", grace: "Grace period" }[status] || "Available";
}

function displayDashboardPaymentStatus(status) {
  return status === "Grace" ? "Grace period" : status || "Not assigned";
}

function dashboardDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [followUpRows, setFollowUpRows] = useState<any[]>([]);
  const [visitRows, setVisitRows] = useState<any[]>([]);
  const [workspaceRows, setWorkspaceRows] = useState<any[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<any[]>([]);
  const [approvalRows, setApprovalRows] = useState<any[]>([]);
  const [spaceOccupancy, setSpaceOccupancy] = useState({ occupied: 0, total: 0 });
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const current = getDemoSession();
    if (!current.pinVerified) {
      router.replace("/login");
      return;
    }
    setSession(current);

    const loadDashboardData = () => {
      const workspaces = syncWorkspaceBilling(getWorkspaceRecords()).workspaces.filter(isAssignableWorkspace);
      setWorkspaceRows(workspaces);
      setSpaceOccupancy({
        occupied: workspaces.filter((workspace) => workspace.status === "occupied").length,
        total: workspaces.length,
      });

      const savedMembers = getDemoValue("members");
      const savedInvoices = getDemoValue("invoices");
      const activeMemberInvoices = getActiveMemberInvoices(savedInvoices, Array.isArray(savedMembers) ? savedMembers : [], workspaces);
      const currentPeriod = dashboardDateKey(new Date()).slice(0, 7);
      setInvoiceRows(activeMemberInvoices.filter((invoice) => String(invoice.issueDate || "").startsWith(currentPeriod)));

      const savedApprovals = getDemoValue("approvals");
      setApprovalRows(Array.isArray(savedApprovals) ? savedApprovals : []);

      const savedLeads = getDemoValue("leads");
      if (Array.isArray(savedLeads)) {
        const normalizedLeads = savedLeads.map((lead) => ({ ...lead, stage: normalizeLeadStage(lead.stage, lead) }));
        setFollowUpRows(normalizedLeads.filter((lead) => lead.stage === "Follow-up due" && isFollowUpDueToday(lead.nextFollowUp)));
      } else {
        setFollowUpRows([]);
      }

      const savedVisits = getDemoValue("visits");
      if (Array.isArray(savedVisits)) {
        setVisitRows(savedVisits.filter((visit) => visit.status === "Scheduled" && isDateToday(visit.date)));
      } else {
        setVisitRows([]);
      }
    };

    loadDashboardData();
    const refreshOnFocus = () => loadDashboardData();
    const refreshOnVisibility = () => { if (document.visibilityState === "visible") loadDashboardData(); };
    const refreshTimer = window.setInterval(loadDashboardData, 60 * 1000);
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const sortedVisitRows = useMemo(() => [...visitRows].sort((a, b) => {
    const urgencyOrder = ["overdue", "urgent", "soon", "later"];
    const urgencyDifference = urgencyOrder.indexOf(getDashboardVisitUrgency(a, currentTime)) - urgencyOrder.indexOf(getDashboardVisitUrgency(b, currentTime));
    if (urgencyDifference) return urgencyDifference;
    return getDashboardVisitSortValue(a) - getDashboardVisitSortValue(b);
  }), [visitRows, currentTime]);

  const sortedFollowUpRows = useMemo(() => [...followUpRows].sort((a, b) => {
    const urgencyOrder = ["overdue", "urgent", "soon", "later"];
    const urgencyDifference = urgencyOrder.indexOf(getDashboardFollowUpUrgency(a.nextFollowUp, currentTime)) - urgencyOrder.indexOf(getDashboardFollowUpUrgency(b.nextFollowUp, currentTime));
    if (urgencyDifference) return urgencyDifference;
    return getDashboardFollowUpSortValue(a.nextFollowUp) - getDashboardFollowUpSortValue(b.nextFollowUp);
  }), [followUpRows, currentTime]);

  const paymentDueAmount = useMemo(() => invoiceRows
    .filter((invoice) => invoice.paymentStatus !== "Paid")
    .reduce((total, invoice) => total + dashboardAmount(invoice.amount), 0), [invoiceRows]);

  const recurringAmount = useMemo(() => workspaceRows
    .filter((workspace) => workspace.status === "occupied")
    .reduce((total, workspace) => total + dashboardAmount(workspace.monthlyRent), 0), [workspaceRows]);

  const dashboardMetrics = useMemo(() => {
    const privateWorkspaces = workspaceRows.filter((workspace) => dashboardWorkspaceGroup(workspace) === "private");
    const sharedWorkspaces = workspaceRows.filter((workspace) => dashboardWorkspaceGroup(workspace) === "shared");
    const totalSeats = workspaceRows.reduce((total, workspace) => total + dashboardWorkspaceSeats(workspace), 0);
    const privateSeats = privateWorkspaces.reduce((total, workspace) => total + dashboardWorkspaceSeats(workspace), 0);
    const sharedSeats = sharedWorkspaces.reduce((total, workspace) => total + dashboardWorkspaceSeats(workspace), 0);
    const occupiedSeatsFor = (rows) => rows.filter((workspace) => workspace.status === "occupied").reduce((total, workspace) => total + dashboardWorkspaceSeats(workspace), 0);
    const privateOccupied = occupiedSeatsFor(privateWorkspaces);
    const sharedOccupied = occupiedSeatsFor(sharedWorkspaces);
    const totalOccupied = privateOccupied + sharedOccupied;
    const privateMrr = privateWorkspaces.filter((workspace) => workspace.status === "occupied").reduce((total, workspace) => total + dashboardAmount(workspace.monthlyRent), 0);
    const sharedMrr = sharedWorkspaces.filter((workspace) => workspace.status === "occupied").reduce((total, workspace) => total + dashboardAmount(workspace.monthlyRent), 0);
    const privateAveragePrice = privateOccupied ? privateMrr / privateOccupied : 0;
    const sharedAveragePrice = sharedOccupied ? sharedMrr / sharedOccupied : 0;
    const averagePrice = totalOccupied ? (privateMrr + sharedMrr) / totalOccupied : 0;
    return {
      totalSeats,
      privateSeats,
      sharedSeats,
      privateOccupied,
      sharedOccupied,
      totalOccupied,
      privateAvailable: Math.max(0, privateSeats - privateOccupied),
      sharedAvailable: Math.max(0, sharedSeats - sharedOccupied),
      privateMrr,
      sharedMrr,
      totalMrr: privateMrr + sharedMrr,
      privateAveragePrice,
      sharedAveragePrice,
      averagePrice,
      opportunityLoss: Math.round(Math.max(0, privateSeats - privateOccupied) * privateAveragePrice + Math.max(0, sharedSeats - sharedOccupied) * sharedAveragePrice),
    };
  }, [workspaceRows]);

  const paymentRows = useMemo(() => [...invoiceRows]
    .sort((a, b) => {
      const statusOrder = { Overdue: 0, Grace: 0, "Due soon": 1, Paid: 2 };
      const statusDifference = (statusOrder[a.paymentStatus] ?? 3) - (statusOrder[b.paymentStatus] ?? 3);
      if (statusDifference) return statusDifference;
      return String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
    })
    .map((invoice) => ({
      account: invoice.account || "Unassigned",
      invoice: invoice.invoice || "—",
      status: displayDashboardPaymentStatus(invoice.paymentStatus),
      amount: formatDashboardAmount(invoice.amount),
    })), [invoiceRows]);

  const pendingApprovals = useMemo(() => approvalRows.filter((approval) => approval.status === "Pending").length, [approvalRows]);
  const activeMemberCount = useMemo(() => workspaceRows.filter((workspace) => workspace.status === "occupied").length, [workspaceRows]);

  if (!session) return <AppSkeleton />;

  const occupancyPercentage = spaceOccupancy.total ? Math.round((spaceOccupancy.occupied / spaceOccupancy.total) * 100) : 0;
  const availablePercentage = 100 - occupancyPercentage;

  return <PageShell><motion.div className="dashboard-content" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
    <div className="dashboard-main-grid">
      <div className="dashboard-main-column">
        <section className="dashboard-workspace-card">
          <div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">Portfolio overview</span><h2>Workspace inventory</h2><p>Live capacity, status and recurring revenue across mapped workspaces.</p></div><Link className="dashboard-view-link" href="/workspaces">Manage workspaces <ArrowUpRight size={14} /></Link></div>
          <div className="dashboard-workspace-table-wrap"><table className="dashboard-workspace-table"><thead><tr><th>Type</th><th>Seats</th><th>Status</th><th>MRR</th></tr></thead><tbody>{workspaceRows.map((workspace) => { const status = dashboardWorkspaceStatus(workspace); return <tr key={workspace.id}><td><strong>{workspace.label}</strong><small>{workspace.type}</small></td><td>{dashboardWorkspaceSeats(workspace)}</td><td><span className={`dashboard-status dashboard-status-${status}`}><i />{dashboardWorkspaceStatusLabel(status)}</span></td><td>{formatDashboardAmount(workspace.monthlyRent)}</td></tr>; })}</tbody></table>{!workspaceRows.length ? <div className="dashboard-table-empty">No mapped workspaces yet.</div> : null}</div>
        </section>
        <section className="dashboard-metric-grid">
          <div className="dashboard-metric-panel"><div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">Occupancy</span><h3>Overall occupancy</h3></div><strong>{dashboardMetrics.totalSeats ? Math.round((dashboardMetrics.totalOccupied / dashboardMetrics.totalSeats) * 100) : 0}%</strong></div><div className="dashboard-metric-row"><span>Shared seats occupancy</span><strong>{dashboardMetrics.sharedSeats ? Math.round((dashboardMetrics.sharedOccupied / dashboardMetrics.sharedSeats) * 100) : 0}%</strong></div><div className="dashboard-metric-row"><span>Private office occupancy</span><strong>{dashboardMetrics.privateSeats ? Math.round((dashboardMetrics.privateOccupied / dashboardMetrics.privateSeats) * 100) : 0}%</strong></div></div>
          <div className="dashboard-metric-panel"><span className="dashboard-eyebrow">Capacity</span><h3>Seat summary</h3><div className="dashboard-metric-row"><span>Total seats</span><strong>{dashboardMetrics.totalSeats}</strong></div><div className="dashboard-metric-row"><span>Private office seats occupied</span><strong>{dashboardMetrics.privateOccupied}</strong></div><div className="dashboard-metric-row"><span>Shared seats occupied</span><strong>{dashboardMetrics.sharedOccupied}</strong></div><div className="dashboard-metric-row dashboard-metric-row-emphasis"><span>Overall occupied seats</span><strong>{dashboardMetrics.totalOccupied}</strong></div></div>
          <div className="dashboard-metric-panel"><span className="dashboard-eyebrow">Sales capacity</span><h3>Seats to sell</h3><div className="dashboard-metric-row"><span>Private office seats</span><strong>{dashboardMetrics.privateAvailable}</strong></div><div className="dashboard-metric-row"><span>Shared seats</span><strong>{dashboardMetrics.sharedAvailable}</strong></div><div className="dashboard-metric-row dashboard-metric-row-emphasis"><span>Total available seats</span><strong>{dashboardMetrics.privateAvailable + dashboardMetrics.sharedAvailable}</strong></div></div>
          <div className="dashboard-metric-panel"><span className="dashboard-eyebrow">Pricing</span><h3>Average price</h3><div className="dashboard-metric-row"><span>Overall average price</span><strong>{formatDashboardAmount(dashboardMetrics.averagePrice)}</strong></div><div className="dashboard-metric-row"><span>Private office</span><strong>{formatDashboardAmount(dashboardMetrics.privateAveragePrice)}</strong></div><div className="dashboard-metric-row"><span>Shared seat</span><strong>{formatDashboardAmount(dashboardMetrics.sharedAveragePrice)}</strong></div></div>
          <div className="dashboard-metric-panel"><span className="dashboard-eyebrow">Revenue</span><h3>Monthly recurring revenue</h3><div className="dashboard-metric-row"><span>Private office MRR</span><strong>{formatDashboardAmount(dashboardMetrics.privateMrr)}</strong></div><div className="dashboard-metric-row"><span>Shared seats MRR</span><strong>{formatDashboardAmount(dashboardMetrics.sharedMrr)}</strong></div><div className="dashboard-metric-row dashboard-metric-row-emphasis"><span>Total MRR</span><strong>{formatDashboardAmount(dashboardMetrics.totalMrr)}</strong></div></div>
          <div className="dashboard-metric-panel dashboard-opportunity-panel"><span className="dashboard-eyebrow">Revenue opportunity</span><h3>Opportunity loss</h3><strong className="dashboard-opportunity-value">{formatDashboardAmount(dashboardMetrics.opportunityLoss)}</strong><p>Estimated monthly revenue from currently available capacity.</p></div>
        </section>

      <section className="dashboard-table-card">
        <div className="card-heading"><div><h2>Payment watchlist</h2></div></div>
        <DataTable className="dashboard-payment-data-table" columns={paymentColumns} data={paymentRows} onRowClick={() => router.push("/invoices")} emptyMessage="No payment records yet." />
      </section>
      </div>

      <div className="dashboard-side-column">
        <section className="dashboard-follow-up-card">
          <div className="card-heading"><div><h2>Follow ups today</h2><p className="muted-copy">Leads that need attention.</p></div><CalendarDays size={18} /></div>
          <div className="dashboard-follow-up-list">{sortedFollowUpRows.length ? sortedFollowUpRows.map((row) => <Link href="/leads" className={`dashboard-follow-up-item ${getDashboardFollowUpUrgencyClass(row.nextFollowUp, currentTime)}`} key={row.id || row.name}><strong>{row.name}</strong><small>{formatDashboardFollowUpAge(row.nextFollowUp, currentTime)}</small><ArrowUpRight size={14} /></Link>) : <div className="table-empty-state dashboard-follow-up-empty"><img src="/empty-state-illustration.png" alt="" /><strong>No follow-ups today</strong><span>Leads that need attention will appear here.</span></div>}</div>
        </section>
        <section className="dashboard-follow-up-card">
          <div className="card-heading"><div><h2>Visits today</h2><p className="muted-copy">Scheduled visits.</p></div><CalendarDays size={18} /></div>
          <div className="dashboard-follow-up-list">{sortedVisitRows.length ? sortedVisitRows.map((visit) => <Link href="/visits" className={`dashboard-follow-up-item ${getDashboardVisitUrgencyClass(visit, currentTime)}`} key={visit.id}><strong>{visit.visitor}</strong><small>{formatDashboardVisitTime(visit.time)} · {formatDashboardVisitAge(visit, currentTime)} · {visit.host || "Only me"}</small><ArrowUpRight size={14} /></Link>) : <div className="table-empty-state dashboard-follow-up-empty"><img src="/empty-state-illustration.png" alt="" /><strong>No visits today</strong><span>Scheduled visits will appear here.</span></div>}</div>
        </section>
      </div>
    </div>
    <style jsx global>{`
      .dashboard-kpi-grid .stat-card {
        gap: 0;
      }

      .dashboard-kpi-grid .stat-card strong {
        margin-top: 12px !important;
      }

      .dashboard-follow-up-card {
        height: 100%;
        min-height: 0;
        align-self: stretch;
        overflow: hidden;
      }

      .dashboard-side-column {
        display: grid;
        min-width: 0;
        min-height: 0;
        grid-template-rows: repeat(2, minmax(0, 1fr));
        gap: 16px;
        align-self: stretch;
        margin-bottom: 12px;
      }

      .dashboard-side-column .dashboard-follow-up-card {
        margin-bottom: 0;
      }

      .dashboard-follow-up-card .card-heading h2 {
        font-size: 14px;
      }

      .dashboard-table-card .card-heading h2 {
        font-size: 14px;
      }

      .dashboard-follow-up-list {
        margin-top: 10px;
      }

      .dashboard-follow-up-item {
        gap: 1px 8px;
      }

      .dashboard-follow-up-card .card-heading .muted-copy {
        font-size: 10px;
      }

      .dashboard-follow-up-item {
        transition: background 180ms ease, color 180ms ease;
      }

      .dashboard-follow-up-item:hover {
        transform: none;
        background: var(--sb-panel-soft);
        box-shadow: none;
        color: var(--sb-text);
      }

      .dashboard-payment-table .dashboard-table-row {
        grid-template-columns: minmax(160px, 1.2fr) minmax(140px, 1fr) minmax(100px, .7fr) minmax(110px, .8fr);
      }

      .dashboard-payment-table {
        width: 100%;
        min-width: 0;
        scrollbar-width: none;
      }

      .dashboard-payment-table .dashboard-table-row {
        min-width: 620px;
        padding-top: 10px;
        padding-bottom: 10px;
      }

      .dashboard-payment-table::-webkit-scrollbar {
        display: none;
      }

      .dashboard-payment-table .dashboard-table-row:not(.dashboard-table-head) {
        transition: background 180ms ease, color 180ms ease;
      }

      .dashboard-payment-table .dashboard-table-row:not(.dashboard-table-head):hover {
        transform: none;
        background: var(--sb-panel-soft);
        box-shadow: none;
        color: var(--sb-text);
      }

      .dashboard-payment-table .dashboard-table-row > span:nth-child(3) {
        justify-self: start;
        width: max-content;
        max-width: 100%;
        white-space: nowrap;
      }

      .dashboard-payment-table .dashboard-table-head {
        text-transform: none !important;
        color: #000 !important;
        font-weight: 550;
      }

      .dashboard-payment-table .dashboard-table-head > span {
        color: inherit;
        font-weight: 550;
      }

      html[data-theme="dark"] .dashboard-payment-table .dashboard-table-head,
      .dark .dashboard-payment-table .dashboard-table-head {
        color: #fff !important;
      }

      @media (max-width: 900px) {
        .dashboard-follow-up-card {
          height: 100%;
          min-height: 0;
        }
      }
    `}</style>
  </motion.div></PageShell>;
}
