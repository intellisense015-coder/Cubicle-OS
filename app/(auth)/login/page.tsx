"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { z } from "zod";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { saveDemoValue } from "@/lib/demo-session";
import { BROWSER_SESSION_HANDOFF_KEY, getSupabaseBrowserClient } from "@/lib/supabase/client";

// TITLE: SIGN IN VALIDATION
const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Use at least 6 characters.")
});

type SignInValues = z.infer<typeof signInSchema>;

// TITLE: SIGN IN PAGE
export default function SignInPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur"
  });

  const onSubmit = async (values: SignInValues) => {
    setIsSigningIn(true);
    form.clearErrors("root");

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: values.email.trim(),
        password: values.password,
      });

      if (error) {
        form.setError("root", { type: "server", message: error.message });
        return;
      }
      if (!signInData.session) {
        form.setError("root", { type: "server", message: "Sign-in did not create a session. Please try again." });
        return;
      }

      // Persist the exact session returned by password sign-in before MFA. A
      // client-side route transition can otherwise race the SSR cookie write,
      // making the MFA page see an anonymous browser and send it back to login.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      });
      if (sessionError) throw sessionError;

      const { data: persistedSession, error: persistedSessionError } = await supabase.auth.getSession();
      if (persistedSessionError || !persistedSession.session) {
        throw persistedSessionError || new Error("Sign-in session could not be persisted. Please try again.");
      }

      // Also hand the session to the server so the SSR auth cookies are
      // definitely present when MFA and protected routes load in a new document.
      const handoffResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        }),
      });
      if (!handoffResponse.ok) {
        const handoffBody = await handoffResponse.json().catch(() => ({}));
        throw new Error(handoffBody.error || "Sign-in session could not be established.");
      }
      try {
        window.sessionStorage.setItem(BROWSER_SESSION_HANDOFF_KEY, JSON.stringify({
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        }));
      } catch {
        // The server cookie handoff remains the primary mechanism.
      }

      // Keep only the non-sensitive email for existing UI copy. Supabase owns
      // the authenticated session and password handling.
      saveDemoValue("email", values.email.trim());
      saveDemoValue("mfaVerified", false);
      const requestedPath = new URLSearchParams(window.location.search).get("next");
      const nextPath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/dashboard";
      // Use a document navigation after the cookie is written so the MFA page
      // always starts with a fresh client that can read the persisted session.
      const postAuthPath = `/post-auth?next=${encodeURIComponent(nextPath)}`;
      window.location.assign(`/mfa?next=${encodeURIComponent(postAuthPath)}`);
    } catch (error) {
      form.setError("root", {
        type: "server",
        message: error instanceof Error ? error.message : "Unable to sign in.",
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  // TITLE: DRAFT SESSION VALUES
  const emailField = form.register("email");
  const passwordField = form.register("password");

  return (
    <AuthShell
      title="Welcome back"
      description="Access your workspace and keep everything moving in one place."
      asideTitle="Your workspace, connected."
      asideCopy="Stay on top of leads, members, visits and payments from one calm command centre."
      step={1}
      variant="login"
    >
      <motion.form
        onSubmit={form.handleSubmit(onSubmit)}
        className="auth-form"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <FormField label="Email address" error={form.formState.errors.email?.message}>
          <Input
            {...emailField}
            onChange={(event) => { emailField.onChange(event); saveDemoValue("emailDraft", event.target.value); }}
            type="email"
            placeholder="you@thecubicle.pk"
            autoComplete="email"
            leftIcon={<Mail size={17} />}
            className={form.formState.errors.email ? "has-error" : ""}
          />
        </FormField>
        <FormField label="Password" error={form.formState.errors.password?.message}>
          <Input
            {...passwordField}
            onChange={passwordField.onChange}
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            leftIcon={<LockKeyhole size={17} />}
            className={form.formState.errors.password ? "has-error" : ""}
          />
        </FormField>
        <div className="form-meta">
          <Link href="/forgot-password" className="text-link">Forgot password?</Link>
        </div>
        {form.formState.errors.root?.message ? <p className="field-error">{form.formState.errors.root.message}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={isSigningIn}>
          {isSigningIn ? <><LoaderCircle size={13} className="sign-in-spinner" /> Signing in...</> : "Sign in"}
        </Button>
      </motion.form>
    </AuthShell>
  );
}
