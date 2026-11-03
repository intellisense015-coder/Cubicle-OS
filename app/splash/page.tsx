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
      <div className="splash-background" aria-hidden="true" />
      <motion.div
        className="splash-glass-panel"
        initial={{ opacity: 0, x: 72, scale: 0.96, filter: "blur(12px)" }}
        animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="splash-content">
          <motion.div
            className="splash-brand-mark"
            initial={{ opacity: 0, y: 12, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.22, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <Logo size="xl" priority />
          </motion.div>
          <motion.div
            className="splash-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1>The Cubicle OS</h1>
            <p className="splash-caption">A calmer way to run the workspace.</p>
          </motion.div>
          <motion.div
            className="splash-loader"
            aria-label="Loading"
            initial={{ opacity: 0, scaleX: 0.4 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.62, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </motion.div>
    </main>
  );
}
