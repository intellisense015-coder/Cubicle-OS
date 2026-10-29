"use client";

import { Activity, BellRing, Building2, Check, LockKeyhole, Mail, Pencil, Plus, Power, ReceiptText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { getMaintenanceCategories, saveMaintenanceCategories, type MaintenanceCategory } from "@/lib/maintenance";
import { useToast } from "@/components/ui/toast-provider";
import { useHasPermission } from "@/lib/access-control";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createSupabaseMaintenanceCategory, fetchSupabaseMaintenanceCategories, mapSupabaseMaintenanceCategoryToOsCategory, updateSupabaseMaintenanceCategory } from "@/lib/supabase/maintenance-categories";

function SettingRow({ icon: Icon, label, value, detail = "" }) {
  return <div className="os-setting-row"><span className="os-setting-icon"><Icon size={16} /></span><span className="os-setting-copy"><small>{label}</small><strong>{value}</strong>{detail ? <em>{detail}</em> : null}</span></div>;
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const canEdit = useHasPermission("maintenance_categories.write");
  const canViewCompanySettings = useHasPermission("settings.read");
  const [account, setAccount] = useState({ name: "Workspace user", email: "", role: "Workspace user" });
  const [categories, setCategories] = useState<MaintenanceCategory[]>(() => getMaintenanceCategories());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    let mounted = true;
    const loadAccount = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const [{ data: userData }, { data: roleData }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc("get_my_admin_role"),
        ]);
        const user = userData.user;
        if (!mounted || !user) return;
        const metadata = user.user_metadata || {};
        const metadataName = metadata.full_name || metadata.name || metadata.display_name;
        const fallbackName = String(user.email || "Workspace user").split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
        const role = String(roleData || "Workspace user").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
        setAccount({ name: String(metadataName || fallbackName), email: user.email || "", role });
      } catch {
        // PageShell already verifies the session; keep the page usable if the
        // optional account display lookup is unavailable.
      }
    };
    void loadAccount();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    let mounted = true;
    void fetchSupabaseMaintenanceCategories()
      .then((rows) => {
        if (!mounted) return;
        const next = rows.map(mapSupabaseMaintenanceCategoryToOsCategory);
        setCategories(saveMaintenanceCategories(next));
      })
      .catch((error) => {
        if (mounted) showToast({ variant: "error", title: "Categories could not be loaded", message: error?.message || "Supabase did not return maintenance categories." });
      });
    return () => { mounted = false; };
  }, [canEdit, showToast]);

  function openCategoryForm(category?: MaintenanceCategory) {
    setEditingId(category?.id || "new");
    setDraftName(category?.name || "");
  }

  async function saveCategory(event) {
    event.preventDefault();
    if (!canEdit) return;
    const name = draftName.trim();
    if (!name) return;
    if (categories.some((category) => category.id !== editingId && category.name.toLowerCase() === name.toLowerCase())) {
      showToast({ variant: "error", title: "Category already exists", message: "Use a different maintenance subcategory name." });
      return;
    }
    try {
      const savedRow = editingId === "new"
        ? await createSupabaseMaintenanceCategory(name)
        : await updateSupabaseMaintenanceCategory(editingId, { name, active: categories.find((category) => category.id === editingId)?.active !== false });
      const savedCategory = mapSupabaseMaintenanceCategoryToOsCategory(savedRow);
      const next = editingId === "new"
        ? [savedCategory, ...categories]
        : categories.map((category) => category.id === editingId ? savedCategory : category);
      setCategories(saveMaintenanceCategories(next));
      setEditingId(null);
      setDraftName("");
      showToast({ variant: "success", title: editingId === "new" ? "Subcategory added" : "Subcategory updated", message: `${name} is ready to use on managed spaces.` });
    } catch (error) {
      showToast({ variant: "error", title: "Subcategory was not saved", message: error?.code === "23505" ? "A maintenance subcategory with this name already exists." : error?.message || "Supabase could not save this subcategory." });
    }
  }

  async function toggleCategory(category: MaintenanceCategory) {
    if (!canEdit) return;
    try {
      const savedRow = await updateSupabaseMaintenanceCategory(category.id, { name: category.name, active: !category.active });
      const savedCategory = mapSupabaseMaintenanceCategoryToOsCategory(savedRow);
      const next = categories.map((item) => item.id === category.id ? savedCategory : item);
      setCategories(saveMaintenanceCategories(next));
      showToast({ variant: "success", title: category.active ? "Subcategory deactivated" : "Subcategory activated", message: `${category.name} is ${category.active ? "hidden from new assignments" : "available for new assignments"}.` });
    } catch (error) {
      showToast({ variant: "error", title: "Subcategory status was not changed", message: error?.message || "Supabase could not update this subcategory." });
    }
  }

  return <PageShell>
    <motion.div className="module-content profile-settings-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="profile-settings-heading"><h1>Profile settings</h1></div>

      {canViewCompanySettings ? <section className="profile-settings-section">
        <h2>Company details</h2>
        <div className="profile-settings-panel">
          <SettingRow icon={Building2} label="Company name" value="The Cubicle" />
          <SettingRow icon={Mail} label="Contact email" value="info@thecubicle.pk" />
          <SettingRow icon={ReceiptText} label="Invoice numbering" value="INV-2026-" />
        </div>
      </section> : <section className="profile-settings-section">
        <h2>Your account</h2>
        <p className="muted-copy">These details belong to the account currently signed in.</p>
        <div className="profile-settings-panel">
          <SettingRow icon={Building2} label="Name" value={account.name} />
          <SettingRow icon={Mail} label="Email" value={account.email || "Not available"} />
          <SettingRow icon={ShieldCheck} label="Access role" value={account.role} detail="Company settings are restricted to authorized administrators." />
        </div>
      </section>}

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
          <SettingRow icon={LockKeyhole} label="Current password" value="••••••" />
          <SettingRow icon={ShieldCheck} label="Multi-factor authentication" value="Enabled" detail="Required for workspace access" />
          <SettingRow icon={Mail} label="Security notifications" value="Enabled" detail="Email alerts for account activity" />
        </div>
      </section>

      <section className="profile-settings-section"><h2>OS preferences</h2><div className="profile-settings-panel"><SettingRow icon={BellRing} label="Email notifications" value="Enabled" detail="Approvals, follow-ups, and invoice failures" /><SettingRow icon={Activity} label="Activity history" value="Enabled" detail="Important system changes are recorded" /></div></section>
    </motion.div>
  </PageShell>;
}
