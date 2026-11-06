import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { calculateInvoiceTotals, parseAmount } from "@/lib/invoice-calculations";
import {
  checkRateLimits,
  rateLimitResponse,
  readJsonBody,
  recordSecurityAudit,
  requestBodyError,
} from "@/lib/server-security";

export const runtime = "nodejs";

const UUID = z.string().uuid();
const actionValues = [
  "company.create",
  "company.status",
  "lead.create",
  "lead.update",
  "lead.followup.update",
  "lead.journey.update",
  "member.create",
  "member.update",
  "visit.create",
  "visit.status",
  "maintenance.category.create",
  "maintenance.category.update",
  "maintenance.record.create",
  "maintenance.record.update",
  "maintenance.event.create",
  "workspace.create",
  "workspace.update",
  "workspace.assign",
  "quotation.create",
  "quotation.update",
  "quotation.status",
  "proposal.create",
  "proposal.update",
  "proposal.status",
  "invoice.create",
  "invoice.queueEmail",
  "admin.rolePermission",
  "admin.userPermission",
  "admin.update",
  "companyProfile.save",
] as const;

const mutationRequestSchema = z.object({
  action: z.enum(actionValues),
  payload: z.unknown(),
}).strict();

const companyColumns = "id,name,status,created_at,updated_at";
const leadColumns = "id,person_name,contact_number,email,team_size,shift,visit_date,visit_time,message,created_at,visited,workspace_option,os_stage";
const memberColumns = [
  "id", "lead_id", "member_name", "phone", "email", "company_name", "team", "assigned_space",
  "monthly_rent", "security_deposit", "billing_start_date", "due_day", "joined_date", "status",
  "membership_status", "notice_start_date", "expected_leaving_date", "notice_notes", "membership_periods",
  "contact_history", "created_at", "updated_at",
].join(",");
const visitColumns = [
  "id", "lead_id", "visitor_name", "company_name", "visit_date", "visit_time", "host", "purpose",
  "status", "notes", "created_by", "completed_at", "created_at", "updated_at",
].join(",");
const categoryColumns = "id,name,description,active,created_at,updated_at";
const maintenanceRecordColumns = [
  "id", "workspace_id", "status", "category", "severity", "title", "description", "reported_by", "reported_at",
  "assigned_to_id", "started_at", "resolved_by", "resolved_at", "cancellation_reason", "resolution_summary",
  "parts_used", "resolution_notes", "verified_ready_for_use", "created_at", "updated_at",
].join(",");
const maintenanceEventColumns = "id,maintenance_id,from_status,to_status,action,notes,actor_id,created_at";
const workspaceColumns = [
  "id", "floor_id", "label", "workspace_type", "kind", "zone", "capacity", "occupant", "company_name", "member_id",
  "monthly_rent", "billing_start_date", "due_day", "grace_period_days", "status", "membership_status",
  "notice_start_date", "expected_leaving_date", "notice_notes", "maintenance_category_id", "maintenance_status",
  "maintenance_reason", "operational_status", "active_maintenance_id", "created_at", "updated_at",
].join(",");
const quotationColumns = [
  "id", "quotation_number", "lead_id", "company_name", "customer_name", "customer_email", "customer_phone",
  "issue_date", "valid_until", "status", "subtotal", "wht_enabled", "wht_rate", "wht_amount", "sales_tax_enabled",
  "sales_tax_rate", "sales_tax_amount", "total_amount", "terms", "created_by", "updated_by", "created_at", "updated_at",
].join(",");
const quotationItemColumns = "id,quotation_id,description,quantity,unit_price,line_total,sort_order,created_at";
const proposalColumns = [
  "id", "proposal_number", "lead_id", "member_id", "recipient_name", "recipient_email", "recipient_phone", "title",
  "subtitle", "issue_date", "status", "office", "total_seats", "price_per_seat", "discount", "monthly_membership",
  "total_amount", "selection", "created_by", "updated_by", "created_at", "updated_at",
].join(",");
const invoiceColumns = [
  "id", "invoice_number", "member_id", "workspace_id", "account_name", "currency", "period_start", "period_end",
  "issue_date", "due_date", "billing_start_date", "due_day", "subtotal", "tax_enabled", "tax_rate", "tax_amount",
  "sales_tax_enabled", "sales_tax_rate", "sales_tax_amount", "total_amount", "payment_status", "email_status",
  "grace_until", "manual_date_override", "created_by", "created_at", "updated_at",
].join(",");
const legacyInvoiceColumns = [
  "id", "invoice_number", "member_id", "workspace_id", "account_name", "currency", "period_start", "period_end",
  "issue_date", "due_date", "billing_start_date", "due_day", "subtotal", "tax_enabled", "tax_rate", "tax_amount",
  "total_amount", "payment_status", "email_status", "grace_until", "manual_date_override", "created_by", "created_at", "updated_at",
].join(",");
const invoiceItemColumns = "id,invoice_id,description,quantity,unit_price,line_total,sort_order,created_at";

const workspaceOptionByLabel: Record<string, string> = {
  "private office": "private-office",
  "dedicated desk": "dedicated-desk",
  "enterprise solutions": "enterprise-solutions",
  "meeting room": "meeting-room",
  "event space": "event-space",
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase authentication configuration is incomplete.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function objectPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid mutation payload.");
  return value as Record<string, any>;
}

