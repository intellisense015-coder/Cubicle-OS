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

// TITLE: FORGOT PASSWORD PAGE
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = (event) => {
    event.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    saveDemoValue("recoveryEmail", email.trim());
    setSubmitted(true);
  };

  return (
    <AuthShell
      title="Reset your password."
      description="We’ll prepare a secure reset link for your invited workspace account."
      asideTitle="Keep moving."
      asideCopy="This demo records the recovery request in session storage. Supabase email recovery will replace it when the backend is connected."
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
        {submitted ? <p className="success-message">Demo reset link prepared for {email}.</p> : null}
        <Button type="submit" size="lg" className="w-full">
          {submitted ? "Send again" : "Prepare reset link"} <ArrowRight size={17} />
        </Button>
        <Link href="/login" className="back-link"><ArrowLeft size={15} /> Return to sign in</Link>
      </motion.form>
    </AuthShell>
  );
}
