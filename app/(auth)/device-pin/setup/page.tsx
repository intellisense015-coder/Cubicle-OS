"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { InputOTP } from "@/components/ui/input-otp";
import { createDeviceKeyPair, saveDeviceMaterial } from "@/lib/device-crypto";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default function DevicePinSetupPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [nextPath, setNextPath] = useState("/dashboard");

  useEffect(() => {
    let cancelled = false;
    const requestedPath = safeNextPath(new URLSearchParams(window.location.search).get("next"));
    setNextPath(requestedPath);

    const checkState = async () => {
      try {
        const response = await fetch("/api/auth/state", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (response.status === 401) return router.replace("/login");
        if (response.status === 403 && payload?.mfaRequired) return router.replace(`/mfa?next=${encodeURIComponent(`/device-pin/setup?next=${encodeURIComponent(requestedPath)}`)}`);
        if (!response.ok) throw new Error(payload?.error || "Unable to prepare trusted-device setup.");
        if (payload?.device?.status === "reauth_required") {
          await fetch("/api/auth/device/revoke", { method: "POST", credentials: "include" }).catch(() => undefined);
          return router.replace("/login");
        }
        if (payload?.device?.status === "unlocked") return router.replace(requestedPath);
        if (payload?.device?.status === "pin_required") return router.replace(`/pin-lock?next=${encodeURIComponent(requestedPath)}`);
      } catch (checkError) {
        if (!cancelled) setError(checkError instanceof Error ? checkError.message : "Unable to prepare trusted-device setup.");
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    };

    void checkState();
    return () => { cancelled = true; };
  }, [router]);

  const submit = async () => {
    if (pin.length !== 4 || confirmation.length !== 4) {
      setError("Create and confirm a 4-digit PIN.");
      return;
    }
    if (pin !== confirmation) {
      setError("The PINs do not match.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      const keyMaterial = await createDeviceKeyPair(pin);
      const response = await fetch("/api/auth/device/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, publicKeyJwk: keyMaterial.publicKeyJwk, deviceLabel: "This browser" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.deviceSessionId) throw new Error(payload?.error || "Trusted-device setup could not be completed.");
      await saveDeviceMaterial({
        deviceSessionId: payload.deviceSessionId,
        publicKeyJwk: keyMaterial.publicKeyJwk,
        encryptedPrivateKey: keyMaterial.encryptedPrivateKey,
      });
      router.replace(`/post-auth?next=${encodeURIComponent(nextPath)}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Trusted-device setup could not be completed.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthShell
      title="Create your quick-access PIN."
      description="Use the same 4-digit PIN on every browser for this account."
      asideTitle="A private shortcut."
      asideCopy="The account stores only a protected PIN verifier. Each browser keeps its own encrypted device key."
      step={3}
      variant="login"
    >
      <div className="auth-form">
        {isChecking ? <div className="auth-form" aria-live="polite"><LoaderCircle size={24} className="sign-in-spinner" /><p className="muted-copy">Preparing trusted-device setup...</p></div> : null}
        {!isChecking ? <>
          <label className="form-field-label">Create PIN<InputOTP value={pin} onChange={(value) => { setPin(value); setError(""); }} length={4} masked autoFocus inputMode="numeric" /></label>
          <label className="form-field-label">Confirm PIN<InputOTP value={confirmation} onChange={(value) => { setConfirmation(value); setError(""); }} length={4} masked inputMode="numeric" /></label>
          {error ? <p className="field-error">{error}</p> : null}
          <Button type="button" size="lg" className="w-full" onClick={() => void submit()} disabled={isSaving}>{isSaving ? <><LoaderCircle size={13} className="sign-in-spinner" /> Securing browser...</> : "Continue to workspace"}</Button>
        </> : null}
      </div>
    </AuthShell>
  );
}