function text(value: unknown, max: number, required = false) {
  const result = String(value ?? "").trim();
  if (result.length > max || (required && !result)) throw new Error("Invalid mutation payload.");
  return result;
}

function optionalText(value: unknown, max: number) {
  const result = text(value, max);
  return result || null;
}

function uuid(value: unknown, required = true) {
  const result = text(value, 80);
  if (!result) {
    if (!required) return null;
    throw new Error("Invalid mutation payload.");
  }
  if (!UUID.safeParse(result).success) throw new Error("Invalid mutation payload.");
  return result;
}

// Workspace IDs are the stable floor-plan area keys (for example,
// `floor4-office02`), not UUIDs. Member, invoice, and maintenance references
// must preserve that text key when they point to a workspace.
function workspaceIdValue(value: unknown, required = false) {
  const result = optionalText(value, 160);
  if (!result && required) throw new Error("Invalid mutation payload.");
  return result;
}

function numeric(value: unknown, max = 1_000_000_000_000, integer = false) {
  const result = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(result) || result < 0 || result > max || (integer && !Number.isInteger(result))) {
    throw new Error("Invalid mutation payload.");
  }
  return result;
}

function dateValue(value: unknown, required = false) {
  const result = text(value, 10);
  if (!result && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error("Invalid mutation payload.");
  return result;
}

function emailValue(value: unknown, required = false) {
  const result = text(value, 320).toLowerCase();
  if (!result && !required) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error("Invalid mutation payload.");
  return result;
}

function normalizeWorkspaceOption(value: unknown) {
  const result = text(value, 80);
  if (!result) return null;
  const normalized = workspaceOptionByLabel[result.toLowerCase()];
  if (normalized) return normalized;
  if (Object.values(workspaceOptionByLabel).includes(result)) return result;
  throw new Error("Invalid mutation payload.");
}

const leadStageValues = new Set([
  "New lead",
  "Follow-up due",
  "Visit scheduled",
  "Visited",
  "Quotation requested",
  "Quote Sent",
  "Proposal Sent",
  "Proposal Approved",
  "Quotation Approved",
  "Agreement shared",
  "Converted",
  "Not interested",
]);

function normalizedLeadStage(value: unknown) {
  const result = text(value, 64, true);
  const normalized = result === "Closed lost" ? "Not interested" : result;
  if (!leadStageValues.has(normalized)) throw new Error("Invalid mutation payload.");
  return normalized;
}

function normalizedTime(value: unknown) {
  const result = text(value, 12);
  if (!result) return "";
  const match = result.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) throw new Error("Invalid mutation payload.");
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}:${match[3] || "00"}`;
}

function statusValue(value: unknown, allowed: string[]) {
  const result = text(value, 40).toLowerCase().replace(/\s+/g, "_");
  if (!allowed.includes(result)) throw new Error("Invalid mutation payload.");
  return result;
}

function optionalObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function optionalArray(value: unknown, max = 100) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid mutation payload.");
  return value;
}

function amount(value: unknown) {
  return numeric(value);
}

function dateOrDefault(value: unknown) {
  return dateValue(value) || new Date().toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return year && month ? `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}` : value;
}

function missingSalesTaxColumn(error: any) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("sales_tax_enabled") || message.includes("sales_tax_rate") || message.includes("sales_tax_amount");
}

function normalizedQuotationItems(value: unknown) {
  const items = optionalArray(value);
  return items.map((item: any, index) => {
    const description = text(item?.description, 240, true);
    const quantity = Math.max(1, numeric(item?.quantity || 1, 10_000));
    const unitPrice = amount(item?.amount ?? item?.price ?? item?.unit_price);
    return { description, quantity, unit_price: unitPrice, line_total: Math.round(unitPrice * quantity * 100) / 100, sort_order: index };
  });
}

function quotationPayload(input: any, actorUserId: string, quotationNumber: string) {
  const issueDate = dateOrDefault(input.date);
  return {
    quotation_number: quotationNumber,
    lead_id: uuid(input.leadId),
    company_name: optionalText(input.account, 160),
    customer_name: text(input.customerName || "Customer", 160, true),
    customer_email: emailValue(input.customerEmail),
    customer_phone: optionalText(input.customerPhone, 40),
    issue_date: issueDate,
    valid_until: dateValue(input.validUntil) || addDays(issueDate, 7),
    status: statusValue(input.status || "draft", ["draft", "sent", "accepted", "expired"]),
    subtotal: amount(input.subtotal),
    wht_enabled: Boolean(input.whtEnabled ?? input.taxEnabled),
    wht_rate: amount(input.whtRate ?? input.taxRate),
    wht_amount: amount(input.whtAmount ?? input.taxAmount),
    sales_tax_enabled: Boolean(input.salesTaxEnabled),
    sales_tax_rate: amount(input.salesTaxRate),
    sales_tax_amount: amount(input.salesTaxAmount),
    total_amount: amount(input.totalAmount ?? input.amount),
    terms: optionalText(input.terms, 5000),
    created_by: actorUserId,
    updated_by: actorUserId,
  };
}

function proposalStatus(value: unknown) {
  return statusValue(value || "draft", ["draft", "sent", "accepted", "approved", "expired"]);
}

function proposalPayload(input: any, actorUserId: string, proposalNumber: string) {
  const totalSeats = Math.max(1, Math.floor(amount(input.totalSeats || 1)));
  const pricePerSeat = amount(input.pricePerSeat);
  const discount = Math.min(amount(input.discount), totalSeats * pricePerSeat);
  return {
    proposal_number: proposalNumber,
    lead_id: uuid(input.leadId, false),
    member_id: uuid(input.memberId, false),
    recipient_name: text(input.recipientName || input.account, 160, true),
    recipient_email: emailValue(input.recipientEmail),
    recipient_phone: optionalText(input.recipientPhone, 40),
    title: text(input.title, 240, true),
    subtitle: optionalText(input.subtitle, 500),
    issue_date: dateOrDefault(input.date),
    status: proposalStatus(input.status),
    office: optionalText(input.office, 160),
    total_seats: totalSeats,
    price_per_seat: pricePerSeat,
    discount,
    monthly_membership: amount(input.monthlyMembership),
    total_amount: Math.max(0, totalSeats * pricePerSeat - discount),
    selection: optionalObject(input.selection),
    updated_by: actorUserId,
  };
}

function invoiceCreatePayload(input: any, actorUserId: string) {
  const issueDate = dateOrDefault(input.issueDate);
  const charges = Array.isArray(input.charges) && input.charges.length ? input.charges : [{ description: input.itemDescription || "Workspace monthly rent", amount: input.subtotal || input.amount }];
  const subtotal = parseAmount(input.subtotal || input.amount);
  const totals = calculateInvoiceTotals({
    subtotal,
    salesTaxEnabled: Boolean(input.salesTaxEnabled),
    salesTaxRate: input.salesTaxRate,
    whtEnabled: Boolean(input.whtEnabled ?? input.taxEnabled),
    whtRate: input.whtRate ?? input.taxRate,
  });
  return {
    invoice: text(input.invoice, 60, true),
    payload: {
      invoice_number: text(input.invoice, 60, true),
      member_id: uuid(input.memberId),
      workspace_id: workspaceIdValue(input.workspaceId),
      account_name: text(input.account, 200, true),
      period_start: `${issueDate.slice(0, 7)}-01`,
      period_end: lastDayOfMonth(`${issueDate.slice(0, 7)}-01`),
      issue_date: issueDate,
      due_date: dateValue(input.dueDate, true),
      billing_start_date: dateValue(input.billingStartDate),
      due_day: Math.min(31, Math.max(1, Math.floor(numeric(input.dueDay || 5, 31, true)))),
      subtotal: totals.subtotal,
      tax_enabled: Boolean(input.whtEnabled ?? input.taxEnabled) && totals.whtAmount > 0,
      tax_rate: totals.whtRate,
      tax_amount: totals.whtAmount,
      sales_tax_enabled: Boolean(input.salesTaxEnabled) && totals.salesTaxAmount > 0,
      sales_tax_rate: totals.salesTaxRate,
      sales_tax_amount: totals.salesTaxAmount,
      total_amount: totals.total,
      payment_status: statusValue(input.paymentStatus || "due_soon", ["due_soon", "grace", "overdue", "paid", "cancelled", "draft"]),
      email_status: "not_sent",
      grace_until: dateValue(input.graceUntil),
      manual_date_override: input.manualDateOverride === true,
      created_by: actorUserId,
    },
    items: charges.map((item: any, index) => ({
      description: text(item?.description || "Charge", 240, true),
      quantity: Math.max(1, numeric(item?.quantity || 1, 10_000)),
      unit_price: amount(item?.amount ?? item?.price),
      sort_order: index,
    })),
    totals,
  };
}

async function nextNumber(client: SupabaseClient, table: "quotations" | "proposals", column: string, prefix: string) {
  const { data, error } = await client.from(table).select(`${column},created_at`).like(column, `${prefix}%`).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  const highest = (data || []).reduce((current: number, row: any) => {
    const value = Number(String(row[column] || "").slice(prefix.length));
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 1000);
  return `${prefix}${highest + 1}`;
}

function permissionFor(action: string) {
  if (action.startsWith("admin.")) return "admin_users.manage";
  if (action.startsWith("companyProfile.")) return "settings.read";
  if (action.startsWith("company.")) return "companies.write";
  if (action === "lead.followup.update") return "leads.followups.write";
  if (action === "lead.journey.update") return "leads.journey.write";
  if (action.startsWith("lead.")) return "leads.write";
  if (action.startsWith("member.")) return "members.write";
  if (action.startsWith("visit.")) return "visits.write";
  if (action.startsWith("workspace.")) return "workspaces.write";
  if (action.startsWith("maintenance.category.")) return "maintenance_categories.write";
  if (action.startsWith("quotation.")) return "quotations.write";
  if (action.startsWith("proposal.")) return "proposals.write";
  if (action === "invoice.queueEmail") return "invoices.write";
  if (action === "invoice.create") return "invoices.write";
  // Maintenance record/event authorization remains with the existing RLS and
  // role-aware policies because front desk/staff reporting is intentionally
  // different from workspace configuration permission.
  return null;
}

function entityTypeFor(action: string) {
  if (action.startsWith("companyProfile.")) return "company_profile";
  return action.split(".")[0].replace("maintenance", "maintenance");
}

function entityIdFor(payload: unknown) {
  const value = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as any) : {};
  const candidate = value.id || value.invoiceId || value.memberId || value.workspaceId || value.maintenanceId || null;
  return typeof candidate === "string" && UUID.safeParse(candidate).success ? candidate : null;
}

function safeDatabaseMessage(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  if (error instanceof MutationConflictError) return error.message;
  if (code === "23514" && message.includes("active maintenance ticket")) return "This category cannot be deactivated while it has an active maintenance ticket.";
  if (code === "23505" && message.includes("members_email_unique_idx")) return "A member with this email already exists.";
  if (code === "23505") return "That record already exists.";
  if (code === "PGRST202") return "The opportunity-loss feature is not configured yet.";
  if (code === "42501") return "You are not allowed to perform this action.";
  return "The requested change could not be saved.";
}

class MutationConflictError extends Error {
  status = 409;
}

function sameMemberCreate(existing: any, input: Record<string, any>) {
  const sameText = (left: unknown, right: unknown) => String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
  const sameDate = (left: unknown, right: unknown) => String(left ?? "") === String(right ?? "");
  const sameNumber = (left: unknown, right: unknown) => Number(left ?? 0) === Number(right ?? 0);

  return sameText(existing.email, input.email)
    && sameText(existing.member_name, input.member_name)
    && sameText(existing.phone, input.phone)
    && sameText(existing.company_name, input.company_name)
    && sameText(existing.team, input.team)
    && String(existing.lead_id || "") === String(input.lead_id || "")
    && sameNumber(existing.monthly_rent, input.monthly_rent)
    && sameNumber(existing.security_deposit, input.security_deposit)
    && sameDate(existing.billing_start_date, input.billing_start_date)
    && Number(existing.due_day || 0) === Number(input.due_day || 0)
    && sameDate(existing.joined_date, input.joined_date)
    && String(existing.status || "") === String(input.status || "")
    && String(existing.membership_status || "") === String(input.membership_status || "")
    && sameDate(existing.notice_start_date, input.notice_start_date)
    && sameDate(existing.expected_leaving_date, input.expected_leaving_date)
    && sameText(existing.notice_notes, input.notice_notes);
}

async function runMutation(action: string, rawPayload: unknown, client: SupabaseClient, actorUserId: string, requiredPermission: string | null = null) {
  const payload = objectPayload(rawPayload);

  if (action === "company.create") {
    const name = text(payload.name, 160, true);
    const { data, error } = await client.from("companies").insert({ name, status: "active" }).select(companyColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "company.status") {
    const id = uuid(payload.id);
    const status = statusValue(payload.status, ["active", "inactive"]);
    const { data, error } = await client.from("companies").update({ status }).eq("id", id).select(companyColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "lead.create") {
    const teamMatch = text(payload.team, 40, true).match(/\d+/);
    const teamSize = teamMatch ? Number(teamMatch[0]) : 0;
    if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 10_000) throw new Error("Invalid mutation payload.");
    const { data, error } = await client.from("leads").insert({
      person_name: text(payload.name, 160, true),
      contact_number: text(payload.phone, 40, true),
      email: emailValue(payload.email, true),
      team_size: teamSize,
      shift: text(payload.shift, 80) || "Flexible",
      workspace_option: normalizeWorkspaceOption(payload.workspace),
      os_stage: "New lead",
    }).select(leadColumns).single();
    if (error) throw error;
    return data;
  }
  if (["lead.update", "lead.followup.update", "lead.journey.update"].includes(action)) {
    const id = uuid(payload.id);
    const updateEmail = payload.email !== undefined;
    const updatePhone = payload.phone !== undefined;
    const email = updateEmail ? emailValue(payload.email, true) : null;
    const phone = updatePhone ? text(payload.phone, 40, true) : null;
    const updateWorkspace = payload.workspace !== undefined;
    const updateVisited = payload.visited !== undefined;
    const updateVisitDate = payload.visitDate !== undefined;
    const updateVisitTime = payload.visitTime !== undefined;
    const workspaceOption = updateWorkspace ? normalizeWorkspaceOption(payload.workspace) : null;
    let visited: boolean | null = null;
    if (updateVisited) {
      if (typeof payload.visited !== "boolean") throw new Error("Invalid mutation payload.");
      visited = payload.visited;
    }
    const visitDate = updateVisitDate ? dateValue(payload.visitDate) : null;
    const visitTime = updateVisitTime ? (payload.visitTime ? normalizedTime(payload.visitTime) : null) : null;
    const requestedStage = payload.stage === undefined ? null : normalizedLeadStage(payload.stage);
    const lostReason = requestedStage === "Not interested" ? text(payload.lostReason, 240, true) : null;
    const lostMonthlyValue = requestedStage === "Not interested" ? numeric(payload.lostMonthlyValue, 1_000_000_000_000) : null;
    if (requestedStage === "Not interested" && lostMonthlyValue <= 0) throw new Error("Invalid mutation payload.");
    if (!updateEmail && !updatePhone && !updateWorkspace && !updateVisited && !updateVisitDate && !updateVisitTime && requestedStage === null) throw new Error("Invalid mutation payload.");

    const { data, error } = await client.rpc("os_update_lead", {
      p_id: id,
      p_workspace_option: workspaceOption,
      p_update_workspace: updateWorkspace,
      p_visited: visited,
      p_update_visited: updateVisited,
      p_visit_date: visitDate,
      p_update_visit_date: updateVisitDate,
      p_visit_time: visitTime,
      p_update_visit_time: updateVisitTime,
      p_stage: requestedStage,
      p_lost_reason: lostReason,
      p_lost_monthly_value: lostMonthlyValue,
      p_permission_key: requiredPermission || "leads.write",
      p_email: email,
      p_contact_number: phone,
    });
    if (error) throw error;
    return data;
  }
  if (action === "member.create" || action === "member.update") {
    const id = action.endsWith("update") ? uuid(payload.id) : null;
    const input = objectPayload(payload.input);
    const memberInput = {
      lead_id: uuid(input.lead_id, false),
      member_name: text(input.member_name, 160, true),
      phone: optionalText(input.phone, 40),
      email: emailValue(input.email),
      company_name: optionalText(input.company_name, 160),
      team: optionalText(input.team, 120),
      assigned_space: optionalText(input.assigned_space, 160),
      monthly_rent: numeric(input.monthly_rent),
      security_deposit: numeric(input.security_deposit),
      billing_start_date: dateValue(input.billing_start_date, true),
      due_day: Math.min(31, Math.max(1, Math.floor(numeric(input.due_day || 5, 31, true)))),
      joined_date: dateValue(input.joined_date, true),
      status: statusValue(input.status || "active", ["active", "inactive"]),
      membership_status: statusValue(input.membership_status || "active", ["active", "notice_period"]),
      notice_start_date: dateValue(input.notice_start_date),
      expected_leaving_date: dateValue(input.expected_leaving_date),
      notice_notes: optionalText(input.notice_notes, 2000),
      membership_periods: optionalArray(input.membership_periods, 100),
      contact_history: optionalObject(input.contact_history),
    };
    if (action.endsWith("create")) {
      const { data, error } = await client.from("members").insert({ ...memberInput, created_by: actorUserId, updated_by: actorUserId }).select(memberColumns).single();
      if (error) {
        // A double-click, network retry, or concurrent identical request can
        // legitimately reach the unique email constraint after the first
        // request has already committed. Return that exact row so the client
        // can finish the workspace assignment instead of showing a false
        // "not saved" error. A different member using the email remains a
        // real conflict.
        if (error.code === "23505" && memberInput.email) {
          const { data: existing, error: lookupError } = await client
            .from("members")
            .select(memberColumns)
            .eq("email", memberInput.email)
            .maybeSingle();
          if (lookupError) throw lookupError;
          if (existing && sameMemberCreate(existing, memberInput)) return existing;
          throw new MutationConflictError("A member with this email already exists.");
        }
        throw error;
      }
      return data;
    }
    const { data, error } = await client.from("members").update({ ...memberInput, updated_by: actorUserId }).eq("id", id).select(memberColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "visit.create") {
    const { data, error } = await client.from("visits").insert({
      lead_id: uuid(payload.leadId),
      visitor_name: text(payload.visitor, 160, true),
      company_name: optionalText(payload.company, 160),
      visit_date: dateValue(payload.date, true),
      visit_time: normalizedTime(payload.time),
      host: text(payload.host, 160, true),
      purpose: text(payload.purpose, 500, true),
      status: "Scheduled",
      notes: optionalText(payload.notes, 2000),
      created_by: actorUserId,
    }).select(visitColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "visit.status") {
    const id = uuid(payload.id);
    const status = statusValue(payload.status, ["scheduled", "completed", "cancelled", "no-show"]);
    const { data, error } = await client.from("visits").update({ status: status === "no_show" ? "No-show" : status[0].toUpperCase() + status.slice(1), completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id).select(visitColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "maintenance.category.create" || action === "maintenance.category.update") {
    const name = text(payload.name, 160, true);
    const description = optionalText(payload.description, 500);
    if (action.endsWith("create")) {
      const { data, error } = await client.from("maintenance_categories").insert({ name, description: description || "Available for maintenance requests", active: true }).select(categoryColumns).single();
      if (error) throw error;
      return data;
    }
    const id = uuid(payload.id);
    if (typeof payload.active !== "boolean") throw new Error("Invalid mutation payload.");
    const { data, error } = await client.from("maintenance_categories").update({ name, description, active: payload.active, updated_at: new Date().toISOString() }).eq("id", id).select(categoryColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "maintenance.record.create" || action === "maintenance.record.update") {
    const record = objectPayload(payload.record);
    const recordInput = {
      workspace_id: workspaceIdValue(record.workspaceId, true),
      status: statusValue(record.status, ["open", "in_progress", "resolved", "cancelled"]).toUpperCase(),
      category: text(record.category || "Uncategorized", 160, true),
      severity: statusValue(record.severity, ["low", "medium", "high", "critical"]).toUpperCase(),
      title: text(record.title || "Maintenance issue", 240, true),
      description: text(record.description, 5000),
      assigned_to_id: uuid(record.assignedToId, false),
      started_at: record.startedAt ? new Date(String(record.startedAt)).toISOString() : null,
      resolved_by: record.status === "RESOLVED" ? actorUserId : null,
      resolved_at: record.resolvedAt ? new Date(String(record.resolvedAt)).toISOString() : null,
      cancellation_reason: optionalText(record.cancellationReason, 2000),
      resolution_summary: optionalText(record.resolutionSummary, 5000),
      parts_used: optionalText(record.partsUsed, 2000),
      resolution_notes: optionalText(record.resolutionNotes, 5000),
      verified_ready_for_use: record.verifiedReadyForUse === true,
      updated_at: new Date().toISOString(),
    };
    if (action.endsWith("create")) {
      const { data, error } = await client.from("maintenance_records").insert({ ...recordInput, reported_by: actorUserId, reported_at: new Date().toISOString() }).select(maintenanceRecordColumns).single();
      if (error) throw error;
      return data;
    }
    const id = uuid(payload.id || record.id);
    const { data, error } = await client.from("maintenance_records").update(recordInput).eq("id", id).select(maintenanceRecordColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "maintenance.event.create") {
    const event = objectPayload(payload.event);
    const maintenanceId = uuid(payload.maintenanceId);
    const { data, error } = await client.from("maintenance_events").insert({
      maintenance_id: maintenanceId,
      from_status: optionalText(event.fromStatus, 40),
      to_status: text(event.toStatus, 40, true),
      action: text(event.action, 160, true),
      notes: optionalText(event.notes, 2000),
      actor_id: actorUserId,
    }).select(maintenanceEventColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "workspace.create" || action === "workspace.update") {
    const normalizeWorkspace = (value: any) => {
      const result = {
        id: text(value.id, 160, true),
        floor_id: text(value.floor_id || "floor-4", 160, true),
        label: text(value.label, 160, true),
        workspace_type: text(value.workspace_type, 120, true),
        kind: text(value.kind, 80, true),
        zone: text(value.zone, 160, true),
        capacity: value.capacity === "" || value.capacity == null ? null : numeric(value.capacity, 100_000, true),
        occupant: text(value.occupant || "Available", 160),
        company_name: text(value.company_name || "Unassigned", 160),
        member_id: uuid(value.member_id, false),
        monthly_rent: numeric(value.monthly_rent),
        billing_start_date: dateValue(value.billing_start_date),
        due_day: Math.min(31, Math.max(1, Math.floor(numeric(value.due_day || 5, 31, true)))),
        grace_period_days: Math.min(365, Math.max(0, Math.floor(numeric(value.grace_period_days || 3, 365, true)))),
        status: statusValue(value.status || "available", ["available", "occupied", "reserved", "maintenance"]),
        membership_status: statusValue(value.membership_status || "active", ["active", "notice_period"]),
        notice_start_date: dateValue(value.notice_start_date),
        expected_leaving_date: dateValue(value.expected_leaving_date),
        notice_notes: optionalText(value.notice_notes, 2000),
        maintenance_category_id: uuid(value.maintenance_category_id, false),
        maintenance_status: statusValue(value.maintenance_status || "deactivated", ["active", "locked", "blocked", "deactivated"]),
        maintenance_reason: optionalText(value.maintenance_reason, 2000),
        operational_status: text(value.operational_status || "ACTIVE", 40),
        active_maintenance_id: uuid(value.active_maintenance_id, false),
      };
      if (!["ACTIVE", "UNDER_MAINTENANCE", "OUT_OF_SERVICE"].includes(result.operational_status)) throw new Error("Invalid mutation payload.");
      return result;
    };
    if (action.endsWith("create")) {
      const records = optionalArray(payload.workspaces, 500).map(normalizeWorkspace);
      if (!records.length) return [];
      const { data, error } = await client.from("workspaces").insert(records.map((record) => ({ ...record, created_by: actorUserId, updated_by: actorUserId }))).select(workspaceColumns);
      if (error) throw error;
      return data || [];
    }
    const id = workspaceIdValue(payload.id, true);
    const input = normalizeWorkspace({ ...objectPayload(payload.input), id });
    const { data, error } = await client.from("workspaces").update({ ...input, updated_by: actorUserId }).eq("id", id).select(workspaceColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "workspace.assign") {
    const memberId = uuid(payload.memberId);
    const workspaceId = workspaceIdValue(payload.workspaceId);
    const { error: rpcError } = await client.rpc("assign_member_to_workspace", { p_member_id: memberId, p_workspace_id: workspaceId });
    if (!rpcError) return { assigned: true };

    // Keep compatibility with older production databases whose assignment RPC
    // has the historical duplicate-column bug. This fallback stays under the
    // caller's RLS identity and stamps every touched row with the actor.
    const rpcMessage = String(rpcError.message || "").toLowerCase();
    if (!rpcMessage.includes("multiple assignments") || !rpcMessage.includes("notice_start_date")) throw rpcError;
    const { data: member, error: memberError } = await client
      .from("members")
      .select("member_name,company_name,monthly_rent,billing_start_date,due_day,status,membership_status,notice_start_date,expected_leaving_date,notice_notes")
      .eq("id", memberId)
      .single();
    if (memberError) throw memberError;

    const clearAssignment = {
      member_id: null,
      occupant: "Available",
      company_name: "Unassigned",
      status: "available",
      membership_status: "active",
      notice_start_date: null,
      expected_leaving_date: null,
      notice_notes: null,
      updated_by: actorUserId,
    };
    let clearQuery = client.from("workspaces").update(clearAssignment).eq("member_id", memberId);
    if (workspaceId) clearQuery = clearQuery.neq("id", workspaceId);
    const { error: clearError } = await clearQuery;
    if (clearError) throw clearError;

    let staleOccupantQuery = client.from("workspaces").update(clearAssignment).eq("occupant", member.member_name);
    if (workspaceId) staleOccupantQuery = staleOccupantQuery.neq("id", workspaceId);
    const { error: staleOccupantError } = await staleOccupantQuery;
    if (staleOccupantError) throw staleOccupantError;

    if (workspaceId) {
      const { error: assignError } = await client.from("workspaces").update({
        member_id: memberId,
        occupant: member.member_name,
        company_name: member.company_name || "Unassigned",
        monthly_rent: member.monthly_rent,
        billing_start_date: member.billing_start_date,
        due_day: Number(member.due_day) || 5,
        status: member.status === "active" ? "occupied" : "available",
        membership_status: member.membership_status || "active",
        notice_start_date: member.notice_start_date,
        expected_leaving_date: member.expected_leaving_date,
        notice_notes: member.notice_notes,
        updated_by: actorUserId,
      }).eq("id", workspaceId);
      if (assignError) throw assignError;
    }

    const { error: memberAssignmentError } = await client
      .from("members")
      .update({ assigned_space: workspaceId, updated_by: actorUserId })
      .eq("id", memberId);
    if (memberAssignmentError) throw memberAssignmentError;
    return { assigned: true };
  }
  if (action === "quotation.create" || action === "quotation.update" || action === "quotation.status") {
    if (action === "quotation.status") {
      const id = uuid(payload.id);
      const status = statusValue(payload.status, ["draft", "sent", "accepted", "expired"]);
      const { data, error } = await client.from("quotations").update({ status, updated_by: actorUserId }).eq("id", id).select(quotationColumns).single();
      if (error) throw error;
      const { data: items, error: itemsError } = await client.from("quotation_items").select(quotationItemColumns).eq("quotation_id", id).order("sort_order");
      if (itemsError) throw itemsError;
      return { row: data, items: items || [] };
    }
    const input = objectPayload(payload.input);
    const items = normalizedQuotationItems(input.items || input.charges);
    let quotationNumber = text(input.quotationNumber, 60);
    if (!quotationNumber) quotationNumber = await nextNumber(client, "quotations", "quotation_number", `QUO-${new Date().getFullYear()}-`);
    const insertPayload = quotationPayload(input, actorUserId, quotationNumber);
    if (action === "quotation.create") {
      const { data, error } = await client.from("quotations").insert(insertPayload).select(quotationColumns).single();
      if (error) throw error;
      const quotationId = (data as unknown as { id: string }).id;
      const { data: itemRows, error: itemError } = await client.from("quotation_items").insert(items.map((item) => ({ ...item, quotation_id: quotationId }))).select(quotationItemColumns);
      if (itemError) throw itemError;
      return { row: data, items: itemRows || [] };
    }
    const id = uuid(payload.id);
    const updatePayload = { ...insertPayload } as Record<string, unknown>;
    delete updatePayload.quotation_number;
    delete updatePayload.created_by;
    // Updating a quotation replaces its line items. Use the server-side client
    // for this replacement after the permission check above so RLS cannot
    // silently leave the old items in place and cause duplicates on re-save.
    const quotationWriteClient = serviceClient();
    const { data, error } = await quotationWriteClient.from("quotations").update(updatePayload).eq("id", id).select(quotationColumns).single();
    if (error) throw error;
    const { error: deleteError } = await quotationWriteClient.from("quotation_items").delete().eq("quotation_id", id);
    if (deleteError) throw deleteError;
    const { data: itemRows, error: itemError } = await quotationWriteClient.from("quotation_items").insert(items.map((item) => ({ ...item, quotation_id: id }))).select(quotationItemColumns);
    if (itemError) throw itemError;
    return { row: data, items: itemRows || [] };
  }
  if (action === "proposal.create" || action === "proposal.update" || action === "proposal.status") {
    if (action === "proposal.status") {
      const id = uuid(payload.id);
      const status = proposalStatus(payload.status);
      const { data, error } = await client.from("proposals").update({ status, updated_by: actorUserId }).eq("id", id).select(proposalColumns).single();
      if (error) throw error;
      return data;
    }
    const input = objectPayload(payload.input);
    let proposalNumber = text(input.proposalNumber, 60);
    if (!proposalNumber) proposalNumber = await nextNumber(client, "proposals", "proposal_number", `PROP-${new Date().getFullYear()}-`);
    const proposalInput = proposalPayload(input, actorUserId, proposalNumber);
    if (action === "proposal.create") {
      const { data, error } = await client.from("proposals").insert({ ...proposalInput, created_by: actorUserId }).select(proposalColumns).single();
      if (error) throw error;
      return data;
    }
    const id = uuid(payload.id);
    const updatePayload = { ...proposalInput } as Record<string, unknown>;
    delete updatePayload.proposal_number;
    const { data, error } = await client.from("proposals").update(updatePayload).eq("id", id).select(proposalColumns).single();
    if (error) throw error;
    return data;
  }
  if (action === "invoice.create") {
    const input = objectPayload(payload.input);
    const built = invoiceCreatePayload(input, actorUserId);
    let { data, error } = await client.from("invoices").insert(built.payload).select(invoiceColumns).single();
    if (error && missingSalesTaxColumn(error)) {
      const { sales_tax_enabled: _enabled, sales_tax_rate: _rate, sales_tax_amount: _amount, ...legacyPayload } = built.payload;
      const legacyResult = await client.from("invoices").insert(legacyPayload).select(legacyInvoiceColumns).single();
      data = legacyResult.data;
      error = legacyResult.error;
    }
    if (error) throw error;
    const invoiceId = (data as unknown as { id: string }).id;
    const { data: items, error: itemsError } = await client.from("invoice_items").insert(built.items.map((item) => ({ ...item, invoice_id: invoiceId }))).select(invoiceItemColumns);
    if (itemsError) throw itemsError;
    return { row: data, items: items || [], totals: built.totals };
  }
  if (action === "invoice.queueEmail") {
    const invoiceId = uuid(payload.invoiceId);
    const deliveryKind = text(payload.deliveryKind || "initial", 40);
    if (!["initial", "reminder", "overdue"].includes(deliveryKind)) throw new Error("Invalid mutation payload.");
    const { data, error } = await client.rpc("queue_invoice_email", { p_invoice_id: invoiceId, p_delivery_kind: deliveryKind });
    if (error) throw error;
    return data;
  }
  if (action === "admin.rolePermission") {
    const roleKey = text(payload.roleKey, 64, true);
    const permissionKey = text(payload.permissionKey, 120, true);
    if (typeof payload.granted !== "boolean") throw new Error("Invalid mutation payload.");
    const { error } = await client.rpc("set_admin_role_permission", { p_role_key: roleKey, p_permission_key: permissionKey, p_granted: payload.granted });
    if (error) throw error;
    return { updated: true };
  }
  if (action === "admin.userPermission") {
    const userId = uuid(payload.userId);
    const permissionKey = text(payload.permissionKey, 120, true);
    if (typeof payload.granted !== "boolean") throw new Error("Invalid mutation payload.");
    const { error } = await client.rpc("set_admin_user_permission", { p_user_id: userId, p_permission_key: permissionKey, p_granted: payload.granted });
    if (error) throw error;
    return { updated: true };
  }
  if (action === "admin.update") {
    const userId = uuid(payload.userId);
    const role = text(payload.role, 64, true);
    if (typeof payload.active !== "boolean") throw new Error("Invalid mutation payload.");
    const { data, error } = await client.rpc("update_admin_user", { p_user_id: userId, p_role: role, p_active: payload.active });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("The administrator account could not be updated.");
    return row;
  }
  if (action === "companyProfile.save") {
    const companyName = text(payload.name, 160, true);
    const contactEmail = emailValue(payload.email, true);
    const ownerName = text(payload.ownerName, 120, true);
    const { data, error } = await client.from("os_company_profile").upsert({ id: 1, company_name: companyName, contact_email: contactEmail, owner_name: ownerName, updated_by: actorUserId, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("id,company_name,contact_email,owner_name,updated_by,updated_at").single();
    if (error) throw error;
    return data;
  }
  throw new Error("Unsupported mutation.");
}

export async function POST(request: Request) {
  let admin: ReturnType<typeof serviceClient> | null = null;
  let actorUserId = "";
  let action = "os.mutation";
  let entityId: string | null = null;

  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return errorResponse("Authentication is required.", 401);

    const body = await readJsonBody(request, 128 * 1024);
    if (!body.ok) {
      const status = "status" in body ? body.status : 400;
      return errorResponse(requestBodyError(status), status);
    }
    const parsed = mutationRequestSchema.safeParse(body.value);
    if (!parsed.success) return errorResponse("Invalid mutation request.", 400);
    action = parsed.data.action;
    entityId = entityIdFor(parsed.data.payload);

    const userClient = authClient(token);
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return errorResponse("Your session is invalid or expired.", 401);
    actorUserId = userData.user.id;

    const permission = permissionFor(action);
    if (permission) {
      const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", { p_permission_key: permission });
      if (permissionError || allowed !== true) {
        admin = serviceClient();
        await recordSecurityAudit(admin, { action, outcome: "denied", actorUserId, entityType: entityTypeFor(action), entityId, request, metadata: { permission } });
        return errorResponse("You are not allowed to perform this action.", 403);
      }
    }

    if (action.startsWith("companyProfile.")) {
      const { data: role, error: roleError } = await userClient.rpc("get_my_admin_role");
      if (roleError || String(role || "").trim().toLowerCase() !== "owner") {
        admin = serviceClient();
        await recordSecurityAudit(admin, { action, outcome: "denied", actorUserId, entityType: entityTypeFor(action), entityId, request, metadata: { reason: "owner_only_company_settings" } });
        return errorResponse("You are not allowed to perform this action.", 403);
      }
    }

    admin = serviceClient();
    const sensitive = action.startsWith("admin.") || action.startsWith("invoice.") || action.startsWith("quotation.") || action.startsWith("proposal.") || action === "companyProfile.save" || action.startsWith("lead.");
    const rateLimit = await checkRateLimits({
      client: admin,
      request,
      scope: `os.mutation.${action}`,
      userId: actorUserId,
      ipLimit: sensitive ? 30 : 120,
      userLimit: sensitive ? 20 : 60,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      await recordSecurityAudit(admin, { action, outcome: "rate_limited", actorUserId, entityType: entityTypeFor(action), entityId, request, metadata: { scope: `os.mutation.${action}` } });
      const response = rateLimitResponse(rateLimit);
      return NextResponse.json({ error: "Too many requests. Please try again later." }, response);
    }

    const data = await runMutation(action, parsed.data.payload, userClient, actorUserId, permission);
    await recordSecurityAudit(admin, { action, outcome: "success", actorUserId, entityType: entityTypeFor(action), entityId, request });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (admin && actorUserId) {
      await recordSecurityAudit(admin, { action, outcome: "failure", actorUserId, entityType: entityTypeFor(action), entityId, request, metadata: { reason: "mutation_failed" } });
    }
    console.error("OS mutation failed:", action, error);
    const errorCode = String((error as any)?.code || "");
    const errorStatus = Number((error as any)?.status || 0);
    return errorResponse(safeDatabaseMessage(error), errorStatus || (errorCode === "42501" ? 403 : errorCode === "23505" ? 409 : 400));
  }
}
