"use client";

import Link from "next/link";
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

// TITLE: PIN PAGE
export default function PinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [validationState, setValidationState] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyPin = (submittedPin: string) => {
    if (submittedPin.length !== 4) {
      setValidationState("is-error");
      setError("Enter your 4-digit PIN to continue.");
      return;
    }
    setValidationState("is-success");
    setIsVerifying(true);
    saveDemoValue("pin", submittedPin);
    saveDemoValue("pinVerified", true);
    router.push("/dashboard");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    verifyPin(pin);
  };

  return (
    <AuthShell
      title="Unlock your OS."
      description="Enter your private 4-digit PIN for the final security check."
      asideTitle="Your personal lock."
      asideCopy="Enter your 4-digit PIN to securely unlock your workspace."
      step={3}
      variant="login"
    >
      <motion.form
        onSubmit={handleSubmit}
        className="auth-form"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <InputOTP value={pin} onChange={(nextPin) => { setPin(nextPin); setError(""); setValidationState(""); saveDemoValue("pinDraft", nextPin); if (nextPin.length === 4) verifyPin(nextPin); }} length={4} masked autoFocus inputMode="numeric" pattern={REGEXP_ONLY_DIGITS} className={validationState} />
        {error ? <p className="field-error">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={isVerifying}>
          {isVerifying ? <><LoaderCircle size={13} className="sign-in-spinner" /> Unlocking...</> : "Unlock workspace"}
        </Button>
        <Link href="/forgot-pin" className="text-link centered-link">Forgot PIN?</Link>
      </motion.form>
    </AuthShell>
  );
}
