"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { saveDemoValue } from "@/lib/demo-session";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";

// TITLE: FORGOT PASSWORD PAGE
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    setError("");
    setIsSending(true);
    saveDemoValue("recoveryEmail", email.trim());

    try {
      if (hasSupabaseConfig()) {
        const redirectTo = `${window.location.origin}/reset-password`;
        const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (resetError) throw resetError;
      }
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to start password recovery.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password."
      description="We’ll send a secure reset link to the email address on your workspace account."
      asideTitle="Keep moving."
      asideCopy="The reset link expires and can only be used to set a new password for the account that requested it."
    >
      <motion.form
        onSubmit={submit}
        className="auth-form"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <FormField label="Email address">
          <Input value={email} onChange={(event) => { setEmail(event.target.value); saveDemoValue("recoveryEmailDraft", event.target.value); }} type="email" placeholder="you@thecubicle.pk" autoComplete="email" leftIcon={<Mail size={17} />} required />
        </FormField>
        {submitted ? <p className="success-message">If an account exists for that address, a reset link has been sent. Check your inbox and spam folder.</p> : null}
        {error ? <p className="field-error">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={isSending}>
          {isSending ? "Sending…" : submitted ? "Send again" : "Send reset link"} <ArrowRight size={17} />
        </Button>
        <Link href="/login" className="back-link"><ArrowLeft size={15} /> Return to sign in</Link>
      </motion.form>
    </AuthShell>
  );
}
