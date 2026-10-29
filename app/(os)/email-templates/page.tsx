"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { CheckCircle2, Edit3, FileText, Mail, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/table";
import { emailTemplates } from "@/features/email-templates/data";
import { saveEmailTemplate } from "@/features/email-templates/actions";
import { useToast } from "@/components/ui/toast-provider";
import { useHasPermission } from "@/lib/access-control";

const visibleTemplates = emailTemplates.filter((template) => !["lead-welcome", "lead-promotion", "visit-confirmation", "member-welcome", "member-follow-up", "member-promotion"].includes(template.id));

function createTemplateColumns(onEdit, canEdit) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("name", { header: "Template", cell: ({ row }) => <div className="table-primary"><strong>{row.original.name}</strong><span>{row.original.purpose}</span></div> }),
    columnHelper.accessor("audience", { header: "Audience" }),
    columnHelper.accessor("category", { header: "Category" }),
    columnHelper.accessor("status", { header: "Status", cell: ({ row }) => <StatusBadge tone={row.original.tone}>{row.original.status}</StatusBadge> }),
    columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions">{canEdit ? <button className="action-icon-btn" type="button" onClick={() => onEdit(row.original)} aria-label={`Edit ${row.original.name}`} title="Edit template"><Edit3 size={16} /></button> : <span className="read-only-label">Read only</span>}</div> }),
  ];
}

export default function EmailTemplatesPage() {
  const { showToast } = useToast();
  const canView = useHasPermission("email_templates.read");
  const canEdit = useHasPermission("email_templates.write");
  const [templates, setTemplates] = useState(visibleTemplates);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const filtered = useMemo(() => templates.filter((template) => `${template.name} ${template.purpose} ${template.category} ${template.audience}`.toLowerCase().includes(query.toLowerCase())), [query, templates]);
  const ready = templates.filter((template) => template.status === "Ready").length;
  const drafts = templates.filter((template) => template.status === "Draft").length;

  const openTemplate = (template) => { setSelected(template); setDraft({ ...template }); setSaved(false); };
  const closeTemplate = () => { setSelected(null); setDraft(null); setSaved(false); };
  const changed = Boolean(draft && selected && (draft.subject !== selected.subject || draft.body !== selected.body));
  const save = (status = "Ready") => {
    if (!canEdit) {
      showToast({ variant: "error", title: "View-only access", message: "You can view email templates, but your account cannot edit them." });
      return;
    }
    if (!draft || !changed) {
      showToast({ variant: "error", title: "Nothing to save", message: "Make a change before saving this template." });
      return;
    }
    const next = { ...draft, status, tone: status === "Draft" ? "accent" : "success" };
    saveEmailTemplate(next);
    setTemplates((current) => current.map((template) => template.id === next.id ? next : template));
    setSelected(next);
    setDraft(next);
    setSaved(true);
    showToast({ variant: "success", title: "Template saved", message: `${next.name} was updated successfully.` });
  };

  if (!canView) return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Email Templates</h1><p className="muted-copy">Email templates are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Email Templates — View access.</div></motion.div></PageShell>;

  return <PageShell>
    <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="module-header"><div><h1>Email Templates</h1><p className="muted-copy">Manage reusable messages for leads, members, billing, and follow-ups.</p></div>{canEdit ? null : <span className="read-only-label">View only</span>}</div>
      <div className="leads-toolbar"><div className="leads-search-wrap"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates" aria-label="Search templates" /></div></div>
      <section className="stat-grid module-stats approval-kpi-grid">
        <KpiCard icon={<Mail size={18} />} label="Total templates" value={visibleTemplates.length} detail="Available message templates" />
        <KpiCard icon={<FileText size={18} />} label="Ready" value={ready} detail="Active templates" />
        <KpiCard icon={<Edit3 size={18} />} label="Drafts" value={drafts} detail="Templates in progress" />
      </section>
      <div className="section-heading"><div><h2>Template library</h2><p className="muted-copy">Select a template to view and edit its current content.</p></div></div>
      <DataTable columns={createTemplateColumns(openTemplate, canEdit)} data={filtered} emptyMessage="No email templates found." onRowClick={openTemplate} />
      <Dialog open={Boolean(selected && draft)} onClose={closeTemplate} ariaLabel="Edit email template">
         {draft ? <div className="inline-form-card"><div className="card-heading"><div><h2>{draft.name}</h2><p className="muted-copy">{canEdit ? "Edit the subject and message content for this template." : "Review the current subject and message content."}</p></div></div><div className="inline-form-grid"><label className="settings-label">Subject<Input value={draft.subject} readOnly={!canEdit} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></label><label className="settings-label">Audience<Input value={draft.audience} readOnly /></label><label className="settings-label template-message-field">Message<textarea className="text-input textarea-input" value={draft.body} readOnly={!canEdit} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label></div>{saved ? <p className="success-message"><CheckCircle2 size={15} /> Template saved in this demo session.</p> : null}<div className="inline-form-actions"><Button variant="ghost" onClick={closeTemplate}>Close template</Button>{canEdit && changed ? <><Button variant="ghost" onClick={() => save("Draft")}><Save size={15} /> Save Draft</Button><Button onClick={() => save("Ready")}><Save size={15} /> Save template</Button></> : null}</div></div> : null}
      </Dialog>
    </motion.div>
  </PageShell>;
}
