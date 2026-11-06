"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, UserRound } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default function OwnerCompanyOnboardingPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const nextPath = safeNextPath(typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next"));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, phone }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "The owner profile could not be saved.");
      router.replace(`/onboarding/invite-employees?next=${encodeURIComponent(nextPath)}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The owner profile could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      title="Tell us about the owner."
      description="Complete the primary owner profile before launching the workspace."
      asideTitle="Set the foundation."
      asideCopy="This information is stored in the Cubicle OS profile and is used for workspace administration."
      step={3}
      variant="login"
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="form-field-label">First name<Input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" autoComplete="given-name" leftIcon={<UserRound size={17} />} required /></label>
        <label className="form-field-label">Last name<Input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" autoComplete="family-name" required /></label>
        <label className="form-field-label">Owner email<Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="owner@thecubicle.pk" autoComplete="email" required /></label>
        <label className="form-field-label">Owner phone<Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0300 0000000 or +92 300 0000000" autoComplete="tel" required /></label>
        {error ? <p className="field-error">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={saving}>{saving ? <><LoaderCircle size={13} className="sign-in-spinner" /> Saving profile...</> : <>Continue <ArrowRight size={17} /></>}</Button>
      </form>
    </AuthShell>
  );
}
