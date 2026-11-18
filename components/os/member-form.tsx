"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CirclePlus } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField, SelectField } from "@/components/ui/primitives";
import { WorkspaceBadge } from "@/components/ui/workspace-badge";
import { isAssignableWorkspace, workspaceHasCapacity } from "@/lib/workspace-records";
import { normalizeMembershipStatus } from "@/lib/member-lifecycle";
import { numericField, numericString } from "@/lib/number-input";

const memberSchema = z.object({
  leadId: z.string().optional(), member: z.string().trim().min(1, "Enter the member's name."), phone: z.string().optional(), email: z.string().optional(), cnic: z.string().optional(), gender: z.string().optional(), vehicleMake: z.string().optional(), vehicleModel: z.string().optional(), vehicleVariant: z.string().optional(), vehicleColor: z.string().optional(), vehicleLicensePlate: z.string().optional(), company: z.string().optional(), team: z.string().optional(), space: z.string().optional(), rent: z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid numeric rent."), deposit: z.string().optional().refine((value) => !value || /^\d+(\.\d+)?$/.test(value), "Enter a valid numeric deposit."), whtEnabled: z.boolean().optional(), whtRate: z.string().optional(), salesTaxEnabled: z.boolean().optional(), salesTaxRate: z.string().optional(), billingStartDate: z.string().min(1, "Choose a billing start date."), dueDay: z.string().regex(/^\d+$/, "Enter a whole-number due day.").refine((value) => Number(value) >= 1 && Number(value) <= 31, "Due day must be between 1 and 31."), joined: z.string().min(1, "Choose a joining date."), membershipStatus: z.enum(["Active", "Notice period"]), noticeStartDate: z.string().optional(), expectedLeavingDate: z.string().optional(), noticeNotes: z.string().optional(), reactivateMemberId: z.string().optional(),
}).superRefine((values, context) => {
  if (values.membershipStatus === "Notice period" && !values.noticeStartDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ["noticeStartDate"], message: "Choose the notice start date." });
  if (values.membershipStatus === "Notice period" && !values.expectedLeavingDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedLeavingDate"], message: "Choose the expected leaving date." });
});

