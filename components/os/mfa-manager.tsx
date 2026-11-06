"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Button } from "@/components/ui/button";
import { InputOTP } from "@/components/ui/input-otp";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { enrollSupabaseTotp, removeUnverifiedTotpFactors } from "@/lib/supabase/mfa";
import { useRouter } from "next/navigation";

type MfaFactor = { id: string; factor_type?: string; status?: string };
type MfaAction = "add" | "replace" | "remove";
type MfaMode = "loading" | "ready" | "confirm-current" | "verify-new" | "success" | "error";

interface MfaManagerProps {
  onClose: () => void;
  onStatusChange: (enabled: boolean) => void;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Real Supabase TOTP management for the signed-in user. */
export function MfaManager({ onClose, onStatusChange }: MfaManagerProps) {
  const router = useRouter();
  const [mode, setMode] = useState<MfaMode>("loading");
  const [action, setAction] = useState<MfaAction | null>(null);
  const [verifiedFactors, setVerifiedFactors] = useState<MfaFactor[]>([]);
  const [currentFactorId, setCurrentFactorId] = useState("");
  const [currentChallengeId, setCurrentChallengeId] = useState("");
  const [newFactorId, setNewFactorId] = useState("");
  const [newChallengeId, setNewChallengeId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const loadFactors = useCallback(async () => {
    setMode("loading");
    setError("");
    try {
      const { data, error: factorsError } = await getSupabaseBrowserClient().auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const verified = (data?.totp || []).filter((factor) => factor.status === "verified");
      setVerifiedFactors(verified);
      onStatusChange(verified.length > 0);
      setMode("ready");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load your authenticator status."));
      setMode("error");
    }
  }, [onStatusChange]);

  useEffect(() => { void loadFactors(); }, [loadFactors]);

  const resetCode = () => {
    setCode("");
    setError("");
  };

  const beginCurrentVerification = async (nextAction: "replace" | "remove") => {
    if (!verifiedFactors.length || isBusy) return;
    setIsBusy(true);
    setAction(nextAction);
    setError("");
    try {
      const factorId = verifiedFactors[0].id;
      const { data, error: challengeError } = await getSupabaseBrowserClient().auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      setCurrentFactorId(factorId);
      setCurrentChallengeId(data.id);
      resetCode();
      setMode("confirm-current");
    } catch (challengeException) {
      setError(getErrorMessage(challengeException, "Unable to start MFA confirmation."));
    } finally {
      setIsBusy(false);
    }
  };

  const beginEnrollment = async (nextAction: MfaAction, alreadyBusy = false) => {
    if (isBusy && !alreadyBusy) return;
    if (!alreadyBusy) setIsBusy(true);
    setAction(nextAction);
    setError("");
    setSuccessMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      await removeUnverifiedTotpFactors(supabase);

      const enrollment = await enrollSupabaseTotp(supabase);

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
      if (challengeError) throw challengeError;
      setNewFactorId(enrollment.id);
      setNewChallengeId(challenge.id);
      setQrCode(enrollment.totp.qr_code);
      setSecret(enrollment.totp.secret);
      resetCode();
      setMode("verify-new");
    } catch (enrollmentException) {
      setError(getErrorMessage(enrollmentException, "Unable to prepare authenticator setup."));
    } finally {
      if (!alreadyBusy) setIsBusy(false);
    }
  };

  const removeVerifiedFactors = async () => {
    const supabase = getSupabaseBrowserClient();
    for (const factor of verifiedFactors) {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) throw unenrollError;
    }
    const { data: remaining, error: remainingError } = await supabase.auth.mfa.listFactors();
    if (remainingError) throw remainingError;
    if ((remaining?.totp || []).some((factor) => factor.status === "verified")) {
      throw new Error("The authenticator could not be fully removed. No security settings were confirmed as complete.");
    }
  };

