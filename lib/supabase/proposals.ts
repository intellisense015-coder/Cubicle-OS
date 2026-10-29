import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SupabaseProposalRow = {
  id: string;
  proposal_number: string;
  lead_id: string | null;
  member_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  title: string;
  subtitle: string | null;
  issue_date: string;
  status: string;
  office: string | null;
  total_seats: number;
  price_per_seat: number | string;
  discount: number | string;
  monthly_membership: number | string;
  total_amount: number | string;
  selection: Record<string, unknown>;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

const proposalColumns = [
  "id",
  "proposal_number",
  "lead_id",
  "member_id",
  "recipient_name",
  "recipient_email",
  "recipient_phone",
  "title",
  "subtitle",
  "issue_date",
  "status",
  "office",
  "total_seats",
  "price_per_seat",
  "discount",
  "monthly_membership",
  "total_amount",
  "selection",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

function amount(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  return String(value || "").slice(0, 10);
}

function statusLabel(value: unknown) {
  const normalized = String(value || "draft").toLowerCase();
  if (normalized === "approved" || normalized === "accepted") return "Approved";
  if (normalized === "sent") return "Sent";
  if (normalized === "expired") return "Expired";
  return "Draft";
}

function statusValue(value: unknown) {
  const normalized = String(value || "Draft").trim().toLowerCase();
  return ["draft", "sent", "accepted", "approved", "expired"].includes(normalized) ? normalized : "draft";
}

function money(value: unknown) {
  return `PKR ${amount(value).toLocaleString("en-PK")}`;
}

export function mapSupabaseProposalToOsProposal(row: SupabaseProposalRow) {
  return {
    id: row.id,
    backend: "supabase",
    proposalNumber: row.proposal_number,
    leadId: row.lead_id || "",
    memberId: row.member_id || "",
    recipientEmail: row.recipient_email || "",
    recipientPhone: row.recipient_phone || "",
    account: row.recipient_name,
    date: dateValue(row.issue_date),
    title: row.title,
    subtitle: row.subtitle || "",
    status: statusLabel(row.status),
    office: row.office || "",
    totalSeats: String(row.total_seats || 1),
    pricePerSeat: String(amount(row.price_per_seat)),
    discount: String(amount(row.discount)),
    monthlyMembership: String(amount(row.monthly_membership)),
    total: money(row.total_amount),
    totalAmount: String(amount(row.total_amount)),
    selection: row.selection || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentUserId() {
  const { data } = await getSupabaseBrowserClient().auth.getUser();
  return data.user?.id || null;
}

async function nextProposalNumber() {
  const year = new Date().getFullYear();
  const prefix = `PROP-${year}-`;
  const { data, error } = await getSupabaseBrowserClient()
    .from("proposals")
    .select("proposal_number,created_at")
    .like("proposal_number", `${prefix}%`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const highest = (data || []).reduce((current, row) => {
    const value = Number(String(row.proposal_number || "").slice(prefix.length));
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 1000);
  return `${prefix}${highest + 1}`;
}

function isProposalNumberConflict(error: any) {
  return String(error?.code || "") === "23505" && String(error?.message || "").includes("proposals_proposal_number_key");
}

function suppliedProposalNumber(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized && normalized.toLowerCase() !== "generated on save" ? normalized : "";
}

function payload(input: any, userId: string, proposalNumber: string) {
  const totalSeats = Math.max(1, Math.floor(amount(input.totalSeats)));
  const pricePerSeat = amount(input.pricePerSeat);
  const discount = Math.min(Math.max(0, amount(input.discount)), totalSeats * pricePerSeat);
  return {
    proposal_number: proposalNumber,
    lead_id: input.leadId || null,
    member_id: input.memberId || null,
    recipient_name: String(input.recipientName || input.account || "").trim(),
    recipient_email: String(input.recipientEmail || "").trim().toLowerCase() || null,
    recipient_phone: String(input.recipientPhone || "").trim() || null,
    title: String(input.title || "").trim(),
    subtitle: String(input.subtitle || "").trim() || null,
    issue_date: dateValue(input.date) || new Date().toISOString().slice(0, 10),
    status: statusValue(input.status),
    office: String(input.office || "").trim() || null,
    total_seats: totalSeats,
    price_per_seat: pricePerSeat,
    discount,
    monthly_membership: amount(input.monthlyMembership),
    total_amount: Math.max(0, totalSeats * pricePerSeat - discount),
    selection: input.selection && typeof input.selection === "object" ? input.selection : {},
    updated_by: userId,
  };
}

export async function fetchSupabaseProposals() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("proposals")
    .select(proposalColumns)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => mapSupabaseProposalToOsProposal(row as unknown as SupabaseProposalRow));
}

export async function createSupabaseProposal(input: any) {
  const userId = await currentUserId();
  if (!userId) throw new Error("Your session has expired. Sign in again before creating a proposal.");

  let proposalNumber = suppliedProposalNumber(input.proposalNumber) || await nextProposalNumber();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await getSupabaseBrowserClient()
      .from("proposals")
      .insert({ ...payload(input, userId, proposalNumber), created_by: userId })
      .select(proposalColumns)
      .single();

    if (!error) return mapSupabaseProposalToOsProposal(data as unknown as SupabaseProposalRow);
    if (!isProposalNumberConflict(error) || attempt === 2) throw error;
    proposalNumber = await nextProposalNumber();
  }

  throw new Error("A unique proposal number could not be generated. Please try again.");
}

export async function updateSupabaseProposal(id: string, input: any) {
  const userId = await currentUserId();
  if (!userId) throw new Error("Your session has expired. Sign in again before updating a proposal.");

  const proposalNumber = String(input.proposalNumber || "").trim();
  const updatePayload = payload(input, userId, proposalNumber);
  delete updatePayload.proposal_number;

  const { data, error } = await getSupabaseBrowserClient()
    .from("proposals")
    .update(updatePayload)
    .eq("id", id)
    .select(proposalColumns)
    .single();

  if (error) throw error;
  return mapSupabaseProposalToOsProposal(data as unknown as SupabaseProposalRow);
}

export async function updateSupabaseProposalStatus(id: string, status: string) {
  const userId = await currentUserId();
  if (!userId) throw new Error("Your session has expired. Sign in again before updating a proposal.");

  const { data, error } = await getSupabaseBrowserClient()
    .from("proposals")
    .update({ status: statusValue(status), updated_by: userId })
    .eq("id", id)
    .select(proposalColumns)
    .single();

  if (error) throw error;
  return mapSupabaseProposalToOsProposal(data as unknown as SupabaseProposalRow);
}
