"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { CheckCircle2, KeyRound, LockKeyhole, LogIn, Mail, Pencil, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Dialog } from "@/components/ui/dialog";
import { getDemoSession, getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { useToast } from "@/components/ui/toast-provider";
import { z } from "zod";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name."),
  email: z.string().email("Your email address is not valid."),
  phone: z.string().optional()
});

// TITLE: PROFILE SECURITY PAGE
export default function ProfilePage() {
  const { showToast } = useToast();
  const [saved, setSaved] = useState(false);
  const [securityDialog, setSecurityDialog] = useState<"password" | "pin" | "mfa" | "history" | null>(null);
  const [securityValue, setSecurityValue] = useState("");
  const [securityConfirm, setSecurityConfirm] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(() => getDemoValue("mfaConfigured") !== false);
  const formApi = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name: "The Cubicle Owner", email: "", phone: "+92 300 0000000" }, mode: "onBlur" });
  const { register, handleSubmit, setValue, formState } = formApi;

  useEffect(() => { setValue("email", getDemoSession().email, { shouldValidate: true }); }, [setValue]);

  const saveProfile = (values) => {
    saveDemoValue("profileName", values.name.trim());
    saveDemoValue("profilePhone", values.phone || "");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
    showToast({ variant: "success", title: "Profile saved", message: "Your profile details were updated successfully." });
  };

  const openSecurityDialog = (kind) => {
    setSecurityDialog(kind);
    setSecurityValue("");
    setSecurityConfirm("");
    setSecurityError("");
  };

  const saveSecurityAction = (event) => {
    event.preventDefault();
    if (securityDialog === "mfa") {
      const next = !mfaEnabled;
      setMfaEnabled(next);
      saveDemoValue("mfaConfigured", next);
      setSecurityDialog(null);
      showToast({ variant: "success", title: next ? "MFA enabled" : "MFA disabled", message: "The demo security setting was updated." });
      return;
    }
    if (!securityValue || securityValue !== securityConfirm) {
      setSecurityError(securityDialog === "pin" ? "PIN entries must match." : "Password entries must match.");
      return;
    }
    if (securityDialog === "pin" && !/^\d{4}$/.test(securityValue)) {
      setSecurityError("Enter exactly 4 digits.");
      return;
    }
    if (securityDialog === "password" && securityValue.length < 8) {
      setSecurityError("Use at least 8 characters.");
      return;
    }
    saveDemoValue(securityDialog === "pin" ? "pin" : "password", securityValue);
    saveDemoValue(securityDialog === "pin" ? "pinChangedAt" : "passwordChangedAt", new Date().toISOString());
    setSecurityDialog(null);
    showToast({ variant: "success", title: securityDialog === "pin" ? "PIN changed" : "Password changed", message: "The updated value is saved in this browser demo session." });
  };

  const error = (field) => formState.errors[field]?.message;
  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Profile & Security</h1><p className="muted-copy">Manage your signed-in identity and security checks.</p></div><span className="security-health"><CheckCircle2 size={16} /> Protected</span></div><div className="profile-grid"><section className="settings-card"><div className="card-heading"><div><h2>Profile information</h2><p className="muted-copy">These details belong to the signed-in owner.</p></div><UserRound size={21} /></div><form className="settings-form" onSubmit={handleSubmit(saveProfile)}><FormField label="Name" error={error("name")}><Input className={error("name") ? "has-error" : ""} {...register("name")} leftIcon={<UserRound size={17} />} /></FormField><FormField label="Email address" error={error("email")}><Input className={error("email") ? "has-error" : ""} {...register("email")} readOnly leftIcon={<Mail size={17} />} /></FormField><FormField label="Phone number" error={error("phone")}><Input className={error("phone") ? "has-error" : ""} {...register("phone")} leftIcon={<Smartphone size={17} />} /></FormField><div className="form-actions"><Button type="submit" disabled={formState.isSubmitting}><Pencil size={15} /> Save profile</Button>{saved ? <span className="success-message">Profile saved in this demo session.</span> : null}</div></form></section><section className="security-stack"><div className="settings-card security-card"><div className="card-heading"><div><h2>Password</h2><p className="muted-copy">Last changed 14 days ago.</p></div><LockKeyhole size={21} /></div><Button variant="ghost" onClick={() => openSecurityDialog("password")}>Change password</Button></div><div className="settings-card security-card"><div className="card-heading"><div><h2>OS PIN</h2><p className="muted-copy">4-digit PIN is configured.</p></div><KeyRound size={21} /></div><Button variant="ghost" onClick={() => openSecurityDialog("pin")}>Change PIN</Button></div><div className="settings-card security-card"><div className="card-heading"><div><h2>Authenticator MFA</h2><p className="muted-copy">{mfaEnabled ? "Authenticator app is connected." : "Authenticator app is not connected."}</p></div><ShieldCheck size={21} /></div><Button variant="ghost" onClick={() => openSecurityDialog("mfa")}>{mfaEnabled ? "Manage MFA" : "Connect MFA"}</Button></div><div className="settings-card security-card"><div className="card-heading"><div><h2>Recent sign-ins</h2><p className="muted-copy">Today, 9:42 AM · Demo browser</p></div><LogIn size={21} /></div><button type="button" className="text-link" onClick={() => openSecurityDialog("history")}>View sign-in history</button></div></section></div></motion.div><Dialog open={Boolean(securityDialog)} onClose={() => setSecurityDialog(null)} ariaLabel="Security settings">{securityDialog === "history" ? <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">Security</span><h2>Sign-in history</h2></div><LogIn size={21} /></div><div className="security-history-list"><p><strong>Today, 9:42 AM</strong><span>Demo browser · Current session</span></p><p><strong>Yesterday, 4:18 PM</strong><span>Demo browser · Successful sign-in</span></p></div><div className="dialog-actions"><Button variant="ghost" onClick={() => setSecurityDialog(null)}>Close</Button></div></div> : <form className="dialog-content" onSubmit={saveSecurityAction}><div className="card-heading"><div><span className="seat-details-label">Security</span><h2>{securityDialog === "mfa" ? (mfaEnabled ? "Manage MFA" : "Connect MFA") : securityDialog === "pin" ? "Change PIN" : "Change password"}</h2><p className="muted-copy">This is a local demo flow so it can be tested without sending credentials anywhere.</p></div></div>{securityDialog === "mfa" ? <p className="muted-copy">{mfaEnabled ? "Disable the demo authenticator connection, then reconnect it when testing the flow." : "Connect the demo authenticator to mark MFA as enabled."}</p> : <><label className="settings-label">{securityDialog === "pin" ? "New 4-digit PIN" : "New password"}<Input type={securityDialog === "pin" ? "password" : "password"} inputMode={securityDialog === "pin" ? "numeric" : undefined} maxLength={securityDialog === "pin" ? 4 : undefined} value={securityValue} onChange={(event) => { setSecurityValue(event.target.value); setSecurityError(""); }} /></label><label className="settings-label">Confirm {securityDialog === "pin" ? "PIN" : "password"}<Input type="password" value={securityConfirm} onChange={(event) => { setSecurityConfirm(event.target.value); setSecurityError(""); }} /></label>{securityError ? <span className="lead-form-error">{securityError}</span> : null}</>}<div className="dialog-actions"><Button type="button" variant="ghost" onClick={() => setSecurityDialog(null)}>Cancel</Button><Button type="submit">{securityDialog === "mfa" ? (mfaEnabled ? "Disconnect MFA" : "Connect MFA") : "Save changes"}</Button></div></form>}</Dialog></PageShell>;
}
