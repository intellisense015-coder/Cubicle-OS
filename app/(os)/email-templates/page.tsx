"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { Edit3, FileText, Mail, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/table";
import { emailTemplates } from "@/features/email-templates/data";
import { useToast } from "@/components/ui/toast-provider";
import { useHasPermission } from "@/lib/access-control";

type EmailTemplate = (typeof emailTemplates)[number];
type TemplateDraft = EmailTemplate;

const visibleTemplates = emailTemplates as EmailTemplate[];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] || character));
}

function editorHtml(value: string, variables: string[]) {
  return value.split(/(\{\{[^}]+\}\})/g).map((part) => {
    if (variables.includes(part)) {
      return `<span class="email-template-token" data-template-token="${escapeHtml(part)}" contenteditable="false" draggable="true">${escapeHtml(part)}</span>`;
    }
    return escapeHtml(part).replace(/\n/g, "<br />");
  }).join("");
}

function readEditorValue(root: HTMLElement) {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return Array.from(node.childNodes).map(walk).join("");

    const element = node as HTMLElement;
    if (element.dataset.templateToken) return element.dataset.templateToken;
    if (element.tagName === "BR") return "\n";

    const content = Array.from(element.childNodes).map(walk).join("");
    return element !== root && (element.tagName === "DIV" || element.tagName === "P") ? `${content}\n` : content;
  };

  return walk(root).replace(/\n+$/, "");
}

function previewParts(value: string, keyPrefix: string) {
  return value.split(/(\{\{[^}]+\}\})/g).map((part, index) => part.startsWith("{{") && part.endsWith("}}")
    ? <span className="email-template-preview-token" key={`${keyPrefix}-token-${index}`}>{part}</span>
    : <span key={`${keyPrefix}-text-${index}`}>{part}</span>);
}

function previewBody(value: string) {
  return value.split(/\n{2,}/g).map((paragraph, index) => (
    <p key={`email-preview-paragraph-${index}`}>
      {paragraph.split("\n").map((line, lineIndex) => (
        <span key={`email-preview-line-${index}-${lineIndex}`}>
          {lineIndex ? <br /> : null}
          {previewParts(line, `email-preview-${index}-${lineIndex}`)}
        </span>
      ))}
    </p>
  ));
}

const INVOICE_PREVIEW_VALUES: Record<string, string> = {
  "{{member_name}}": "test2",
  "{{invoice_number}}": "INV-2026-1032",
  "{{billing_period}}": "2026-11-01",
  "{{amount}}": "PKR 300,000",
  "{{due_date}}": "05 November 2026",
  "{{invoice_link}}": "View invoice",
};

function invoicePreviewParts(value: string, keyPrefix: string) {
  return value.split(/(\{\{[^}]+\}\})/g).map((part, index) => (
    <span key={`${keyPrefix}-${index}`}>
      {INVOICE_PREVIEW_VALUES[part] || part}
    </span>
  ));
}

function invoicePreviewBody(value: string) {
  return value.split(/\n{2,}/g).map((paragraph, index) => (
    <p key={`invoice-preview-paragraph-${index}`}>
      {paragraph.split("\n").map((line, lineIndex) => (
        <span key={`invoice-preview-line-${index}-${lineIndex}`}>
          {lineIndex ? <br /> : null}
          {invoicePreviewParts(line, `invoice-preview-${index}-${lineIndex}`)}
        </span>
      ))}
    </p>
  ));
}

function InvoiceEmailPreview({ draft }: { draft: EmailTemplate }) {
  return (
    <div className="invoice-email-preview">
      <div className="invoice-email-preview-header">
        <div>The Cubicle</div>
        <h3>Invoice {invoicePreviewParts("{{invoice_number}}", "invoice-preview-number")}</h3>
      </div>
      <div className="invoice-email-preview-content">
        <div className="invoice-email-preview-message">{invoicePreviewBody(draft.body)}</div>
        <div className="invoice-email-preview-row"><span>Office 04 workspace service</span><strong>PKR 300,000</strong></div>
        <div className="invoice-email-preview-row invoice-email-preview-subtotal"><span>Subtotal</span><span>PKR 300,000</span></div>
        <div className="invoice-email-preview-row invoice-email-preview-total"><strong>Amount due</strong><strong>PKR 300,000</strong></div>
        <p className="invoice-email-preview-due">Due date: <strong>{INVOICE_PREVIEW_VALUES["{{due_date}}"]}</strong></p>
        <p className="invoice-email-preview-footer">This is an automated message from The Cubicle. Please reply to this email if you have any questions.</p>
      </div>
      <div className="invoice-email-preview-attachment"><strong>One attachment</strong><span>{INVOICE_PREVIEW_VALUES["{{invoice_number}}"]}.pdf</span></div>
    </div>
  );
}