function addOneMonth(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(year, month - 1, 1);
  next.setMonth(next.getMonth() + 1);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function MemberLeadSelect({ leads, value, onChange }) {
  const conversionLeads = leads.filter((lead) => ["Converted", "Quotation Approved", "Proposal Approved"].includes(String(lead.stage || "")));
  return <div className="lead-source-field"><SelectField label="Member from converted lead" value={value} onChange={(event) => onChange(event.target.value)} renderOption={(option) => { const lead = conversionLeads.find((item) => String(item.id) === option.value); if (!lead) return option.label; const company = String(lead.company || "").trim(); return <span className="member-lead-option"><strong>{lead.name}{company ? ` · ${company}` : ""}</strong>{lead.email ? <small>{lead.email}</small> : null}</span>; }}><option value="">Create manually</option>{conversionLeads.length ? conversionLeads.map((lead) => <option value={lead.id} key={lead.id}>{lead.name}</option>) : null}</SelectField></div>;
}

function findLeadQuotation(quotations, leadId) {
  const matches = quotations.filter((quotation) => String(quotation?.leadId || "") === String(leadId || ""));
  return matches.sort((left, right) => {
    const leftAccepted = String(left?.status || "").toLowerCase() === "accepted" ? 1 : 0;
    const rightAccepted = String(right?.status || "").toLowerCase() === "accepted" ? 1 : 0;
    if (leftAccepted !== rightAccepted) return rightAccepted - leftAccepted;
    return new Date(String(right?.updatedAt || right?.createdAt || "")).getTime() - new Date(String(left?.updatedAt || left?.createdAt || "")).getTime();
  })[0] || null;
}

function quotationSecurityDeposit(quotation) {
  const directDeposit = quotation?.securityDeposit ?? quotation?.deposit;
  if (directDeposit !== undefined && directDeposit !== null && String(directDeposit).trim() !== "") return numericString(directDeposit, "0");
  const lines = [...(Array.isArray(quotation?.charges) ? quotation.charges : []), ...(Array.isArray(quotation?.items) ? quotation.items : [])];
  const depositLine = lines.find((line) => /security\s*deposit|deposit/i.test(String(line?.description || line?.itemDescription || line?.name || "")));
  return numericString(depositLine?.amount ?? depositLine?.price ?? depositLine?.lineTotal ?? depositLine?.line_total, "0");
}

function MemberSpaceSelect({ spaces, members, value, onChange, currentMemberId = "", allowUnassigned = false, hint = "" }) {
  const allSpaces = spaces.filter((space) => isAssignableWorkspace(space));
  const isSelectable = (space) => workspaceHasCapacity(space, members, currentMemberId);
  return <div className="lead-source-field"><SelectField label="Assigned space" value={value} hint={hint} onChange={(event) => { const nextSpace = allSpaces.find((space) => space.id === event.target.value); onChange(event.target.value, nextSpace); }} renderOption={(option) => { const space = allSpaces.find((item) => item.id === option.value); return option.value ? <span className="member-space-option"><WorkspaceBadge value={space?.type || space?.label || String(option.label)} /><span>{space?.label || String(option.label)}{space?.zone ? ` · ${space.zone}` : ""}</span></span> : <span>{allowUnassigned ? "Unassigned" : "Select a workspace"}</span>; }}><option value="" disabled={!allowUnassigned}>{allowUnassigned ? "Unassigned" : "Select a workspace"}</option>{allSpaces.map((space) => <option value={space.id} disabled={!isSelectable(space)} key={space.id}>{space.label} · {space.zone}{space.status !== "available" ? " · Occupied" : ""}</option>)}</SelectField></div>;
}

export function MemberForm({ leads, companies, members, spaces, quotations = [], onCancel, onSave, initialMember = null, isInvoicedMember = true }) {
  const initialMembershipStatus = normalizeMembershipStatus(initialMember?.membershipStatus);
  const initialNoticeStartDate = initialMember?.noticeStartDate || (initialMembershipStatus === "Notice period" ? initialMember?.billingStartDate || initialMember?.joined || "" : "");
  const initialExpectedLeavingDate = initialMember?.expectedLeavingDate || (initialMembershipStatus === "Notice period" ? addOneMonth(initialNoticeStartDate) : "");
  const allowUnassigned = String(initialMember?.status || "Active").toLowerCase() === "inactive";
  const formApi = useForm({ resolver: zodResolver(memberSchema), defaultValues: { leadId: initialMember?.leadId || "", member: initialMember?.member || "", phone: initialMember?.phone || "", email: initialMember?.email || "", cnic: initialMember?.cnic || "", gender: initialMember?.gender || "", vehicleMake: initialMember?.vehicleMake || "", vehicleModel: initialMember?.vehicleModel || "", vehicleVariant: initialMember?.vehicleVariant || "", vehicleColor: initialMember?.vehicleColor || "", vehicleLicensePlate: initialMember?.vehicleLicensePlate || "", company: initialMember?.company || "", team: initialMember?.team || "", space: initialMember?.spaceId || "", rent: numericString(initialMember?.rent, "0"), deposit: numericString(initialMember?.deposit, "0"), whtEnabled: initialMember?.whtEnabled === true, whtRate: numericString(initialMember?.whtRate, "0"), salesTaxEnabled: initialMember?.salesTaxEnabled === true, salesTaxRate: numericString(initialMember?.salesTaxRate, "0"), joined: initialMember?.joined || "2026-10-05", billingStartDate: initialMember?.billingStartDate || initialMember?.joined || "2026-10-05", dueDay: numericString(initialMember?.dueDay, "5"), membershipStatus: initialMembershipStatus, noticeStartDate: initialNoticeStartDate, expectedLeavingDate: initialExpectedLeavingDate, noticeNotes: initialMember?.noticeNotes || "", reactivateMemberId: "" }, mode: "onBlur" });
  const { register, handleSubmit, setError, setValue, watch, formState } = formApi;
  const saveInFlightRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const error = (field) => formState.errors[field]?.message;
  const selectedLeadId = watch("leadId");
  const selectedLead = leads.find((item) => item.id === selectedLeadId);
  const leadSelected = !initialMember && Boolean(selectedLeadId);
  const showBillingFields = !initialMember || isInvoicedMember;
  const companyLocked = leadSelected && Boolean(String(selectedLead?.company || "").trim());
  const companyOptions = [...companies].sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
  const selectLead = (leadId) => { const lead = leads.find((item) => item.id === leadId); setValue("leadId", leadId, { shouldDirty: true, shouldValidate: true }); setValue("member", lead ? lead.name : "", { shouldDirty: true, shouldValidate: true }); setValue("company", lead ? lead.company || "" : "", { shouldDirty: true }); setValue("phone", lead ? lead.phone || "" : "", { shouldDirty: true }); setValue("email", lead ? lead.email || "" : "", { shouldDirty: true }); const quotation = lead ? findLeadQuotation(quotations, lead.id) : null; setValue("rent", quotation ? numericString(quotation.monthlyRent, "0") : "0", { shouldDirty: true, shouldValidate: true }); setValue("deposit", quotation ? quotationSecurityDeposit(quotation) : "0", { shouldDirty: true, shouldValidate: true }); setValue("whtEnabled", quotation?.whtEnabled === true, { shouldDirty: true }); setValue("whtRate", quotation ? numericString(quotation.whtRate, "0") : "0", { shouldDirty: true }); setValue("salesTaxEnabled", quotation?.salesTaxEnabled === true, { shouldDirty: true }); setValue("salesTaxRate", quotation ? numericString(quotation.salesTaxRate, "0") : "0", { shouldDirty: true }); };
  const onSubmit = async (values) => { if (!allowUnassigned && !values.space) { setError("space", { type: "manual", message: "Choose a workspace for active members." }); return; } if (saveInFlightRef.current) return; saveInFlightRef.current = true; setIsSaving(true); try { await onSave({ ...values, membershipStatus: normalizeMembershipStatus(values.membershipStatus), rent: numericString(values.rent, "0"), deposit: numericString(values.deposit, "0"), id: initialMember?.id || `member-${Date.now()}`, status: initialMember?.status || "Active", joined: values.joined, spaceId: values.space, space: spaces.find((item) => item.id === values.space)?.label || "Unassigned", dueDay: Number(values.dueDay) || 5, reactivateMemberId: "" }); } finally { saveInFlightRef.current = false; setIsSaving(false); } };
  const rent = Number(numericString(watch("rent"), "0")) || 0;
  const deposit = Number(numericString(watch("deposit"), "0")) || 0;
  return <div className="dialog-content member-form-card"><div className="card-heading"><div><h2>{initialMember ? "Edit member" : "Add member"}</h2><p className="muted-copy">Keep contact details, billing, and workspace assignment together.</p></div></div><form className="inline-form-grid member-form-grid" onSubmit={handleSubmit(onSubmit)}>{!initialMember ? <MemberLeadSelect leads={leads} value={watch("leadId")} onChange={selectLead} /> : null}<div className="member-form-section-heading"><h3>Contact details</h3></div><label className="settings-label">Member name<Input className={error("member") ? "has-error" : ""} {...register("member")} readOnly={leadSelected} aria-readonly={leadSelected} aria-invalid={Boolean(error("member"))} />{error("member") && <span className="lead-form-error">{error("member")}</span>}</label><label className="settings-label">Phone number<Input {...register("phone")} readOnly={leadSelected} aria-readonly={leadSelected} placeholder="0300 1234567" /></label><label className="settings-label">Email address<Input type="email" {...register("email")} readOnly={leadSelected} aria-readonly={leadSelected} placeholder="member@example.com" /></label><label className="settings-label">CNIC<Input {...register("cnic")} placeholder="35202-1234567-1" /></label><SelectField label="Gender" value={watch("gender")} onChange={(event) => setValue("gender", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option><option value="Prefer not to say">Prefer not to say</option></SelectField><div className="member-form-section-heading"><h3>Vehicle information</h3></div><label className="settings-label">Make<Input {...register("vehicleMake")} placeholder="Toyota" /></label><label className="settings-label">Model<Input {...register("vehicleModel")} placeholder="Corolla" /></label><label className="settings-label">Variant<Input {...register("vehicleVariant")} placeholder="GLi" /></label><label className="settings-label">Color <span className="muted-copy">(optional)</span><Input {...register("vehicleColor")} placeholder="White" /></label><label className="settings-label">Vehicle license plate<Input {...register("vehicleLicensePlate")} placeholder="ABC-123" /></label><SelectField label="Company" value={watch("company")} disabled={companyLocked} onChange={(event) => setValue("company", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Unassigned</option>{companyOptions.map((company) => <option value={company.name} key={company.id || company.name}>{company.name}</option>)}</SelectField><div className="member-form-section-heading"><h3>{showBillingFields ? "Workspace and billing" : "Workspace assignment"}</h3></div><MemberSpaceSelect spaces={spaces} members={members} value={watch("space")} currentMemberId={initialMember?.id} allowUnassigned={allowUnassigned} hint={error("space")} onChange={(value, space) => { setValue("space", value, { shouldDirty: true, shouldValidate: true }); if (!leadSelected && space?.monthlyRent && (!initialMember || value !== initialMember.spaceId)) setValue("rent", numericString(space.monthlyRent, "0"), { shouldDirty: true }); }} />{showBillingFields ? <><label className="settings-label">Monthly rent<Input className={error("rent") ? "has-error" : ""} {...numericField(register, "rent")} aria-invalid={Boolean(error("rent"))} />{error("rent") && <span className="lead-form-error">{error("rent")}</span>}</label><label className="settings-label">Security deposit<Input className={error("deposit") ? "has-error" : ""} {...numericField(register, "deposit")} placeholder="0" aria-invalid={Boolean(error("deposit"))} />{deposit > rent ? <span className="lead-form-warning">Security deposit is higher than monthly rent.</span> : null}{error("deposit") && <span className="lead-form-error">{error("deposit")}</span>}</label><div className="member-form-section-heading"><h3>Dates</h3></div><DatePickerField label="Billing start date" value={watch("billingStartDate")} hint={error("billingStartDate")} onChange={(value) => setValue("billingStartDate", value, { shouldDirty: true, shouldValidate: true })} /><DatePickerField label="Joining date" value={watch("joined")} hint={error("joined")} onChange={(value) => setValue("joined", value, { shouldDirty: true, shouldValidate: true })} /></> : null}<div className="inline-form-actions member-form-actions"><Button type="button" variant="danger" onClick={onCancel} disabled={isSaving}>Cancel</Button><Button type="submit" loading={isSaving} disabled={isSaving}><CirclePlus size={15} /> {initialMember ? "Save changes" : "Save member"}</Button></div></form></div>;
}
