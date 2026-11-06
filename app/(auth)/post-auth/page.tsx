"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function postAuthPath(nextPath: string) {
  return `/post-auth?next=${encodeURIComponent(nextPath)}`;
}

export default function PostAuthPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const nextPath = safeNextPath(new URLSearchParams(window.location.search).get("next"));

    const resolveRoute = async () => {
      try {
        const response = await fetch("/api/auth/state", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (response.status === 403 && payload?.mfaRequired) {
          router.replace(`/mfa?next=${encodeURIComponent(postAuthPath(nextPath))}`);
          return;
        }
        if (!response.ok) throw new Error(payload?.error || "Unable to continue the secure sign-in flow.");

        if (payload?.device?.status === "reauth_required") {
          await fetch("/api/auth/device/revoke", { method: "POST", credentials: "include" }).catch(() => undefined);
          router.replace("/login");
          return;
        }

        if (payload?.device?.status === "not_registered") {
          router.replace(`/device-pin/setup?next=${encodeURIComponent(nextPath)}`);
          return;
        }
        if (payload?.device?.status === "pin_required") {
          router.replace(`/pin-lock?next=${encodeURIComponent(nextPath)}`);
          return;
        }
        if (payload?.isOwner && !payload?.isOnboarded) {
          router.replace(`/onboarding/company?next=${encodeURIComponent(nextPath)}`);
          return;
        }
        router.replace(nextPath);
      } catch (resolveError) {
        if (!cancelled) setError(resolveError instanceof Error ? resolveError.message : "Unable to continue.");
      }
    };

    void resolveRoute();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <AuthShell
      title="Securing your workspace."
      description="Checking your account, trusted browser and onboarding status."
      asideTitle="One secure step at a time."
      asideCopy="The Cubicle checks your access state before opening the workspace."
      step={3}
      variant="login"
    >
      <div className="auth-form" aria-live="polite">
        {error ? (
          <>
            <p className="field-error">{error}</p>
            <Button type="button" size="lg" className="w-full" onClick={() => window.location.reload()}>Try again</Button>
          </>
        ) : (
          <>
            <LoaderCircle size={24} className="sign-in-spinner" />
            <p className="muted-copy">Checking your secure access...</p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