  const verifyCurrentCode = async () => {
    if (code.length !== 6 || !currentFactorId || !currentChallengeId || !action) {
      setError("Enter the 6-digit code from your current authenticator app.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: currentFactorId, challengeId: currentChallengeId, code });
      if (verifyError) throw verifyError;

      if (action === "remove") {
        await removeVerifiedFactors();
        onStatusChange(false);
        setMode("success");
        setSuccessMessage("MFA was removed. You will be signed out and asked to set it up again before entering the OS.");
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      await beginEnrollment("replace", true);
    } catch (verifyException) {
      setError(getErrorMessage(verifyException, "The current authenticator code could not be verified."));
    } finally {
      setIsBusy(false);
    }
  };

  const verifyNewCode = async () => {
    if (code.length !== 6 || !newFactorId || !newChallengeId || !action) {
      setError("Enter the 6-digit code from the authenticator you just added.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: newFactorId, challengeId: newChallengeId, code });
      if (verifyError) throw verifyError;
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== "aal2") throw new Error("MFA verification did not create an AAL2 session.");

      if (action === "replace") await removeVerifiedFactors();
      onStatusChange(true);
      setMode("success");
      setSuccessMessage(action === "replace" ? "Your authenticator was replaced successfully." : "Your authenticator was connected successfully.");
    } catch (verifyException) {
      setError(getErrorMessage(verifyException, "The new authenticator code could not be verified."));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void (mode === "confirm-current" ? verifyCurrentCode() : verifyNewCode());
  };

  const qrImageSource = qrCode.startsWith("data:") ? qrCode : `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`;

  if (mode === "loading") {
    return <div className="dialog-content mfa-manager" aria-live="polite"><LoaderCircle size={24} className="sign-in-spinner" /><p className="muted-copy">Checking your authenticator status...</p></div>;
  }

  if (mode === "error") {
    return <div className="dialog-content mfa-manager" aria-live="assertive"><div className="card-heading"><div><span className="seat-details-label">Authenticator MFA</span><h2>Could not load MFA</h2></div><ShieldCheck size={21} /></div><p className="field-error">{error}</p><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="button" onClick={() => void loadFactors()}>Try again</Button></div></div>;
  }

  if (mode === "success") {
    return <motion.div className="dialog-content mfa-manager" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><div className="card-heading"><div><span className="seat-details-label">Authenticator MFA</span><h2>Security settings updated</h2></div><ShieldCheck size={21} /></div><p className="muted-copy">{successMessage}</p><div className="dialog-actions"><Button type="button" onClick={onClose}>Done</Button></div></motion.div>;
  }

  if (mode === "ready") {
    return <div className="dialog-content mfa-manager"><div className="card-heading"><div><span className="seat-details-label">Authenticator MFA</span><h2>{verifiedFactors.length ? "Authenticator connected" : "Connect an authenticator"}</h2><p className="muted-copy">{verifiedFactors.length ? "Changing or removing MFA requires your current 6-digit authenticator code." : "Use an authenticator app to protect every OS sign-in."}</p></div><ShieldCheck size={21} /></div>{verifiedFactors.length ? <div className="mfa-manager-warning"><strong>Protected change flow</strong><span>We verify your current authenticator before replacing or removing it.</span></div> : <p className="muted-copy">You will scan a QR code or enter a setup key, then confirm the new 6-digit code.</p>}<div className="dialog-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>{verifiedFactors.length ? <><Button type="button" variant="ghost" onClick={() => void beginCurrentVerification("replace")} loading={isBusy}>Replace authenticator</Button><Button type="button" variant="danger" onClick={() => void beginCurrentVerification("remove")} loading={isBusy}>Remove MFA</Button></> : <Button type="button" onClick={() => void beginEnrollment("add")} loading={isBusy}>Connect MFA</Button>}</div></div>;
  }

  const isCurrentVerification = mode === "confirm-current";
  return <motion.form className="dialog-content mfa-manager" onSubmit={handleSubmit} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <div className="card-heading"><div><span className="seat-details-label">Authenticator MFA</span><h2>{isCurrentVerification ? "Confirm your current authenticator" : action === "replace" ? "Set up your replacement authenticator" : "Set up your authenticator"}</h2><p className="muted-copy">{isCurrentVerification ? "Enter a code from the authenticator currently protecting your account." : "Scan the QR code with your authenticator app, then enter the current 6-digit code."}</p></div><ShieldCheck size={21} /></div>
    {!isCurrentVerification ? <div className="mfa-enrollment-details"><img src={qrImageSource} alt="Scan this QR code with your authenticator app" width={190} height={190} /><p className="muted-copy">Can&apos;t scan it? Enter this setup key manually:</p><code>{secret}</code></div> : null}
    <InputOTP value={code} onChange={(nextCode) => { setCode(nextCode); setError(""); }} length={6} autoFocus pattern={REGEXP_ONLY_DIGITS} />
    {error ? <p className="field-error">{error}</p> : null}
    <div className="dialog-actions"><Button type="button" variant="ghost" onClick={onClose} disabled={isBusy}>Cancel</Button><Button type="submit" loading={isBusy}>{isCurrentVerification ? "Verify current code" : action === "replace" ? "Verify new authenticator" : "Enable authenticator"}</Button></div>
  </motion.form>;
}

export default MfaManager;
