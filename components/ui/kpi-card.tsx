"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

export interface KpiCardProps {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  detail?: string;
  className?: string;
  leftOverlay?: boolean;
  rightOverlay?: boolean;
  hideIcon?: boolean;
  overlayValues?: { left: ReactNode; right: ReactNode };
  onClick?: () => void;
}

/** Canonical KPI card used by the dashboard and every module page. */
export function KpiCard({ icon, label, value, detail = "", className = "", leftOverlay = false, rightOverlay = false, hideIcon = false, overlayValues, onClick }: KpiCardProps) {
  return (
    <motion.div
      className={`stat-card kpi-card ${onClick ? "kpi-card-clickable" : ""} ${className}`.trim()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } } : undefined}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.35 }}
    >
      {leftOverlay ? <span className="kpi-card-left-overlay" aria-hidden="true" /> : null}
      {rightOverlay ? <span className="kpi-card-right-overlay" aria-hidden="true" /> : null}
      {!hideIcon && icon ? <span className="stat-icon">{icon}</span> : null}
      <span className="stat-label">{label}</span>
      {overlayValues ? <><strong className="kpi-card-overlay-value kpi-card-overlay-left">{overlayValues.left}</strong><strong className="kpi-card-overlay-value kpi-card-overlay-right">{overlayValues.right}</strong></> : null}
      <strong>{value}</strong>
      <small>{detail}</small>
    </motion.div>
  );
}

export default KpiCard;