const QUOTATION_PREVIEW_VALUES: Record<string, string> = {
  "{{recipient_name}}": "Test Lead 2",
  "{{quotation_number}}": "QUO-2026-1001",
  "{{quotation_date}}": "05 October 2026",
  "{{title}}": "2 Dedicated seats",
  "{{workspace}}": "Test Company 2",
  "{{total_seats}}": "3",
  "{{total_amount}}": "PKR 51,500",
};

function quotationPreviewParts(value: string, keyPrefix: string) {
  return value.split(/(\{\{[^}]+\}\})/g).map((part, index) => (
    <span key={`${keyPrefix}-${index}`}>
      {QUOTATION_PREVIEW_VALUES[part.trim()] || part}
    </span>
  ));
}

function quotationPreviewBody(value: string) {
  return value.split(/\r?\n/).map((line, index) => line.trim() ? (
    <p key={`quotation-preview-line-${index}`}>
      {quotationPreviewParts(line, `quotation-preview-${index}`)}
    </p>
  ) : <div key={`quotation-preview-space-${index}`} className="quotation-email-preview-space" />);
}

function QuotationEmailPreview({ draft }: { draft: EmailTemplate }) {
  return (
    <div className="quotation-email-preview">
      <div className="quotation-email-preview-attachment">
        <strong>{QUOTATION_PREVIEW_VALUES["{{quotation_number}}"]}.pdf</strong>
        <span>PDF attachment</span>
      </div>
      <div className="quotation-email-preview-card">
        <div className="quotation-email-preview-header">
          <div>The Cubicle</div>
          <h3>Quotation</h3>
        </div>
        <div className="quotation-email-preview-content">
          <div className="quotation-email-preview-message">{quotationPreviewBody(draft.body)}</div>
          <div className="quotation-email-preview-summary">
            <div className="quotation-email-preview-row"><span>Quotation</span><span>{QUOTATION_PREVIEW_VALUES["{{title}}"]}</span></div>
            <div className="quotation-email-preview-row"><span>Date</span><span>{QUOTATION_PREVIEW_VALUES["{{quotation_date}}"]}</span></div>
            <div className="quotation-email-preview-row quotation-email-preview-total"><strong>Total</strong><strong>{QUOTATION_PREVIEW_VALUES["{{total_amount}}"]}</strong></div>
          </div>
          <p className="quotation-email-preview-footer">The complete quotation PDF is attached to this email. Please reply if you have any questions.</p>
        </div>
      </div>
    </div>
  );
}

function InvitationEmailPreview({ draft }: { draft: EmailTemplate }) {
  return (
    <div className="email-template-invitation-email">
      <div className="email-template-invitation-hero" aria-hidden="true">
        <div className="email-template-invitation-mark">
          <span className="email-template-invitation-square email-template-invitation-square-left" />
          <span className="email-template-invitation-square email-template-invitation-square-top-right" />
          <span className="email-template-invitation-square email-template-invitation-square-right" />
          <span className="email-template-invitation-tile email-template-invitation-tile-top-left" />
          <span className="email-template-invitation-tile email-template-invitation-tile-top-right" />
          <span className="email-template-invitation-tile email-template-invitation-tile-middle-left" />
          <span className="email-template-invitation-tile email-template-invitation-tile-middle-right" />
          <span className="email-template-invitation-tile email-template-invitation-tile-lower-left" />
          <span className="email-template-invitation-tile email-template-invitation-tile-lower-right" />
          <span className="email-template-invitation-tile email-template-invitation-tile-bottom-left" />
          <span className="email-template-invitation-tile email-template-invitation-tile-bottom-right" />
        </div>
      </div>
      <div className="email-template-invitation-content">
        <h3>{previewParts(draft.subject, "invitation-preview-subject")}</h3>
        <div className="email-template-email-body">{previewBody(draft.body)}</div>
        <a className="email-template-designed-action" href="#" onClick={(event) => event.preventDefault()}>Accept invitation</a>
      </div>
    </div>
  );
}

