"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { LockKeyhole, Pencil, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Dialog } from "@/components/ui/dialog";
import { getDemoSession, getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { useToast } from "@/components/ui/toast-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MfaManager } from "@/components/os/mfa-manager";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name."),
  email: z.string().email("Your email address is not valid."),
  phone: z.string().optional(),
});

export default function ProfilePage() {
  const { showToast } = useToast();
  const [saved, setSaved] = useState(false);
  const [securityDialog, setSecurityDialog] = useState<"password" | "mfa" | null>(null);
  const [securityValue, setSecurityValue] = useState("");
  const [securityConfirm, setSecurityConfirm] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [securitySaving, setSecuritySaving] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const formApi = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "The Cubicle Owner", email: "", phone: "+92 300 0000000" },
    mode: "onBlur",
  });
  const { register, handleSubmit, setValue, formState } = formApi;

  useEffect(() => {
    let mounted = true;
    void getSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      if (!mounted || !data.user) return;
      const metadata = data.user.user_metadata || {};
      setValue("name", String(metadata.full_name || metadata.name || getDemoValue("profileName") || "The Cubicle Owner"));
      setValue("email", data.user.email || getDemoSession().email, { shouldValidate: true });
      setValue("phone", String(metadata.phone || getDemoValue("profilePhone") || ""));
    }).catch(() => {
      if (mounted) setValue("email", getDemoSession().email, { shouldValidate: true });
    });
    return () => { mounted = false; };
  }, [setValue]);

  useEffect(() => {
    let mounted = true;
    void getSupabaseBrowserClient().auth.mfa.listFactors().then(({ data, error }) => {
      if (!mounted || error) return;
      setMfaEnabled((data?.totp || []).some((factor) => factor.status === "verified"));
    }).catch(() => {
      if (mounted) setMfaEnabled(null);
    });
    return () => { mounted = false; };
  }, []);

  const saveProfile = async (values) => {
    try {
      const { error } = await getSupabaseBrowserClient().auth.updateUser({
        email: values.email.trim(),
        data: { full_name: values.name.trim(), phone: values.phone?.trim() || null },
      });
      if (error) throw error;
    } catch (updateError) {
      showToast({ variant: "error", title: "Profile was not saved", message: updateError instanceof Error ? updateError.message : "Supabase could not update your profile." });
      return;
    }
    saveDemoValue("profileName", values.name.trim());
    saveDemoValue("profilePhone", values.phone || "");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
    showToast({ variant: "success", title: "Profile saved", message: "Your profile details were updated. If your email changed, confirm it from your inbox." });
  };

  const openSecurityDialog = (kind: "password" | "mfa") => {
    setSecurityDialog(kind);
    setSecurityValue("");
    setSecurityConfirm("");
    setSecurityError("");
  };

  const saveSecurityAction = async (event) => {
    event.preventDefault();
    if (!securityValue || securityValue !== securityConfirm) {
      setSecurityError("Password entries must match.");
      return;
    }
    if (securityValue.length < 8) {
      setSecurityError("Use at least 8 characters.");
      return;
    }
    setSecuritySaving(true);
    try {
      const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: securityValue });
      if (error) throw error;
      setSecurityDialog(null);
      showToast({ variant: "success", title: "Password changed", message: "Your password was updated securely." });
    } catch (updateError) {
      setSecurityError(updateError instanceof Error ? updateError.message : "The password could not be changed.");
    } finally {
      setSecuritySaving(false);
    }
  };

  const fieldError = (field) => formState.errors[field]?.message;

  return <>
    <motion.div className="module-content profile-settings-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="profile-settings-heading"><h1>Profile settings</h1></div>

      <section className="profile-settings-section">
        <h2>Profile details</h2>
        <div className="profile-settings-panel">
          <form className="profile-settings-edit-form" onSubmit={handleSubmit(saveProfile)}>
            <FormField label="Name" error={fieldError("name")}><Input className={fieldError("name") ? "has-error" : ""} {...register("name")} /></FormField>
            <FormField label="Email address" error={fieldError("email")}><Input className={fieldError("email") ? "has-error" : ""} type="email" {...register("email")} /></FormField>
            <FormField label="Phone number" error={fieldError("phone")}><Input className={fieldError("phone") ? "has-error" : ""} {...register("phone")} /></FormField>
            <div className="form-actions"><Button type="submit" loading={formState.isSubmitting}><Pencil size={15} /> Save profile</Button>{saved ? <span className="success-message">Profile saved successfully.</span> : null}</div>
          </form>
        </div>
      </section>

      <section className="profile-settings-section">
        <h2>Security</h2>
        <div className="profile-settings-panel profile-settings-security-panel">
          <div className="profile-setting-row"><span>Password</span><strong>Managed securely through Supabase Auth</strong><Button variant="ghost" onClick={() => openSecurityDialog("password")}><LockKeyhole size={15} /> Change password</Button></div>
          <div className="profile-setting-row"><span>Authenticator MFA</span><strong>{mfaEnabled === null ? "Checking authenticator status..." : mfaEnabled ? "Authenticator app is connected." : "Authenticator app is not connected."}</strong><Button variant="ghost" onClick={() => openSecurityDialog("mfa")}><ShieldCheck size={15} /> Manage MFA</Button></div>
        </div>
      </section>
    </motion.div>

    <Dialog open={Boolean(securityDialog)} onClose={() => setSecurityDialog(null)} ariaLabel="Security settings">
      {securityDialog === "mfa" ? <MfaManager onClose={() => setSecurityDialog(null)} onStatusChange={setMfaEnabled} /> : <form className="dialog-content" onSubmit={saveSecurityAction}>
        <div className="card-heading"><div><span className="seat-details-label">Security</span><h2>Change password</h2><p className="muted-copy">Your password is updated securely through Supabase Auth.</p></div></div>
        <label className="settings-label">New password<Input type="password" value={securityValue} onChange={(event) => { setSecurityValue(event.target.value); setSecurityError(""); }} /></label>
        <label className="settings-label">Confirm password<Input type="password" value={securityConfirm} onChange={(event) => { setSecurityConfirm(event.target.value); setSecurityError(""); }} /></label>
        {securityError ? <span className="lead-form-error">{securityError}</span> : null}
        <div className="dialog-actions"><Button type="button" variant="ghost" onClick={() => setSecurityDialog(null)} disabled={securitySaving}>Cancel</Button><Button type="submit" loading={securitySaving}>Save changes</Button></div>
      </form>}
    </Dialog>
  </>;
}
