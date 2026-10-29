"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Logo } from "@/components/ui/logo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// TITLE: SPLASH SCREEN
export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          router.replace("/login");
          return;
        }

        const { data: assuranceData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        router.replace(assuranceData?.currentLevel === "aal2" ? "/dashboard" : "/mfa");
      } catch {
        router.replace("/login");
      }
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="splash-shell">
      <motion.div
        className="splash-orb splash-orb-one"
        animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="splash-orb splash-orb-two"
        animate={{ scale: [1.1, 0.95, 1.1], opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="splash-content"
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      >
        <Logo size="xl" priority />
        <h1>The Cubicle OS</h1>
        <p className="splash-caption">A calmer way to run the workspace.</p>
        <div className="splash-loader" aria-label="Loading" />
      </motion.div>
    </main>
  );
}
