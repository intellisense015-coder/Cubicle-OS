"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, KeyRound } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { InputOTP } from "@/components/ui/input-otp";
import { saveDemoValue } from "@/lib/demo-session";

// TITLE: RESET PIN PAGE
export default function ResetPinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (pin.length !== 4 || confirmPin.length !== 4) return setError("Enter both 4-digit PIN fields.");
    if (pin !== confirmPin) return setError("The PINs do not match.");
    saveDemoValue("pin", pin);
    saveDemoValue("pinVerified", false);
    router.push("/login");
  };

  return (
    <AuthShell
      title="Choose a new PIN."
      description="Set a new 4-digit PIN for your next secure sign-in."
      asideTitle="Back in control."
      asideCopy="The new PIN is saved in this demo session and will be replaced by a secure server-side recovery flow later."
    >
      <motion.form onSubmit={submit} className="auth-form" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}>
        <div className="instruction-card">
          <span className="instruction-icon"><KeyRound size={18} /></span>
          <div><strong>Make it memorable</strong><span>Use exactly 4 digits.</span></div>
        </div>
        <InputOTP value={pin} onChange={(nextPin) => { setPin(nextPin); saveDemoValue("newPinDraft", nextPin); }} length={4} label="New PIN" masked autoFocus inputMode="numeric" />
        <InputOTP value={confirmPin} onChange={(nextPin) => { setConfirmPin(nextPin); saveDemoValue("confirmPinDraft", nextPin); }} length={4} label="Confirm new PIN" masked inputMode="numeric" />
        {error ? <p className="field-error">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full">Save new PIN <ArrowRight size={17} /></Button>
        <Link href="/login" className="back-link"><ArrowLeft size={15} /> Return to sign in</Link>
      </motion.form>
    </AuthShell>
  );
}
