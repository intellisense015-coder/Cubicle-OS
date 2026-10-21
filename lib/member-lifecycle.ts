export type MembershipPeriodStatus = "Active" | "Completed";
export type MembershipStatus = "Active" | "Notice period";
export const MEMBERSHIP_STATUS_OPTIONS: MembershipStatus[] = ["Active", "Notice period"];

export function normalizeMembershipStatus(value: unknown): MembershipStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (["notice period", "notice-period", "notice"].includes(normalized)) return "Notice period";
  return "Active";
}

export function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0092")) return `92${digits.slice(4)}`;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

export function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isActiveMember(member: any) {
  return ["active", "activated"].includes(String(member?.status || "").trim().toLowerCase());
}

export function memberCompanyKey(member: any) {
  return String(member?.company || "").trim().toLowerCase();
}

export function findMemberIdentityMatch(candidate: any, members: readonly any[], excludeId = "") {
  const phone = normalizePhone(candidate?.phone);
  const email = normalizeEmail(candidate?.email);
  if (!phone && !email) return null;
  return (Array.isArray(members) ? members : []).find((member) => {
    if (!member?.id || member.id === excludeId) return false;
    const samePhone = phone && normalizePhone(member.phone) === phone;
    const sameEmail = email && normalizeEmail(member.email) === email;
    return Boolean(samePhone || sameEmail);
  }) || null;
}

export function createMembershipPeriod(values: any, existingMember: any = null, status: MembershipPeriodStatus = "Active") {
  const startDate = values?.billingStartDate || values?.joined || new Date().toISOString().slice(0, 10);
  return {
    id: `membership-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    company: String(values?.company || existingMember?.company || "").trim(),
    companyId: values?.companyId || existingMember?.companyId || "",
    team: String(values?.team || existingMember?.team || "").trim(),
    spaceId: values?.spaceId || values?.space || existingMember?.spaceId || "",
    space: values?.space || existingMember?.space || "Unassigned",
    rent: values?.rent || existingMember?.rent || "PKR 0",
    deposit: values?.deposit || existingMember?.deposit || "PKR 0",
    startDate,
    endDate: status === "Completed" ? (values?.endDate || new Date().toISOString().slice(0, 10)) : "",
    billingStartDate: startDate,
    status,
  };
}

export function closeCurrentMembership(member: any, endDate = new Date().toISOString().slice(0, 10)) {
  const periods = Array.isArray(member?.membershipPeriods) ? member.membershipPeriods : [];
  if (!periods.length) return member;
  return {
    ...member,
    membershipPeriods: periods.map((period, index) => index === periods.length - 1 && period.status === "Active" ? { ...period, status: "Completed", endDate } : period),
    currentMembershipId: null,
  };
}

export function reactivateMember(member: any, values: any) {
  const previousPhones = Array.isArray(member?.contactHistory?.phones) ? member.contactHistory.phones : (member?.phone ? [{ value: member.phone, normalized: normalizePhone(member.phone) }] : []);
  const previousEmails = Array.isArray(member?.contactHistory?.emails) ? member.contactHistory.emails : (member?.email ? [{ value: member.email, normalized: normalizeEmail(member.email) }] : []);
  const newPhone = String(values?.phone || member?.phone || "").trim();
  const newEmail = String(values?.email || member?.email || "").trim();
  const phoneHistory = newPhone && !previousPhones.some((item) => normalizePhone(item.value || item) === normalizePhone(newPhone))
    ? [...previousPhones, { value: newPhone, normalized: normalizePhone(newPhone), addedAt: new Date().toISOString().slice(0, 10) }]
    : previousPhones;
  const emailHistory = newEmail && !previousEmails.some((item) => normalizeEmail(item.value || item) === normalizeEmail(newEmail))
    ? [...previousEmails, { value: newEmail, normalized: normalizeEmail(newEmail), addedAt: new Date().toISOString().slice(0, 10) }]
    : previousEmails;
  const period = createMembershipPeriod(values, member);
  return {
    ...member,
    ...values,
    id: member.id,
    leadId: values?.leadId || member?.leadId || "",
    status: "Active",
    phone: newPhone,
    email: newEmail,
    firstJoined: member.firstJoined || member.joined || values?.joined,
    currentMembershipId: period.id,
    membershipPeriods: [...(Array.isArray(member.membershipPeriods) ? member.membershipPeriods : []), period],
    contactHistory: { ...(member.contactHistory || {}), phones: phoneHistory, emails: emailHistory },
    joined: member.joined || values?.joined || period.startDate,
    billingStartDate: period.billingStartDate,
    spaceId: values?.spaceId || values?.space || "",
    space: values?.space || "Unassigned",
  };
}

export function syncCompanyStatuses(companies: readonly any[], members: readonly any[]) {
  const memberList = Array.isArray(members) ? members : [];
  return (Array.isArray(companies) ? companies : []).map((company) => {
    const linkedMembers = memberList.filter((member) => memberCompanyKey(member) === String(company?.name || "").trim().toLowerCase());
    if (!linkedMembers.length) return company;
    return { ...company, status: linkedMembers.some(isActiveMember) ? "Active" : "Inactive" };
  });
}
