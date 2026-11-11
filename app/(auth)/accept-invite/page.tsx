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

function cleanInvitationUrl() {
  const url = new URL(window.location.href);
  ["code", "invite", "email", "access_token", "refresh_token", "expires_at", "expires_in", "token_type", "type"].forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

async function establishInvitationSession(supabase: ReturnType<typeof getSupabaseBrowserClient>) {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = url.searchParams.get("access_token") || hashParams.get("access_token");
  const refreshToken = url.searchParams.get("refresh_token") || hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
    cleanInvitationUrl();
    return data.session;
  }

  const code = url.searchParams.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    cleanInvitationUrl();
    return data.session;
  }

  return null;
}

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
    let allowAuthEvents = false;
    const expectedEmail = new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase() || "";

    const applySession = (session: { user?: { email?: string | null } } | null) => {
      if (!active) return;
      if (session?.user) {
        const sessionEmail = String(session.user.email || "").trim().toLowerCase();
        if (expectedEmail && sessionEmail !== expectedEmail) {
          setState("error");
          setError("This invitation belongs to a different email account. Open the invitation from the invited mailbox or ask the owner to send it again.");
          return;
        }
        setEmail(session.user.email || "");
        setState("ready");
        setError("");
      } else {
        setState("error");
        setError("This invitation link is missing or has expired. Ask an owner to send a new invitation.");
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (allowAuthEvents) applySession(session);
    });

    void (async () => {
      try {
        const invitationSession = await establishInvitationSession(supabase);
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (active) {
          allowAuthEvents = true;
          applySession(invitationSession || data.session);
        }
      } catch (sessionException) {
        if (active) {
          setState("error");
          setError(sessionException instanceof Error ? sessionException.message : "This invitation link is invalid or has expired.");
        }
      }
    })();

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
      const invitationResponse = await fetch("/api/auth/invite/accept", { method: "POST" });
      const invitationPayload = await invitationResponse.json().catch(() => null);
      if (!invitationResponse.ok) throw new Error(invitationPayload?.error || "The invitation could not be completed.");
      const postAuthPath = `/post-auth?next=${encodeURIComponent("/dashboard")}`;
      router.replace(`/mfa?next=${encodeURIComponent(postAuthPath)}`);
    } catch (updateException) {
      setError(updateException instanceof Error ? updateException.message : "The password could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <AuthShell title="Complete your account." description="Set a secure password, then sign in with your credentials and complete MFA setup." asideTitle="You are invited in." asideCopy="Your role and workspace access are managed securely by The Cubicle. After saving your password, you will return to sign in before MFA setup." step={1} variant="login">
    {state === "loading" ? <div className="auth-form" aria-live="polite"><LoaderCircle size={24} className="sign-in-spinner" /><p className="muted-copy">Validating your invitation...</p></div> : state === "error" ? <div className="auth-form" aria-live="assertive"><p className="field-error">{error}</p><Link href="/login" className="back-link">Return to sign in <ArrowRight size={15} /></Link></div> : <motion.form onSubmit={submit} className="auth-form" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}><FormField label="Invitation email"><Input value={email} readOnly type="email" autoComplete="email" leftIcon={<Mail size={17} />} /></FormField><FormField label="New password"><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="At least 12 characters" leftIcon={<LockKeyhole size={17} />} /></FormField><FormField label="Confirm password"><Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="Repeat your password" leftIcon={<LockKeyhole size={17} />} /></FormField>{error ? <p className="field-error">{error}</p> : null}<Button type="submit" size="lg" className="w-full" disabled={saving}>{saving ? <><LoaderCircle size={13} className="sign-in-spinner" /> Saving...</> : <>Save password and return to sign in <ArrowRight size={17} /></>}</Button></motion.form>}
  </AuthShell>;
}
