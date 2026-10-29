"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Building2, Check, CircleCheck, FileText, LayoutGrid, Mail, Map, ReceiptText, ShieldCheck, Sparkles, Upload, UsersRound, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { setupSteps } from "@/lib/onboarding-data";
import { floorSpaces } from "@/lib/module-b-data";

// TITLE: SETUP ICON MAP
const iconMap = { building: Building2, layout: LayoutGrid, map: Map, billing: ReceiptText, file: FileText, import: Upload, users: UsersRound, role: WandSparkles, shield: ShieldCheck, mail: Mail, web: Sparkles, receipt: ReceiptText, check: CircleCheck };

// TITLE: PRELOADED FLOOR PLAN
function PreloadedFloorPlan() {
  const assignedSeats = floorSpaces.filter((space) => space.type === "Desk").length;
  return <div className="preloaded-plan"><div className="preloaded-plan-copy"><span className="setup-check-icon"><Map size={17} /></span><div><strong>Preloaded floor plan</strong><p>{assignedSeats} workspace seats and shared rooms are already mapped for The Cubicle.</p></div></div><img src="/floor-plan.png" alt="The Cubicle preloaded floor plan" /><div className="preloaded-plan-footer"><span>Admins can edit a seat’s member, company, rent and payment details.</span><Link href="/floor-plan" className="text-link">Open interactive plan <ArrowRight size={14} /></Link></div></div>;
}

// TITLE: SETUP STEP CONTENT
function SetupStepContent({ step, companyName, setCompanyName }) {
  if (step.number === 1) return <div className="setup-fields"><label className="settings-label">Company name</label><Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="The Cubicle" leftIcon={<Building2 size={17} />} /><label className="settings-label">Business email</label><Input placeholder="info@thecubicle.pk" type="email" leftIcon={<Mail size={17} />} /></div>;
  if (step.number === 2) return <div className="setup-option-grid"><button type="button" className="setup-choice selected"><LayoutGrid size={18} /><strong>1 floor</strong><span>12 desks · 4 offices</span></button><button type="button" className="setup-choice"><LayoutGrid size={18} /><strong>Multiple floors</strong><span>Configure each floor separately</span></button></div>;
  if (step.number === 3) return <PreloadedFloorPlan />;
  if (step.number === 5 || step.number === 6) return <div className="dropzone"><FileText size={24} /><strong>{step.number === 5 ? "Upload templates" : "Import existing records"}</strong><span>Demo mode accepts the step without uploading a file.</span><button type="button" className="filter-button">Choose file</button></div>;
  if (step.number === 4) return <div className="setup-fields"><label className="settings-label">Invoice due days</label><Input defaultValue="5" inputMode="numeric" /><label className="settings-label">Security deposit rule</label><button type="button" className="settings-group"><span className="settings-group-copy"><strong>One month of rent</strong><span>Use the active monthly rent as the default deposit.</span></span><Check size={17} /></button></div>;
  if (step.number === 7 || step.number === 8 || step.number === 9) return <div className="setup-checklist"><div className="setup-check-row"><span className="setup-check-icon"><Check size={15} /></span><span><strong>{step.number === 7 ? "Invite your core team" : step.number === 8 ? "Front Desk" : "Areeba Malik"}</strong><small>{step.number === 7 ? "Owner, Operations and Front Desk" : step.number === 8 ? "Suggested starter role" : "Leads and visits · finance approval"}</small></span></div><div className="setup-check-row"><span className="setup-check-icon"><Check size={15} /></span><span><strong>{step.number === 7 ? "2 invitations ready" : step.number === 8 ? "Operations" : "Usman Khan"}</strong><small>{step.number === 7 ? "They will receive setup instructions" : step.number === 8 ? "Suggested starter role" : "All operations · direct finance edit"}</small></span></div></div>;
  if (step.number === 10 || step.number === 11) return <div className="connect-card"><span className="setup-check-icon"><Mail size={17} /></span><div><strong>{step.number === 10 ? "Business email connection" : "Website enquiry form"}</strong><p>{step.number === 10 ? "Connect the sender used for invoices and notifications." : "New submissions will appear in Leads automatically."}</p></div><Button variant="ghost">Connect</Button></div>;
  if (step.number === 12) return <div className="invoice-preview"><div className="invoice-preview-header"><span>THE CUBICLE</span><strong>INV-2026-1025</strong></div><h3>Northstar Studio</h3><p>October 2026 workspace invoice</p><div><span>Monthly rent</span><strong>PKR 144,000</strong></div><div><span>Due date</span><strong>October 05, 2026</strong></div></div>;
  return <div className="activation-card"><CircleCheck size={30} /><div><strong>Everything is ready.</strong><p>Your setup checklist is complete. Activate the demo OS to enter the workspace.</p></div></div>;
}

// TITLE: FIRST-TIME SETUP PAGE
export default function SetupPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(1);
  const [companyName, setCompanyName] = useState("The Cubicle");
  const step = setupSteps[current - 1];
  const Icon = iconMap[step.icon];
  const progress = useMemo(() => Math.round((current / setupSteps.length) * 100), [current]);

  useEffect(() => {
    const saved = Number(window.sessionStorage.getItem("cubicle-setup-step"));
    if (saved >= 1 && saved <= setupSteps.length) setCurrent(saved);
  }, []);

  const next = () => {
    window.sessionStorage.setItem("cubicle-setup-step", String(Math.min(current + 1, setupSteps.length)));
    if (current === setupSteps.length) {
      window.sessionStorage.setItem("cubicle-setup-complete", "true");
      router.push("/dashboard");
      return;
    }
    setCurrent((value) => value + 1);
  };

  return <PageShell><motion.div className="setup-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>First-time setup</h1><p className="muted-copy">Build the foundation of your workspace one calm step at a time.</p></div><Link href="/dashboard" className="back-link">Exit setup <ArrowRight size={15} /></Link></div><div className="setup-layout"><aside className="setup-progress"><div className="setup-progress-top"><span>Setup progress</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="setup-step-list">{setupSteps.map((item) => <button key={item.number} type="button" className={`setup-step-nav ${item.number === current ? "active" : ""} ${item.number < current ? "complete" : ""}`} onClick={() => setCurrent(item.number)}><span>{item.number < current ? <Check size={13} /> : item.number}</span><strong>{item.title}</strong></button>)}</div></aside><section className="setup-card"><motion.div key={step.number} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}><div className="setup-card-icon"><Icon size={22} /></div><p className="setup-step-count">Step {step.number} of {setupSteps.length}</p><h2>{step.title}</h2><p className="muted-copy">{step.description}</p><SetupStepContent step={step} companyName={companyName} setCompanyName={setCompanyName} /></motion.div><div className="setup-footer"><Button variant="ghost" disabled={current === 1} onClick={() => setCurrent((value) => value - 1)}><ArrowLeft size={15} /> Back</Button><Button onClick={next}>{current === setupSteps.length ? "Activate The Cubicle OS" : "Save and continue"} <ArrowRight size={15} /></Button></div></section></div></motion.div></PageShell>;
}
