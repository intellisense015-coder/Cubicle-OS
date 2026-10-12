"use client";

import { Activity, BellRing, Building2, KeyRound, LockKeyhole, Mail, ReceiptText, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";

function SettingRow({ icon: Icon, label, value, detail = "" }) {
  return <div className="os-setting-row"><span className="os-setting-icon"><Icon size={16} /></span><span className="os-setting-copy"><small>{label}</small><strong>{value}</strong>{detail ? <em>{detail}</em> : null}</span></div>;
}

export default function SettingsPage() {
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
