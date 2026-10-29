"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { motion } from "motion/react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type InviteState = "loading" | "ready" | "error";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [state, setState] = useState<InviteState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    const applySession = (session: { user?: { email?: string | null } } | null) => {
      if (!active) return;
      if (session?.user) {
        setEmail(session.user.email || "");
        setState("ready");
        setError("");
      } else {
        setState("error");
        setError("This invitation link is missing or has expired. Ask an owner to send a new invitation.");
      }
    };

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        if (active) {
          setState("error");
          setError(sessionError.message);
        }
        return;
      }
      applySession(data.session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace("/mfa");
    } catch (updateException) {
      setError(updateException instanceof Error ? updateException.message : "The password could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <AuthShell title="Complete your account." description="Set a secure password before entering The Cubicle OS." asideTitle="You are invited in." asideCopy="Your role and workspace access are managed securely by The Cubicle. MFA setup is required next." step={1} variant="login">
    {state === "loading" ? <div className="auth-form" aria-live="polite"><LoaderCircle size={24} className="sign-in-spinner" /><p className="muted-copy">Validating your invitation...</p></div> : state === "error" ? <div className="auth-form" aria-live="assertive"><p className="field-error">{error}</p><Link href="/login" className="back-link">Return to sign in <ArrowRight size={15} /></Link></div> : <motion.form onSubmit={submit} className="auth-form" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}><FormField label="Invitation email"><Input value={email} readOnly type="email" autoComplete="email" leftIcon={<Mail size={17} />} /></FormField><FormField label="New password"><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="At least 12 characters" leftIcon={<LockKeyhole size={17} />} /></FormField><FormField label="Confirm password"><Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="Repeat your password" leftIcon={<LockKeyhole size={17} />} /></FormField>{error ? <p className="field-error">{error}</p> : null}<Button type="submit" size="lg" className="w-full" disabled={saving}>{saving ? <><LoaderCircle size={13} className="sign-in-spinner" /> Saving...</> : <>Continue to MFA <ArrowRight size={17} /></>}</Button></motion.form>}
  </AuthShell>;
}
