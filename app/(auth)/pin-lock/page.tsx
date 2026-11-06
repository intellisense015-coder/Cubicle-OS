"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { InputOTP } from "@/components/ui/input-otp";
import { clearDeviceMaterial, DeviceCryptoError, signDeviceChallenge, unlockDeviceMaterial } from "@/lib/device-crypto";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default function PinLockPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
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
        if (response.status === 403 && payload?.mfaRequired) return router.replace(`/mfa?next=${encodeURIComponent(`/pin-lock?next=${encodeURIComponent(requestedPath)}`)}`);
        if (!response.ok) throw new Error(payload?.error || "Unable to verify this trusted browser.");
        if (payload?.device?.status === "reauth_required") {
          await fetch("/api/auth/device/revoke", { method: "POST", credentials: "include" }).catch(() => undefined);
          return router.replace("/login");
        }
        if (payload?.device?.status === "not_registered") return router.replace(`/device-pin/setup?next=${encodeURIComponent(requestedPath)}`);
        if (payload?.device?.status === "unlocked") return router.replace(requestedPath);
      } catch (checkError) {
        if (!cancelled) setError(checkError instanceof Error ? checkError.message : "Unable to verify this trusted browser.");
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    };

    void checkState();
    return () => { cancelled = true; };
  }, [router]);

  const unlock = async () => {
    if (pin.length !== 4 || isUnlocking) {
      if (pin.length !== 4) setError("Enter your 4-digit PIN.");
      return;
    }
    setError("");
    setIsUnlocking(true);
    let dashboardNavigationStarted = false;
    try {
      const challengeResponse = await fetch("/api/auth/device/challenge", { method: "POST" });
      const challengePayload = await challengeResponse.json().catch(() => null);
      if (challengeResponse.status === 401) return router.replace("/login");
      if (challengeResponse.status === 409) return router.replace(`/device-pin/setup?next=${encodeURIComponent(nextPath)}`);
      if (!challengeResponse.ok) throw new Error(challengePayload?.error || "The unlock challenge could not be created.");

      let material;
      try {
        material = await unlockDeviceMaterial(pin);
      } catch (unlockMaterialError) {
        if (unlockMaterialError instanceof DeviceCryptoError && unlockMaterialError.code === "missing") {
          await fetch("/api/auth/device/revoke", { method: "POST", credentials: "include" }).catch(() => undefined);
          await clearDeviceMaterial();
          return router.replace(`/device-pin/setup?next=${encodeURIComponent(nextPath)}`);
        }
        if (!(unlockMaterialError instanceof DeviceCryptoError) || unlockMaterialError.code !== "invalid_pin") {
          setPin("");
          throw new Error("This browser's trusted-device key is unavailable. Please set it up again.");
        }
        const failureResponse = await fetch("/api/auth/device/failure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId: challengePayload.challengeId }),
        });
        const failurePayload = await failureResponse.json().catch(() => null);
        setPin("");
        if (failurePayload?.locked) {
          await clearDeviceMaterial();
          return router.replace("/login");
        }
        throw new Error(`Incorrect PIN. ${Math.max(0, 5 - Number(failurePayload?.failedAttempts || 0))} attempts remaining.`);
      }

      if (material.deviceSessionId !== challengePayload.deviceSessionId) {
        await fetch("/api/auth/device/revoke", { method: "POST", credentials: "include" }).catch(() => undefined);
        await clearDeviceMaterial();
        return router.replace(`/device-pin/setup?next=${encodeURIComponent(nextPath)}`);
      }

      const signature = await signDeviceChallenge(material.privateKey, challengePayload.challenge);
      const unlockResponse = await fetch("/api/auth/device/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, challengeId: challengePayload.challengeId, challenge: challengePayload.challenge, signature }),
      });
      const unlockPayload = await unlockResponse.json().catch(() => null);
      if (unlockResponse.status === 409) return router.replace(`/device-pin/setup?next=${encodeURIComponent(nextPath)}`);
      if (unlockResponse.status === 401) {
        setPin("");
        if (unlockPayload?.locked) {
          await clearDeviceMaterial();
          return router.replace("/login");
        }
        throw new Error(unlockPayload?.error || "Incorrect PIN.");
      }
      if (!unlockResponse.ok) throw new Error(unlockPayload?.error || "The browser could not be unlocked.");
      dashboardNavigationStarted = true;
      router.replace(nextPath);
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "The browser could not be unlocked.");
    } finally {
      if (!dashboardNavigationStarted) setIsUnlocking(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back."
      description="Enter your 4-digit PIN to unlock this trusted browser."
      asideTitle="Quick access, securely held."
      asideCopy="The account verifies a protected PIN verifier, then the OS verifies this browser's encrypted device key."
      step={3}
      variant="login"
    >
      <div className="auth-form">
        {isChecking ? <div className="auth-form" aria-live="polite"><LoaderCircle size={24} className="sign-in-spinner" /><p className="muted-copy">Checking trusted-device status...</p></div> : <>
          <div className="pin-lock-icon"><LockKeyhole size={24} /></div>
          <label className="form-field-label">4-digit PIN<InputOTP value={pin} onChange={(value) => { setPin(value); setError(""); }} length={4} masked autoFocus inputMode="numeric" /></label>
          {error ? <p className="field-error">{error}</p> : null}
          <Button type="button" size="lg" className="w-full" onClick={() => void unlock()} loading={isUnlocking}>{isUnlocking ? "Unlocking..." : "Unlock workspace"}</Button>
        </>}
      </div>
    </AuthShell>
  );
}
