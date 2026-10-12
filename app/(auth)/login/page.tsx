"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

// TITLE: SIGN IN VALIDATION
const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Use at least 6 characters for the demo password.")
});

// TITLE: SIGN IN PAGE
export default function SignInPage() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const form = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur"
  });

  const onSubmit = (values) => {
    setIsSigningIn(true);
    saveDemoValue("email", values.email);
    saveDemoValue("password", values.password);
    saveDemoValue("mfaVerified", false);
    saveDemoValue("pinVerified", false);
    router.push("/mfa");
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
            onChange={(event) => { passwordField.onChange(event); saveDemoValue("passwordDraft", event.target.value); }}
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
        <Button type="submit" size="lg" className="w-full" disabled={isSigningIn}>
          {isSigningIn ? <><LoaderCircle size={13} className="sign-in-spinner" /> Signing in...</> : "Sign in"}
        </Button>
      </motion.form>
    </AuthShell>
  );
}
