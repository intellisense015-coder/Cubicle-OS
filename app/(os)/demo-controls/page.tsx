"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, RotateCcw, ShieldCheck, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { getDemoValue, resetDemoWorkspace, saveDemoValue } from "@/lib/demo-session";
import { useToast } from "@/components/ui/toast-provider";

// TITLE: DEMO CONTROLS PAGE
export default function DemoControlsPage() {
  const { showToast } = useToast();
  const [role, setRole] = useState("Owner");
  const [reset, setReset] = useState(false);
  const roles = ["Owner", "Manager", "Finance", "Front Desk"];

  useEffect(() => {
    setRole(getDemoValue("demoRole") || "Owner");
  }, []);

  // TITLE: DEMO ROLE
  const chooseRole = (nextRole) => { setRole(nextRole); saveDemoValue("demoRole", nextRole); showToast({ variant: "success", title: "Demo persona updated", message: `You are now viewing the ${nextRole} experience.` }); };
  const resetWorkspace = () => { resetDemoWorkspace(); setReset(true); window.setTimeout(() => setReset(false), 2200); showToast({ variant: "success", title: "Workspace data reset", message: "Editable demo data was cleared successfully." }); };

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Demo Controls</h1><p className="muted-copy">Switch demo personas and reset editable workspace data without losing sign-in.</p></div><span className="security-health"><ShieldCheck size={16} /> Local session only</span></div><div className="demo-controls-grid"><section className="settings-card"><div className="card-heading"><div><h2>Demo persona</h2><p className="muted-copy">Use a role to preview the intended access experience.</p></div><UserRoundCog size={21} /></div><div className="role-choice-list">{roles.map((item) => <button type="button" className={`role-choice ${role === item ? "selected" : ""}`} key={item} onClick={() => chooseRole(item)}><span><strong>{item}</strong><small>{item === "Owner" ? "All modules and approvals" : item === "Manager" ? "Operations and team access" : item === "Finance" ? "Invoices and payment workflows" : "Leads, members and visits"}</small></span>{role === item ? <Check size={16} /> : null}</button>)}</div></section><section className="settings-card"><div className="card-heading"><div><h2>Reset demo workspace</h2><p className="muted-copy">Clear visits, approvals, edits, invoices, ledgers and permissions saved in this browser session.</p></div><RotateCcw size={21} /></div><Button variant="ghost" onClick={resetWorkspace}><RotateCcw size={15} /> Reset editable data</Button>{reset ? <p className="success-message">Workspace demo data reset. Authentication remains active.</p> : null}</section></div><div className="demo-safety-note"><ShieldCheck size={17} /><span>This is a client-side demo control. Production roles and permission checks must be enforced on the server.</span></div></motion.div></PageShell>;
}
