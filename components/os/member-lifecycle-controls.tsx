"use client";

import { useMemo, useState } from "react";
import { BookOpen, CalendarClock, CheckCircle2, Pencil, Power, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePickerField, SelectField } from "@/components/ui/primitives";
import { TableActionMenu } from "@/components/ui/table-action-menu";
import { useToast } from "@/components/ui/toast-provider";
import { isActiveMember, normalizeMembershipStatus } from "@/lib/member-lifecycle";
import { workspaceHasCapacity } from "@/lib/workspace-records";

export type MemberLifecycleAction = "start_notice" | "cancel_notice" | "deactivate" | "reactivate";

type MemberLifecycleProps = {
  member: any;
  members?: any[];
  workspaces?: any[];
  invoiceRecipientIds?: Set<string> | null;
  canEdit: boolean;
  loading?: boolean;
  onEdit: () => void;
  onView?: () => void;
  onTransition: (action: MemberLifecycleAction, payload?: Record<string, unknown>) => Promise<unknown>;
};

const noticeReasons = ["Member requested move-out", "Relocation", "Business closure", "Financial reasons", "Other"];
const deactivationReasons = ["Notice period ended", "Member requested immediate exit", "Non-payment", "Policy violation", "Business closure", "Other"];

function isNoticeMember(member: any) {
  return isActiveMember(member) && normalizeMembershipStatus(member?.membershipStatus) === "Notice period";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function MemberLifecycleDialog({ member, members, mode, candidates, workspaces, isRecipient, onClose, onTransition }: {
  member: any;
  members: any[];
  mode: "notice" | "cancel_notice" | "deactivate" | "reactivate";
  candidates: any[];
  workspaces: any[];
  isRecipient: boolean;
  onClose: () => void;
  onTransition: MemberLifecycleProps["onTransition"];
}) {
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [expectedLeavingDate, setExpectedLeavingDate] = useState(member?.expectedLeavingDate || "");
  const [noticeReason, setNoticeReason] = useState(member?.noticeReason || "");
  const [noticeDetails, setNoticeDetails] = useState(member?.noticeNotes || "");
  const [deactivationReason, setDeactivationReason] = useState("");
  const [deactivationDescription, setDeactivationDescription] = useState("");
  const [replacementRecipientId, setReplacementRecipientId] = useState("");
  const [workspaceId, setWorkspaceId] = useState(member?.spaceId || "");

  const title = mode === "notice" ? "Start notice period" : mode === "cancel_notice" ? "Cancel notice period" : mode === "deactivate" ? "Deactivate member" : "Reactivate member";

  const submit = async () => {
    if (mode === "notice" && (!expectedLeavingDate || !noticeReason || !noticeDetails.trim())) {
      showToast({ variant: "error", title: "Complete the notice details", message: "Expected leaving date, reason, and additional details are required." });
      return;
    }
    if (mode === "deactivate" && (!deactivationReason || !deactivationDescription.trim())) {
      showToast({ variant: "error", title: "Complete the deactivation details", message: "Reason and description are required before deactivation." });
      return;
    }
    if (mode === "deactivate" && isRecipient && !replacementRecipientId) {
      showToast({ variant: "error", title: "Choose an invoice recipient", message: "Select another active member before deactivating the current invoice recipient." });
      return;
    }
    if (mode === "cancel_notice" && !workspaceId) {
      showToast({ variant: "error", title: "Choose a workspace", message: "Select the workspace to keep or assign before cancelling the notice period." });
      return;
    }
    if (mode === "reactivate" && !workspaceId) {
      showToast({ variant: "error", title: "Choose a workspace", message: "Select a workspace before reactivating the member." });
      return;
    }

    setIsSaving(true);
    try {
      if (mode === "notice") await onTransition("start_notice", { expectedLeavingDate, noticeReason, noticeDetails: noticeDetails.trim() });
      if (mode === "cancel_notice") await onTransition("cancel_notice", { workspaceId });
      if (mode === "deactivate") await onTransition("deactivate", { deactivationReason, deactivationDescription: deactivationDescription.trim(), replacementInvoiceRecipientId: replacementRecipientId || null });
      if (mode === "reactivate") await onTransition("reactivate", { workspaceId });
      onClose();
    } catch (error) {
      showToast({ variant: "error", title: `${title} failed`, message: error instanceof Error ? error.message : "The requested change could not be saved." });
    } finally {
      setIsSaving(false);
    }
  };

  const activeWorkspaces = useMemo(() => workspaces.filter((workspace) => workspaceHasCapacity(workspace, members, member?.id)), [member?.id, members, workspaces]);

  return <Dialog open onClose={() => { if (!isSaving) onClose(); }} ariaLabel={title}>
    <div className="dialog-content member-form-card member-lifecycle-dialog">
      <div className="card-heading"><div><h2>{title}</h2><p className="muted-copy">{member?.member || "Member"}</p></div></div>
      {mode === "notice" ? <>
        <div className="member-notice-fields"><DatePickerField label="Expected leaving date" value={expectedLeavingDate} min={today()} hint="The member remains active and invoiceable until this date." onChange={setExpectedLeavingDate} /><SelectField label="Notice reason" value={noticeReason} onChange={(event) => setNoticeReason(event.target.value)}><option value="">Select a reason</option>{noticeReasons.map((reason) => <option value={reason} key={reason}>{reason}</option>)}</SelectField></div>
        <label className="settings-label">Additional details<textarea className="settings-textarea" value={noticeDetails} onChange={(event) => setNoticeDetails(event.target.value)} placeholder="Add context for the notice period." /></label>
      </> : null}
      {mode === "deactivate" ? <>
        <SelectField label="Deactivation reason" value={deactivationReason} onChange={(event) => setDeactivationReason(event.target.value)}><option value="">Select a reason</option>{deactivationReasons.map((reason) => <option value={reason} key={reason}>{reason}</option>)}</SelectField>
        <label className="settings-label">Deactivation description<textarea className="settings-textarea" value={deactivationDescription} onChange={(event) => setDeactivationDescription(event.target.value)} placeholder="Explain why the member is being deactivated." /></label>
        {isRecipient ? <>
          <div className="member-form-section-heading"><h3>Automatic invoice recipient</h3></div>
          {candidates.length ? <SelectField label="Replacement active member" value={replacementRecipientId} onChange={(event) => setReplacementRecipientId(event.target.value)}><option value="">Select another active member</option>{candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.member}{candidate.email ? ` · ${candidate.email}` : ""}</option>)}</SelectField> : <p className="field-error">No other active member is available in this company. Add or reactivate one before deactivating this member.</p>}
        </> : null}
      </> : null}
      {mode === "reactivate" ? <>
        <p className="muted-copy member-lifecycle-description">The member will become active and receive a new membership period. A workspace is required.</p>
        <SelectField label="Workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">Select a workspace</option>{activeWorkspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.label}{workspace.zone ? ` · ${workspace.zone}` : ""}</option>)}</SelectField>
      </> : null}
      {mode === "cancel_notice" ? <>
        <p className="muted-copy member-lifecycle-description">The member will return to an active membership. Choose the workspace they should keep or use after cancelling notice.</p>
        <SelectField label="Workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">Select a workspace</option>{activeWorkspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.label}{workspace.zone ? ` · ${workspace.zone}` : ""}</option>)}</SelectField>
      </> : null}
      <div className="inline-form-actions member-form-actions"><Button type="button" variant="danger" onClick={onClose} disabled={isSaving}>Cancel</Button><Button type="button" loading={isSaving} disabled={isSaving || (mode === "deactivate" && isRecipient && !candidates.length) || ((mode === "cancel_notice" || mode === "reactivate") && !workspaceId)} onClick={() => void submit()}>{mode === "notice" ? <CalendarClock size={15} /> : mode === "deactivate" ? <Power size={15} /> : <RotateCcw size={15} />}{mode === "notice" ? "Start notice period" : mode === "cancel_notice" ? "Cancel notice period" : mode === "deactivate" ? "Deactivate member" : "Reactivate member"}</Button></div>
    </div>
  </Dialog>;
}

