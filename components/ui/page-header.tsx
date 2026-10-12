"use client";

import { motion } from "motion/react";

// TITLE: SHARED PAGE HEADER
export function PageHeader({ title, description, action }) {
  return <motion.div className="module-header" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}><div><h1>{title}</h1><p className="muted-copy">{description}</p></div>{action ? <div className="header-actions">{action}</div> : null}</motion.div>;
}
