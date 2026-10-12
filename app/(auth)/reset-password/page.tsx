"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { saveDemoValue } from "@/lib/demo-session";

// TITLE: RESET PASSWORD PAGE
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (password.length < 6) return setError("Use at least 6 characters.");
    if (password !== confirmPassword) return setError("The passwords do not match.");
    saveDemoValue("password", password);
    router.push("/login");
  };

  return (
    <AuthShell title="Set a new password." description="Create a new password for your workspace account." asideTitle="A fresh start." asideCopy="This demo saves the new value only in session storage. Supabase will handle the real password update later.">
      <motion.form onSubmit={submit} className="auth-form" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}>
        <FormField label="New password"><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="At least 6 characters" autoComplete="new-password" leftIcon={<LockKeyhole size={17} />} required /></FormField>
        <FormField label="Confirm password"><Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" placeholder="Repeat your new password" autoComplete="new-password" leftIcon={<LockKeyhole size={17} />} required /></FormField>
        {error ? <p className="field-error">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full">Save password <ArrowRight size={17} /></Button>
        <Link href="/login" className="back-link"><ArrowLeft size={15} /> Return to sign in</Link>
      </motion.form>
    </AuthShell>
  );
}
