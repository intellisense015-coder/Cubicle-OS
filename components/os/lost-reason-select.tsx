"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/primitives";
import { addLeadLostReason, getLeadLostReasons } from "@/lib/lead-lost-reasons";

export function LostReasonSelect({ value, hint, onChange }: { value: string; hint?: string; onChange: (value: string) => void }) {
  const [reasons, setReasons] = useState(() => getLeadLostReasons());
  const [isAdding, setIsAdding] = useState(false);
  const [newReason, setNewReason] = useState("");
  const [addError, setAddError] = useState("");

  const addReason = () => {
    const normalized = newReason.trim();
    if (!normalized) {
      setAddError("Enter a reason first.");
      return;
    }
    const existing = reasons.find((reason) => reason.toLowerCase() === normalized.toLowerCase());
    if (existing) {
      setAddError("That lost reason already exists.");
      return;
    }
    const nextReasons = addLeadLostReason(normalized);
    setReasons(nextReasons);
    onChange(normalized);
    setIsAdding(false);
    setNewReason("");
    setAddError("");
  };

  return <div className="lost-reason-field"><div className="lost-reason-select-line"><SelectField label="Lost reason" value={value} hint={hint} onChange={(event) => onChange(event.target.value)}><option value="">Select a lost reason</option>{reasons.map((reason) => <option value={reason} key={reason}>{reason}</option>)}</SelectField><button type="button" className="lost-reason-add-button" onClick={() => { setIsAdding(true); setAddError(""); }} aria-label="Add lost reason" title="Add lost reason"><Plus size={16} /></button></div>{isAdding ? <div className="lost-reason-add-row"><Input autoFocus value={newReason} onChange={(event) => { setNewReason(event.target.value); setAddError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addReason(); } }} placeholder="Add another reason" aria-label="New lost reason" /><Button type="button" size="sm" onClick={addReason}><Check size={14} /> Add</Button><button type="button" className="lost-reason-cancel-button" onClick={() => { setIsAdding(false); setNewReason(""); setAddError(""); }} aria-label="Cancel adding lost reason" title="Cancel"><X size={15} /></button></div> : null}{addError ? <span className="lead-form-error">{addError}</span> : null}</div>;
}
