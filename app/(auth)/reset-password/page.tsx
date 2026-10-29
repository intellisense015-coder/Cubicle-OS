"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { saveDemoValue } from "@/lib/demo-session";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";

// TITLE: RESET PASSWORD PAGE
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(!hasSupabaseConfig());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    const checkRecoverySession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionError || !data.session) {
        setError("This reset link is invalid or has expired. Request a new one.");
        setIsReady(false);
        return;
      }
      setIsReady(true);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsReady(Boolean(session));
        if (!session) setError("This reset link is invalid or has expired. Request a new one.");
      }
    });

    void checkRecoverySession();
    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!isReady) return;
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== confirmPassword) return setError("The passwords do not match.");
    setError("");
    setIsSaving(true);

    try {
      if (hasSupabaseConfig()) {
        const supabase = getSupabaseBrowserClient();
        const { data: assuranceData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceData?.nextLevel === "aal2" && assuranceData.currentLevel !== "aal2") {
          router.replace(`/mfa?next=${encodeURIComponent("/reset-password")}`);
          return;
        }
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        await supabase.auth.signOut();
      } else {
        saveDemoValue("password", password);
      }
      router.push("/login?reset=success");
    } catch (updateException) {
      setError(updateException instanceof Error ? updateException.message : "The password could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthShell title="Set a new password." description="Create a new password for your workspace account." asideTitle="A fresh start." asideCopy="Reset links are single-purpose and expire. After changing your password, sign in again and complete MFA.">
      <motion.form onSubmit={submit} className="auth-form" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}>
        {!isReady && !error ? <div className="auth-form" aria-live="polite"><LoaderCircle size={24} className="sign-in-spinner" /><p className="muted-copy">Validating reset link...</p></div> : null}
        <FormField label="New password"><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="At least 12 characters" autoComplete="new-password" leftIcon={<LockKeyhole size={17} />} required disabled={!isReady || isSaving} /></FormField>
        <FormField label="Confirm password"><Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" placeholder="Repeat your password" autoComplete="new-password" leftIcon={<LockKeyhole size={17} />} required disabled={!isReady || isSaving} /></FormField>
        {error ? <p className="field-error">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={!isReady || isSaving}>{isSaving ? <><LoaderCircle size={13} className="sign-in-spinner" /> Saving...</> : <>Save password <ArrowRight size={17} /></>}</Button>
        <Link href="/login" className="back-link"><ArrowLeft size={15} /> Return to sign in</Link>
      </motion.form>
    </AuthShell>
  );
}
