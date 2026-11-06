"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CirclePlus, LoaderCircle, Mail, X } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteSupabaseAdminUser } from "@/lib/supabase/admin-users";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function emailName(email: string) {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim() || "Employee";
}

export default function OwnerInviteEmployeesPage() {
  const router = useRouter();
  const [emails, setEmails] = useState([""]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const nextPath = safeNextPath(typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next"));
  const normalizedEmails = useMemo(() => emails.map((email) => email.trim().toLowerCase()).filter(Boolean), [emails]);

  const updateEmail = (index: number, value: string) => setEmails((current) => current.map((email, itemIndex) => itemIndex === index ? value : email));
  const addEmail = () => setEmails((current) => [...current, ""]);
  const removeEmail = (index: number) => setEmails((current) => current.length === 1 ? [""] : current.filter((_email, itemIndex) => itemIndex !== index));

  const finish = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError("");
    const uniqueEmails = [...new Set(normalizedEmails)];
    if (uniqueEmails.some((email) => !/^\S+@\S+\.\S+$/.test(email))) {
      setError("Enter valid employee email addresses.");
      return;
    }

    setSaving(true);
    try {
      for (const email of uniqueEmails) await inviteSupabaseAdminUser({ name: emailName(email), email, roleKey: "editor" });
      const response = await fetch("/api/onboarding/complete", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Onboarding could not be completed.");
      router.replace(nextPath);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "The employee invitations could not be sent.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      title="Invite your employees."
      description="Add employee emails now or skip this step and invite them later from Employees & Access."
      asideTitle="Bring the team in."
      asideCopy="Employees create their own password from the invitation link and go straight to the dashboard after MFA."
      step={3}
      variant="login"
    >
      <form className="auth-form" onSubmit={finish}>
        <div className="onboarding-invite-list">
          {emails.map((email, index) => <div className="onboarding-invite-row" key={`invite-${index}`}><Input value={email} onChange={(event) => updateEmail(index, event.target.value)} type="email" placeholder="employee@thecubicle.pk" autoComplete="email" leftIcon={<Mail size={17} />} /><button type="button" className="icon-action-btn" onClick={() => removeEmail(index)} aria-label={`Remove employee email ${index + 1}`}><X size={16} /></button></div>)}
        </div>
        <button type="button" className="back-link onboarding-add-invite" onClick={addEmail}><CirclePlus size={16} /> Add another employee</button>
        {error ? <p className="field-error">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={saving}>{saving ? <><LoaderCircle size={13} className="sign-in-spinner" /> Sending invitations...</> : <>Launch workspace <ArrowRight size={17} /></>}</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => void finish()} disabled={saving}>Skip for now</Button>
      </form>
    </AuthShell>
  );
}