function TemplateTokenEditor({
  label,
  value,
  variables,
  readOnly,
  singleLine = false,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  variables: string[];
  readOnly: boolean;
  singleLine?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const availableVariables = variables.filter((variable) => !value.includes(variable));

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const active = document.activeElement;
    if (active === editor || editor.contains(active)) return;
    editor.innerHTML = editorHtml(value, variables);
  }, [value, variables, readOnly]);

  const updateValue = () => {
    if (editorRef.current) onChange(readEditorValue(editorRef.current));
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-template-token]") : null;
    const token = target?.dataset.templateToken;
    if (!token || readOnly) return;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/template-token", token);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (readOnly || !editorRef.current) return;
    const token = event.dataTransfer.getData("text/template-token");
    if (!token || !variables.includes(token)) return;

    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : document.createRange();
    if (!selection?.rangeCount || !editorRef.current.contains(range.commonAncestorContainer)) {
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
    }

    range.deleteContents();
    const tokenElement = document.createElement("span");
    tokenElement.className = "email-template-token";
    tokenElement.dataset.templateToken = token;
    tokenElement.contentEditable = "false";
    tokenElement.draggable = true;
    tokenElement.textContent = token;
    range.insertNode(tokenElement);
    range.setStartAfter(tokenElement);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    updateValue();
  };

  return (
    <div className="email-template-editor-field">
      <div className="email-template-editor-label-row">
        <span className="email-template-editor-label">{label}</span>
      </div>
      <div
        ref={editorRef}
        className={`email-template-rich-editor ${singleLine ? "is-single-line" : ""} ${readOnly ? "is-readonly" : ""}`}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        role="textbox"
        aria-label={label}
        aria-readonly={readOnly}
        onInput={updateValue}
        onDragStart={handleDragStart}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onKeyDown={(event) => {
          if (singleLine && event.key === "Enter") event.preventDefault();
        }}
      />
      {!readOnly && availableVariables.length ? (
        <div className="email-template-variable-palette" aria-label={`Available variables for ${label}`}>
          {availableVariables.map((variable) => (
            <span
              key={variable}
              className="email-template-variable-chip"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("text/template-token", variable);
              }}
            >
              {variable}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function createTemplateColumns(onEdit: (template: EmailTemplate) => void, canEdit: boolean) {
  const columnHelper = createColumnHelper<EmailTemplate>();
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
  const [templates, setTemplates] = useState<EmailTemplate[]>(visibleTemplates);
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!canView) return;
    let active = true;
    void fetch("/api/settings/email-templates", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Email templates could not be loaded.");
        return payload;
      })
      .then((payload) => {
        if (!active || !Array.isArray(payload?.templates)) return;
        setTemplates((current) => current.map((template) => {
          const remote = payload.templates.find((item) => item.id === template.id);
          return remote ? { ...template, subject: remote.subject, body: remote.body, status: remote.status, tone: remote.status === "Draft" ? "accent" : "success" } : template;
        }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [canView]);

  const filtered = useMemo(() => templates.filter((template) => `${template.name} ${template.purpose} ${template.category} ${template.audience}`.toLowerCase().includes(query.toLowerCase())), [query, templates]);
  const ready = templates.filter((template) => template.status === "Ready").length;
  const drafts = templates.filter((template) => template.status === "Draft").length;

  const openTemplate = (template: EmailTemplate) => {
    setSelected(template);
    setDraft({ ...template });
  };
  const closeTemplate = () => { setSelected(null); setDraft(null); };
  const changed = Boolean(draft && selected && (draft.subject !== selected.subject || draft.body !== selected.body));

  const save = async (status = "Ready") => {
    if (!canEdit) {
      showToast({ variant: "error", title: "View-only access", message: "You can view email templates, but your account cannot edit them." });
      return;
    }
    if (!draft || !changed) {
      showToast({ variant: "error", title: "Nothing to save", message: "Make a change before saving this template." });
      return;
    }
    const next = { ...draft, status, tone: status === "Draft" ? "accent" : "success" } as EmailTemplate;
    try {
      const response = await fetch("/api/settings/email-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: next.id, subject: next.subject, body: next.body, status: next.status }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Email template could not be saved.");
      setTemplates((current) => current.map((template) => template.id === next.id ? next : template));
      setSelected(next);
      setDraft(next);
      showToast({ variant: "success", title: "Template saved", message: `${next.name} is now used for future emails.` });
    } catch (error) {
      showToast({ variant: "error", title: "Template was not saved", message: error?.message || "The email template could not be saved." });
    }
  };

  if (!canView) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Email Templates</h1><p className="muted-copy">Email templates are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Email Templates — View access.</div></motion.div>;

  return (
    <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="module-header"><div><h1>Email Templates</h1><p className="muted-copy">Manage reusable messages for invitations, invoices, quotations, proposals, and notifications.</p></div>{canEdit ? null : <span className="read-only-label">View only</span>}</div>
      <section className="stat-grid module-stats approval-kpi-grid">
        <KpiCard icon={<Mail size={18} />} label="Total templates" value={visibleTemplates.length} detail="Available message templates" />
        <KpiCard icon={<FileText size={18} />} label="Ready" value={ready} detail="Active templates" />
        <KpiCard icon={<Edit3 size={18} />} label="Drafts" value={drafts} detail="Templates in progress" />
      </section>
      <div className="leads-toolbar page-search-row"><div className="header-search-wrap page-search-wrap"><Search size={14} className="search-leading-icon" /><input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search templates" className="search-input" /><div className="search-kbd-pill"><span>Ctrl K</span></div></div></div>
      <DataTable title="Template library" subtitle="Select a template to view and edit its current content." columns={createTemplateColumns(openTemplate, canEdit)} data={filtered} emptyMessage="No email templates found." onRowClick={openTemplate} />
      <Dialog open={Boolean(selected && draft)} onClose={closeTemplate} ariaLabel="Edit email template">
        {draft ? (
          <div className="email-template-editor-shell">
            <section className="email-template-preview-pane" aria-label="Email preview">
              <div className="email-template-preview-heading"><div><h2>{draft.name}</h2></div><StatusBadge tone={draft.tone}>{draft.status}</StatusBadge></div>
              <div className={`email-template-email-card ${draft.category === "Quotations" ? "is-quotation-preview" : ""}`}>
                {draft.category === "Invoices" ? <InvoiceEmailPreview draft={draft} /> : draft.category === "Quotations" ? <QuotationEmailPreview draft={draft} /> : draft.category === "Invitations" ? <InvitationEmailPreview draft={draft} /> : <div className="email-template-designed-email">
                  <div className="email-template-designed-brand">The Cubicle OS</div>
                  <h3>{previewParts(draft.subject, "email-preview-subject")}</h3>
                  <div className="email-template-email-body">{previewBody(draft.body)}</div>
                </div>}
              </div>
            </section>
            <section className="email-template-edit-pane" aria-label="Edit email template">
              <div className="email-template-edit-heading"><h2>{draft.name}</h2><p>{canEdit ? "Drag protected variables into the subject or message." : "Review the current subject and message."}</p></div>
              <div className="email-template-edit-fields">
                <TemplateTokenEditor label="Subject" value={draft.subject} variables={draft.variables} readOnly={!canEdit} singleLine placeholder="Email subject" onChange={(subject) => setDraft({ ...draft, subject })} />
                <TemplateTokenEditor label="Message" value={draft.body} variables={draft.variables} readOnly={!canEdit} placeholder="Write the email message" onChange={(body) => setDraft({ ...draft, body })} />
              </div>
              <div className="email-template-editor-actions">{canEdit && changed ? <><Button variant="ghost" className="email-template-draft-button" onClick={() => save("Draft")}><Save size={15} /> Save Draft</Button><Button onClick={() => save("Ready")}><Save size={15} /> Save template</Button></> : null}</div>
            </section>
          </div>
        ) : null}
      </Dialog>
    </motion.div>
  );
}
