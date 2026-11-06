"use client";

import { Building2, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/primitives";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { useToast } from "@/components/ui/toast-provider";
import { useIsOwner } from "@/lib/access-control";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { saveSupabaseCompanyProfile } from "@/lib/supabase/company-profile";
import { queryKeys } from "@/lib/query-keys";
import { fetchCompanyProfileSnapshot, type CompanyProfileQuerySnapshot } from "@/lib/company-profile-query";

function SettingRow({ icon: Icon, label, value, detail = "" }) {
  return <div className="os-setting-row"><span className="os-setting-icon"><Icon size={16} /></span><span className="os-setting-copy"><small>{label}</small><strong>{value}</strong>{detail ? <em>{detail}</em> : null}</span></div>;
}

type EmailSenderOption = { fromEmail: string; fromName: string };
type EmailSenderPurpose = { key: string; label: string; description: string };
type EmailSenderSetting = { purpose: string; fromEmail: string; fromName: string; replyTo: string; configured: boolean };

export default function SettingsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isOwner = useIsOwner();
  const canViewCompanySettings = isOwner;
  const companyProfileQuery = useQuery({
    queryKey: queryKeys.companyProfile.all,
    queryFn: fetchCompanyProfileSnapshot,
    enabled: canViewCompanySettings,
  });
  const [account, setAccount] = useState({ name: "Workspace user", email: "", role: "Workspace user" });
  const [companyProfile, setCompanyProfile] = useState(() => ({ name: String(getDemoValue("companyName") || "The Cubicle"), email: String(getDemoValue("companyEmail") || "info@thecubicle.pk"), ownerName: String(getDemoValue("profileName") || "") }));
  const [savedCompanyProfile, setSavedCompanyProfile] = useState(companyProfile);
  const [companySaving, setCompanySaving] = useState(false);
  const [emailSenderOptions, setEmailSenderOptions] = useState<EmailSenderOption[]>([]);
  const [emailSenderPurposes, setEmailSenderPurposes] = useState<EmailSenderPurpose[]>([]);
  const [emailSenderSelections, setEmailSenderSelections] = useState<Record<string, string>>({});
  const [savedEmailSenderSelections, setSavedEmailSenderSelections] = useState<Record<string, string>>({});
  const [emailSettingsLoading, setEmailSettingsLoading] = useState(false);
  const [emailSettingsSaving, setEmailSettingsSaving] = useState<string | null>(null);

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
        const ownerName = String(metadataName || fallbackName);
        setAccount({ name: ownerName, email: user.email || "", role });
        const nextProfile = { ...companyProfile, email: companyProfile.email || user.email || "", ownerName: companyProfile.ownerName || ownerName };
        setCompanyProfile(nextProfile);
        setSavedCompanyProfile(nextProfile);
      } catch {
        // PageShell already verifies the session; keep the page usable if the
        // optional account display lookup is unavailable.
      }
    };
    void loadAccount();
    return () => { mounted = false; };
  }, []);

  async function saveCompanyProfile(event) {
    event.preventDefault();
    if (!canViewCompanySettings || companySaving || !companyProfileDirty) return;
    const name = companyProfile.name.trim();
    const email = companyProfile.email.trim();
    const ownerName = companyProfile.ownerName.trim();
    if (!name || !email || !ownerName) {
      showToast({ variant: "error", title: "Company profile was not saved", message: "Enter a company name, contact email and owner name." });
      return;
    }
    setCompanySaving(true);
    try {
      const savedProfile = await saveSupabaseCompanyProfile({ name, email, ownerName });
      const nextProfile = { name: savedProfile.company_name, email: savedProfile.contact_email, ownerName: savedProfile.owner_name };
      saveDemoValue("companyName", name);
      saveDemoValue("companyEmail", email);
      saveDemoValue("profileName", ownerName);
      setCompanyProfile(nextProfile);
      setSavedCompanyProfile(nextProfile);
      setAccount((current) => ({ ...current, name: ownerName }));
      queryClient.setQueryData<CompanyProfileQuerySnapshot>(queryKeys.companyProfile.all, (current) => ({
        ...(current || { profile: nextProfile, dataSource: "supabase", errorMessage: "" }),
        profile: nextProfile,
        dataSource: "supabase",
        errorMessage: "",
      }));
      showToast({ variant: "success", title: "Company profile saved", message: "Your company details were updated successfully." });
    } catch (error) {
<<<<<<< HEAD
      showToast({ variant: "error", title: "Company profile was not saved", message: error instanceof Error ? error.message : "The owner profile could not be updated." });
=======
      showToast({ variant: "error", title: "Company profile was not saved", message: "We couldn’t update the company details. Please try again." });
>>>>>>> 65c4630 (Half Bugs fixed)
    } finally {
      setCompanySaving(false);
    }
  }

  const companyProfileDirty = companyProfile.name.trim() !== savedCompanyProfile.name.trim()
    || companyProfile.email.trim() !== savedCompanyProfile.email.trim()
    || companyProfile.ownerName.trim() !== savedCompanyProfile.ownerName.trim();

  useEffect(() => {
    if (!companyProfileQuery.data || companyProfileDirty) return;
    const nextProfile = companyProfileQuery.data.profile;
    setCompanyProfile(nextProfile);
    setSavedCompanyProfile(nextProfile);
  }, [companyProfileDirty, companyProfileQuery.data]);

  useEffect(() => {
    if (!canViewCompanySettings) return;
    let mounted = true;
    const loadEmailSenderSettings = async () => {
      setEmailSettingsLoading(true);
      try {
        const response = await fetch("/api/settings/email-senders", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Email sender settings could not be loaded.");
        if (!mounted) return;
        const options = Array.isArray(payload?.options) ? payload.options : [];
        const purposes = Array.isArray(payload?.purposes) ? payload.purposes : [];
        const settings = Array.isArray(payload?.settings) ? payload.settings as EmailSenderSetting[] : [];
        const selections = Object.fromEntries(purposes.map((purpose) => {
          const saved = settings.find((setting) => setting.purpose === purpose.key);
          return [purpose.key, saved?.fromEmail || options[0]?.fromEmail || ""];
        }));
        const savedSelections = Object.fromEntries(settings.map((setting) => [setting.purpose, setting.fromEmail]));
        setEmailSenderOptions(options);
        setEmailSenderPurposes(purposes);
        setEmailSenderSelections(selections);
        setSavedEmailSenderSelections(savedSelections);
      } catch (error) {
        if (mounted) showToast({ variant: "error", title: "Email senders could not be loaded", message: error instanceof Error ? error.message : "Review the email delivery configuration." });
      } finally {
        if (mounted) setEmailSettingsLoading(false);
      }
    };
    void loadEmailSenderSettings();
    return () => { mounted = false; };
  }, [canViewCompanySettings, showToast]);

  async function saveEmailSender(purpose: EmailSenderPurpose) {
    const fromEmail = emailSenderSelections[purpose.key];
    if (!fromEmail || emailSettingsSaving) return;
    setEmailSettingsSaving(purpose.key);
    try {
      const response = await fetch("/api/settings/email-senders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: purpose.key, fromEmail }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Email sender settings could not be saved.");
      setSavedEmailSenderSelections((current) => ({ ...current, [purpose.key]: fromEmail }));
      showToast({ variant: "success", title: "Email sender updated", message: `${purpose.label} will now be sent from ${fromEmail}.` });
    } catch (error) {
      showToast({ variant: "error", title: "Email sender was not updated", message: error instanceof Error ? error.message : "The selected sender could not be saved." });
    } finally {
      setEmailSettingsSaving(null);
    }
  }

  return (
    <motion.div className="module-content profile-settings-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="profile-settings-heading"><h1>Profile settings</h1></div>

      {canViewCompanySettings ? <section className="profile-settings-section">
        <h2>Company details</h2>
        <form className="profile-settings-panel profile-settings-edit-form" onSubmit={saveCompanyProfile}>
          <label className="settings-label"><span>Company name</span><Input value={companyProfile.name} onChange={(event) => setCompanyProfile((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="settings-label"><span>Contact email</span><Input type="email" value={companyProfile.email} onChange={(event) => setCompanyProfile((current) => ({ ...current, email: event.target.value }))} /></label>
          <label className="settings-label"><span>Owner name</span><Input value={companyProfile.ownerName} onChange={(event) => setCompanyProfile((current) => ({ ...current, ownerName: event.target.value }))} /></label>
          {companyProfileDirty ? <div className="form-actions"><Button type="submit" loading={companySaving}>Save company profile</Button></div> : null}
        </form>
      </section> : <section className="profile-settings-section">
        <h2>Your account</h2>
        <p className="muted-copy">These details belong to the account currently signed in.</p>
        <div className="profile-settings-panel">
          <SettingRow icon={Building2} label="Name" value={account.name} />
          <SettingRow icon={Mail} label="Email" value={account.email || "Not available"} />
          <SettingRow icon={ShieldCheck} label="Access role" value={account.role} detail="Company settings are restricted to authorized administrators." />
        </div>
      </section>}

      {canViewCompanySettings ? <section className="profile-settings-section">
        <div className="settings-section-heading"><div><h2>Email delivery</h2><p className="muted-copy">Choose the verified sender used for each type of OS email.</p></div></div>
        <div className="profile-settings-panel email-sender-settings-panel">
          {emailSettingsLoading ? <div className="email-sender-loading">Loading email sender settings…</div> : emailSenderPurposes.map((purpose) => <div className="email-sender-row" key={purpose.key}>
            <div className="email-sender-copy"><strong>{purpose.label}</strong><span>{purpose.description}</span></div>
            <div className="email-sender-control"><SelectField label="" className="email-sender-custom-select" value={emailSenderSelections[purpose.key] || ""} onChange={(event) => setEmailSenderSelections((current) => ({ ...current, [purpose.key]: event.target.value }))} disabled={!emailSenderOptions.length || emailSettingsSaving === purpose.key} aria-label={`Sender for ${purpose.label}`}>
              {!emailSenderOptions.length ? <option value="">No verified senders configured</option> : emailSenderOptions.map((option) => <option value={option.fromEmail} key={option.fromEmail}>{option.fromEmail}</option>)}
            </SelectField>
            <Button type="button" size="sm" onClick={() => void saveEmailSender(purpose)} loading={emailSettingsSaving === purpose.key} disabled={!emailSenderOptions.length || emailSettingsSaving !== null || emailSenderSelections[purpose.key] === savedEmailSenderSelections[purpose.key]}>Save</Button></div>
          </div>)}
        </div>
      </section> : null}

      <section className="profile-settings-section">
        <h2>Security</h2>
        <div className="profile-settings-panel">
          <SettingRow icon={ShieldCheck} label="Multi-factor authentication" value="Enabled" detail="Required for workspace access" />
        </div>
      </section>

    </motion.div>
  );
}
