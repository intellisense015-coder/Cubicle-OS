"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP } from "@/components/ui/input-otp";
import { FormField } from "@/components/ui/form-field";
import { saveDemoValue } from "@/lib/demo-session";

// TITLE: FORGOT PIN PAGE
export default function ForgotPinPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const sendCode = (event) => {
    event.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Enter the email address attached to your account.");
      return;
    }
    saveDemoValue("recoveryEmail", email.trim());
    setSent(true);
    setError("");
  };

  const verifyCode = (event) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit email code.");
      return;
    }
    saveDemoValue("pinRecoveryCode", code);
    router.push("/reset-pin");
  };

  return (
    <AuthShell
      title="Recover your PIN."
      description="Verify your invited account by email, then choose a new 4-digit PIN."
      asideTitle="A simple reset."
      asideCopy="The production flow will issue a time-limited email OTP. This demo accepts any six digits and stores them in the current session."
    >
      <motion.form
        onSubmit={sent ? verifyCode : sendCode}
        className="auth-form"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        {!sent ? (
          <FormField label="Account email">
            <Input value={email} onChange={(event) => { setEmail(event.target.value); saveDemoValue("recoveryEmailDraft", event.target.value); }} type="email" placeholder="you@thecubicle.pk" autoComplete="email" leftIcon={<MailCheck size={17} />} required />
          </FormField>
        ) : (
          <>
            <div className="instruction-card">
              <span className="instruction-icon"><MailCheck size={18} /></span>
              <div>
                <strong>Check your inbox</strong>
                <span>We sent a demo code to {email}.</span>
              </div>
            </div>
            <InputOTP value={code} onChange={(nextCode) => { setCode(nextCode); saveDemoValue("pinRecoveryCodeDraft", nextCode); }} length={6} label="Email verification code" autoFocus />
          </>
        )}
        {error ? <p className="field-error">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full">
          {sent ? "Verify email code" : "Send email code"} <ArrowRight size={17} />
        </Button>
        <Link href="/login" className="back-link"><ArrowLeft size={15} /> Return to sign in</Link>
      </motion.form>
    </AuthShell>
  );
}
