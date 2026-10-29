"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { LoaderCircle } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { InputOTP } from "@/components/ui/input-otp";
import { saveDemoValue } from "@/lib/demo-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type MfaMode = "loading" | "enroll" | "verify" | "error";

// TITLE: MFA PAGE
export default function MfaPage() {
  const router = useRouter();
  const [mode, setMode] = useState<MfaMode>("loading");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [validationState, setValidationState] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [returnPath, setReturnPath] = useState("/dashboard");
  const returnPathRef = useRef("/dashboard");

  useEffect(() => {
    let cancelled = false;
    const requestedPath = new URLSearchParams(window.location.search).get("next");
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
      returnPathRef.current = requestedPath;
      setReturnPath(requestedPath);
    }

    const prepareMfa = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData.session) {
          router.replace("/login");
          return;
        }

        const { data: assuranceData, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;

        if (assuranceData.currentLevel === "aal2") {
          router.replace(returnPathRef.current);
          return;
        }

        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const verifiedFactor = factorsData.totp.find((factor) => factor.status === "verified");

        if (verifiedFactor) {
          const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
            factorId: verifiedFactor.id,
          });
          if (challengeError) throw challengeError;

          if (!cancelled) {
            setFactorId(verifiedFactor.id);
            setChallengeId(challengeData.id);
            setMode("verify");
          }
          return;
        }

        // An unfinished enrollment has no reusable QR secret. Remove it so a
        // refreshed setup flow does not accumulate orphaned factors.
        const unfinishedFactor = factorsData.all.find(
          (factor) => factor.factor_type === "totp" && factor.status === "unverified",
        );
        if (unfinishedFactor) {
          const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: unfinishedFactor.id });
          if (unenrollError) throw unenrollError;
        }

        const { data: enrollmentData, error: enrollmentError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Cubicle OS Authenticator",
        });
        if (enrollmentError) throw enrollmentError;

        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: enrollmentData.id,
        });
        if (challengeError) throw challengeError;

        if (!cancelled) {
          setFactorId(enrollmentData.id);
          setChallengeId(challengeData.id);
          setQrCode(enrollmentData.totp.qr_code);
          setSecret(enrollmentData.totp.secret);
          setMode("enroll");
        }
      } catch (prepareError) {
        if (!cancelled) {
          setError(prepareError instanceof Error ? prepareError.message : "Unable to prepare MFA.");
          setMode("error");
        }
      }
    };

    void prepareMfa();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const verifyCode = async (submittedCode: string) => {
    if (submittedCode.length !== 6) {
      setValidationState("is-error");
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    if (!factorId || !challengeId) {
      setValidationState("is-error");
      setError("The MFA challenge is not ready. Refresh and try again.");
      return;
    }

    setValidationState("");
    setError("");
    setIsVerifying(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: submittedCode,
      });

      if (verifyError) {
        setValidationState("is-error");
        setError(verifyError.message);
        return;
      }

      const { data: assuranceData, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assuranceData.currentLevel !== "aal2") {
        throw new Error("MFA verification did not create an AAL2 session. Refresh and try again.");
      }

      setValidationState("is-success");
      saveDemoValue("mfaVerified", true);
      router.push(returnPathRef.current || returnPath);
    } catch (verifyException) {
      setValidationState("is-error");
      setError(verifyException instanceof Error ? verifyException.message : "Unable to verify MFA.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void verifyCode(code);
  };

  const title = mode === "enroll" ? "Set up your authenticator." : "Verify your identity.";
  const description = mode === "enroll"
    ? "Scan the QR code with your authenticator app, then enter the 6-digit code it generates."
    : "Open your authenticator app and enter the current 6-digit code.";
  const qrImageSource = qrCode.startsWith("data:")
    ? qrCode
    : `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`;

  return (
    <AuthShell
      title={title}
      description={description}
      asideTitle="A quiet second layer."
      asideCopy="Use your authenticator app to generate a 6-digit code and securely verify your identity."
      step={2}
      variant="login"
    >
      {mode === "loading" ? (
        <div className="auth-form" aria-live="polite">
          <LoaderCircle size={24} className="sign-in-spinner" />
          <p className="muted-copy">Preparing secure MFA...</p>
        </div>
      ) : mode === "error" ? (
        <div className="auth-form" aria-live="assertive">
          <p className="field-error">{error}</p>
          <Button type="button" size="lg" className="w-full" onClick={() => window.location.reload()}>Try again</Button>
        </div>
      ) : (
        <motion.form
          onSubmit={handleSubmit}
          className="auth-form"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          {mode === "enroll" ? (
            <div style={{ display: "grid", gap: "0.8rem", justifyItems: "center", textAlign: "center" }}>
              <img
                src={qrImageSource}
                alt="Scan this QR code with your authenticator app"
                width={220}
                height={220}
                style={{ background: "white", borderRadius: "0.75rem", padding: "0.75rem" }}
              />
              <p className="muted-copy">Can&apos;t scan it? Enter this setup key manually:</p>
              <code style={{ wordBreak: "break-all" }}>{secret}</code>
            </div>
          ) : null}
          <InputOTP
            value={code}
            onChange={(nextCode) => { setCode(nextCode); setError(""); setValidationState(""); }}
            length={6}
            autoFocus
            pattern={REGEXP_ONLY_DIGITS}
            className={validationState}
          />
          {error ? <p className="field-error">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={isVerifying}>
            {isVerifying ? <><LoaderCircle size={13} className="sign-in-spinner" /> Verifying...</> : mode === "enroll" ? "Enable authenticator" : "Verify code"}
          </Button>
        </motion.form>
      )}
    </AuthShell>
  );
}
