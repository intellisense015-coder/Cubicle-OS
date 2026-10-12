"use client";

import { Activity, BellRing, Building2, Check, KeyRound, LockKeyhole, Mail, Pencil, Plus, Power, ReceiptText, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { getMaintenanceCategories, saveMaintenanceCategories, type MaintenanceCategory } from "@/lib/maintenance";
import { useToast } from "@/components/ui/toast-provider";
import { useIsAdmin } from "@/lib/access-control";

function SettingRow({ icon: Icon, label, value, detail = "" }) {
  return <div className="os-setting-row"><span className="os-setting-icon"><Icon size={16} /></span><span className="os-setting-copy"><small>{label}</small><strong>{value}</strong>{detail ? <em>{detail}</em> : null}</span></div>;
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const canEdit = useIsAdmin();
  const [categories, setCategories] = useState<MaintenanceCategory[]>(() => getMaintenanceCategories());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  function openCategoryForm(category?: MaintenanceCategory) {
    setEditingId(category?.id || "new");
    setDraftName(category?.name || "");
  }

  function saveCategory(event) {
    event.preventDefault();
    if (!canEdit) return;
    const name = draftName.trim();
    if (!name) return;
    if (categories.some((category) => category.id !== editingId && category.name.toLowerCase() === name.toLowerCase())) {
      showToast({ variant: "error", title: "Category already exists", message: "Use a different maintenance subcategory name." });
      return;
    }
    const next = editingId === "new"
      ? [{ id: `maintenance-category-${Date.now()}`, name, active: true }, ...categories]
      : categories.map((category) => category.id === editingId ? { ...category, name } : category);
    setCategories(saveMaintenanceCategories(next));
    setEditingId(null);
    setDraftName("");
    showToast({ variant: "success", title: editingId === "new" ? "Subcategory added" : "Subcategory updated", message: `${name} is ready to use on managed spaces.` });
  }

  function toggleCategory(category: MaintenanceCategory) {
    if (!canEdit) return;
    const next = categories.map((item) => item.id === category.id ? { ...item, active: !item.active } : item);
    setCategories(saveMaintenanceCategories(next));
    showToast({ variant: "success", title: category.active ? "Subcategory deactivated" : "Subcategory activated", message: `${category.name} is ${category.active ? "hidden from new assignments" : "available for new assignments"}.` });
  }

  return <PageShell>
    <motion.div className="module-content profile-settings-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="profile-settings-heading"><h1>Profile settings</h1></div>

      <section className="profile-settings-section">
        <h2>Company details</h2>
        <div className="profile-settings-panel">
          <SettingRow icon={Building2} label="Company name" value="The Cubicle" />
          <SettingRow icon={Mail} label="Contact email" value="hello@thecubicle.local" />
          <SettingRow icon={ReceiptText} label="Invoice numbering" value="INV-2026-" />
        </div>
      </section>

      <section className="profile-settings-section maintenance-settings-section">
        <div className="settings-section-heading"><div><h2>Maintenance subcategories</h2><p className="muted-copy">Create the categories your team uses to describe space maintenance.</p></div>{canEdit ? <Button variant="soft" onClick={() => openCategoryForm()}><Plus size={15} /> Add subcategory</Button> : <span className="read-only-label">Admin editing only</span>}</div>
        <div className="maintenance-category-list">
          {categories.map((category) => <div className={`maintenance-category-row${category.active ? "" : " is-deactivated"}`} key={category.id}><div><strong>{category.name}</strong><span>{category.active ? "Available for managed spaces" : "Deactivated for new maintenance entries"}</span></div><div className="maintenance-category-actions"><span className={`maintenance-category-status ${category.active ? "is-active" : "is-inactive"}`}>{category.active ? <Check size={12} /> : null}{category.active ? "Active" : "Deactivated"}</span>{canEdit ? <><button type="button" className="table-action" onClick={() => openCategoryForm(category)}><Pencil size={13} /> Edit</button><button type="button" className="table-action maintenance-toggle-action" onClick={() => toggleCategory(category)}><Power size={13} /> {category.active ? "Deactivate" : "Activate"}</button></> : null}</div></div>)}
        </div>
        {editingId ? <form className="maintenance-category-form" onSubmit={saveCategory}><label className="settings-label">Subcategory name<input className="text-input floating-input" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. HVAC Repair" autoFocus /></label><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={() => { setEditingId(null); setDraftName(""); }}>Cancel</Button><Button type="submit"><Check size={15} /> Save subcategory</Button></div></form> : null}
      </section>

      <section className="profile-settings-section">
        <h2>Security</h2>
        <div className="profile-settings-panel">
          <SettingRow icon={KeyRound} label="Current password" value="••••••" />
          <SettingRow icon={ShieldCheck} label="Multi-factor authentication" value="Enabled" detail="Required for workspace access" />
          <SettingRow icon={LockKeyhole} label="PIN lock" value="Enabled" detail="Protects this OS session" />
          <SettingRow icon={Mail} label="Security notifications" value="Enabled" detail="Email alerts for account activity" />
        </div>
      </section>

      <section className="profile-settings-section"><h2>OS preferences</h2><div className="profile-settings-panel"><SettingRow icon={BellRing} label="Email notifications" value="Enabled" detail="Approvals, follow-ups, and invoice failures" /><SettingRow icon={Activity} label="Activity history" value="Enabled" detail="Important system changes are recorded" /></div></section>
    </motion.div>
  </PageShell>;
}
