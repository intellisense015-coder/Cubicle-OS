"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { LoaderCircle } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { InputOTP } from "@/components/ui/input-otp";
import { saveDemoValue } from "@/lib/demo-session";

// TITLE: MFA PAGE
export default function MfaPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [validationState, setValidationState] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyCode = (submittedCode: string) => {
    if (submittedCode.length !== 6) {
      setValidationState("is-error");
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setValidationState("is-success");
    setIsVerifying(true);
    saveDemoValue("mfaCode", submittedCode);
    saveDemoValue("mfaVerified", true);
    router.push("/pin");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    verifyCode(code);
  };

  return (
    <AuthShell
      title="Verify your identity."
      description="Open your authenticator app and enter the current 6-digit code."
      asideTitle="A quiet second layer."
      asideCopy="Use your authenticator app to generate a 6-digit code and securely verify your identity."
      step={2}
      variant="login"
    >
      <motion.form
        onSubmit={handleSubmit}
        className="auth-form"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <InputOTP value={code} onChange={(nextCode) => { setCode(nextCode); setError(""); setValidationState(""); saveDemoValue("mfaCodeDraft", nextCode); if (nextCode.length === 6) verifyCode(nextCode); }} length={6} autoFocus pattern={REGEXP_ONLY_DIGITS} className={validationState} />
        {error ? <p className="field-error">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={isVerifying}>
          {isVerifying ? <><LoaderCircle size={13} className="sign-in-spinner" /> Verifying...</> : "Verify code"}
        </Button>
      </motion.form>
    </AuthShell>
  );
}