export function MemberLifecycleControls({ member, members = [], workspaces = [], invoiceRecipientIds = null, canEdit, loading = false, onEdit, onView, onTransition }: MemberLifecycleProps) {
  const [mode, setMode] = useState<"notice" | "cancel_notice" | "deactivate" | "reactivate" | null>(null);
  const { showToast } = useToast();
  const notice = isNoticeMember(member);
  const recipientIds = invoiceRecipientIds || new Set<string>();
  const isRecipient = recipientIds.has(String(member?.id));
  if (!canEdit && !(isRecipient && onView)) return <span className="read-only-label">Read only</span>;
  const candidates = members.filter((candidate) => String(candidate?.id) !== String(member?.id) && isActiveMember(candidate) && String(candidate?.company || "").trim().toLowerCase() === String(member?.company || "").trim().toLowerCase());
  return <>
    <TableActionMenu ariaLabel={`Actions for ${member?.member || "member"}`} loading={loading} items={[
      ...(isRecipient && onView ? [{ label: "Ledger", icon: <BookOpen size={15} />, onSelect: onView }] : []),
      ...(canEdit && isActiveMember(member) ? [{ label: "Edit member", icon: <Pencil size={15} />, onSelect: onEdit }] : []),
      ...(canEdit && isActiveMember(member) && !notice ? [{ label: "Start notice period", icon: <CalendarClock size={15} />, onSelect: () => setMode("notice") }] : []),
      ...(canEdit && isActiveMember(member) && notice ? [{ label: "Cancel notice period", icon: <XCircle size={15} />, onSelect: () => setMode("cancel_notice") }] : []),
      ...(canEdit && isActiveMember(member) ? [{ label: "Deactivate immediately", icon: <Power size={15} />, onSelect: () => setMode("deactivate"), destructive: true }] : []),
      ...(canEdit && !isActiveMember(member) ? [{ label: "Reactivate member", icon: <CheckCircle2 size={15} />, onSelect: () => setMode("reactivate") }] : []),
    ]} />
    {mode ? <MemberLifecycleDialog member={member} members={members} mode={mode} candidates={isRecipient ? candidates : []} workspaces={workspaces} isRecipient={isRecipient} onClose={() => setMode(null)} onTransition={async (action, payload) => { await onTransition(action, payload); }} /> : null}
  </>;
}
