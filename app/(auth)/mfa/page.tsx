"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { LoaderCircle } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { InputOTP } from "@/components/ui/input-otp";
import { saveDemoValue } from "@/lib/demo-session";
import { BROWSER_SESSION_HANDOFF_KEY, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { enrollSupabaseTotp, removeUnverifiedTotpFactors } from "@/lib/supabase/mfa";

type MfaMode = "loading" | "enroll" | "verify" | "error";

async function waitForBrowserSession(
  supabase: SupabaseClient,
  isCancelled: () => boolean,
): Promise<Session | null> {
  for (let attempt = 0; attempt < 15 && !isCancelled(); attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session;
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }

  // Recover the same-tab handoff if the browser did not expose the SSR cookie
  // to the newly loaded MFA document yet.
  try {
    const rawHandoff = window.sessionStorage.getItem(BROWSER_SESSION_HANDOFF_KEY);
    if (rawHandoff) {
      const handoff = JSON.parse(rawHandoff) as { access_token?: unknown; refresh_token?: unknown };
      if (typeof handoff.access_token === "string" && typeof handoff.refresh_token === "string") {
        const { data, error } = await supabase.auth.setSession({
          access_token: handoff.access_token,
          refresh_token: handoff.refresh_token,
        });
        if (!error && data.session) return data.session;
      }
    }
  } catch {
    // Fall through to the normal unauthenticated redirect.
  }

  return null;
}

function getPostAuthPath(value: string | null) {
  if (value?.startsWith("/post-auth") && !value.startsWith("//")) return value;
  const nextPath = value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
  return `/post-auth?next=${encodeURIComponent(nextPath)}`;
}

function isFactorNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; code?: unknown };
  return /factor[_ ]not[_ ]found/i.test(String(candidate.message || candidate.code || ""));
}

async function prepareTotpEnrollment(supabase: ReturnType<typeof getSupabaseBrowserClient>) {
  await removeUnverifiedTotpFactors(supabase);
  // Enrollment returns the QR code and secret. The challenge is created only
  // after the user has scanned the QR code and submits the current code.
  return { enrollmentData: await enrollSupabaseTotp(supabase) };
}

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
    const postAuthPath = getPostAuthPath(requestedPath);
    returnPathRef.current = postAuthPath;
    setReturnPath(postAuthPath);

    const prepareMfa = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const session = await waitForBrowserSession(supabase, () => cancelled);

        if (!session) {
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
          let activeVerifiedFactorId = verifiedFactor.id;
          let { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
            factorId: verifiedFactor.id,
          });

          if (challengeError && isFactorNotFoundError(challengeError)) {
            const { error: removeStaleError } = await supabase.auth.mfa.unenroll({ factorId: activeVerifiedFactorId });
            if (removeStaleError && !isFactorNotFoundError(removeStaleError)) throw removeStaleError;
            const enrollment = await prepareTotpEnrollment(supabase);
            if (!cancelled) {
              setFactorId(enrollment.enrollmentData.id);
              setChallengeId("");
              setQrCode(enrollment.enrollmentData.totp.qr_code);
              setSecret(enrollment.enrollmentData.totp.secret);
              setMode("enroll");
            }
            return;
          }
          if (challengeError || !challengeData) throw challengeError || new Error("The MFA challenge could not be created.");

          if (!cancelled) {
            setFactorId(activeVerifiedFactorId);
            setChallengeId(challengeData.id);
            setMode("verify");
          }
          return;
        }

        // Remove every stale unverified factor before starting a fresh setup.
        const { enrollmentData } = await prepareTotpEnrollment(supabase);

        if (!cancelled) {
          setFactorId(enrollmentData.id);
          setChallengeId("");
          setQrCode(enrollmentData.totp.qr_code);
          setSecret(enrollmentData.totp.secret);
          setMode("enroll");
        }
      } catch (prepareError) {
        if (!cancelled) {
          if (isFactorNotFoundError(prepareError)) {
            try {
              const enrollment = await prepareTotpEnrollment(getSupabaseBrowserClient());
              if (!cancelled) {
                setFactorId(enrollment.enrollmentData.id);
                setChallengeId("");
                setQrCode(enrollment.enrollmentData.totp.qr_code);
                setSecret(enrollment.enrollmentData.totp.secret);
                setMode("enroll");
              }
              return;
            } catch (recoveryError) {
              if (!cancelled) {
                setError(recoveryError instanceof Error ? recoveryError.message : "Unable to prepare MFA.");
                setMode("error");
              }
              return;
            }
          }

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

    if (!factorId || (mode !== "enroll" && !challengeId)) {
      setValidationState("is-error");
      setError("The MFA challenge is not ready. Refresh and try again.");
      return;
    }

    setValidationState("");
    setError("");
    setIsVerifying(true);

    try {
      const supabase = getSupabaseBrowserClient();
      let activeChallengeId = challengeId;
      if (mode === "enroll") {
        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
        if (challengeError || !challengeData) throw challengeError || new Error("The MFA challenge could not be created.");
        activeChallengeId = challengeData.id;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: activeChallengeId,
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

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw sessionError || new Error("MFA session could not be established. Please try again.");
      }

      const handoffResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        }),
      });
      if (!handoffResponse.ok) {
        const handoffBody = await handoffResponse.json().catch(() => ({}));
        throw new Error(handoffBody.error || "MFA session could not be established.");
      }

      setValidationState("is-success");
      saveDemoValue("mfaVerified", true);
      window.location.assign(returnPathRef.current || returnPath);
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
