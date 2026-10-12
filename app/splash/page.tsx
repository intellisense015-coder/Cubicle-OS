"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Logo } from "@/components/ui/logo";
import { getDemoSession } from "@/lib/demo-session";

// TITLE: SPLASH SCREEN
export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session = getDemoSession();
      router.replace(session.pinVerified ? "/dashboard" : "/login");
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
