"use client";

import { motion } from "motion/react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const AUTH_GLASS_TILES = Array.from({ length: 80 }, (_, index) => index);
const AUTH_GLASS_ACCENT_TILES = new Set([35, 36, 43, 44]);

// TITLE: AUTHENTICATION SHELL
export function AuthShell({ title, description, asideTitle, asideCopy, step = 0, children, variant = "default", showGlassPattern = false }) {
  return (
    <main className={`auth-shell ${variant === "login" ? "auth-login" : ""}`}>
      <div className="auth-topbar"><Logo /><ThemeToggle variant={variant === "login" ? "segmented" : "default"} /></div>
      <div className="auth-layout">
        <motion.aside className="auth-aside" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
          {showGlassPattern ? <div className="auth-glass-pattern" aria-hidden="true">{AUTH_GLASS_TILES.map((tile) => <span key={tile} className={`auth-glass-tile${AUTH_GLASS_ACCENT_TILES.has(tile) ? " auth-glass-tile-accent" : ""}`} />)}</div> : null}
          <div className="auth-aside-brand"><Logo /></div>
          <div className="auth-aside-copy"><h2>{asideTitle}</h2><p>{asideCopy}</p></div>
          <div className="aside-footer"><div className="progress-dots">{[1, 2, 3].map((dot) => <span key={dot} className={dot <= (step || 0) ? "active" : ""} />)}</div><span>Secure access flow</span></div>
        </motion.aside>
        <section className="auth-panel"><div className="auth-panel-inner"><div className="auth-heading"><h1>{title}</h1><p>{description}</p></div>{children}</div></section>
      </div>
    </main>
  );
}
