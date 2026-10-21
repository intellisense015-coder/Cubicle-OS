"use client";

import { PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EditableCharge = { description: string; amount: string };

export const chargeAmount = (value: unknown) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;

export function getEditableCharges(record: any): EditableCharge[] {
  const source = Array.isArray(record?.charges) && record.charges.length
    ? record.charges
    : Array.isArray(record?.items) && record.items.length
      ? record.items
      : [];

  const normalized = source.map((item) => ({
    description: String(item?.description || item?.itemDescription || "Workspace services"),
    amount: String(chargeAmount(item?.amount ?? item?.price) * (Number(item?.quantity) || 1))
  }));

  return normalized.length
    ? normalized
    : [{ description: String(record?.itemDescription || "Workspace services"), amount: String(chargeAmount(record?.subtotal ?? record?.amount)) }];
}

export const chargesTotal = (charges: EditableCharge[]) => charges.reduce((total, charge) => total + chargeAmount(charge.amount), 0);

export function ChargeEditor({ charges, onChange }: { charges: EditableCharge[]; onChange: (charges: EditableCharge[]) => void }) {
  const updateCharge = (index: number, field: keyof EditableCharge, value: string) => {
    onChange(charges.map((charge, chargeIndex) => chargeIndex === index ? { ...charge, [field]: value } : charge));
  };

  return <section className="charge-editor">
    <div className="charge-editor-heading">
      <div><span className="settings-label-title">Charges</span><p className="muted-copy">Add monthly, meeting room, membership or any other billable line.</p></div>
      <Button type="button" variant="soft" onClick={() => onChange([...charges, { description: "", amount: "0" }])}><PlusCircle size={15} /> Add charge</Button>
    </div>
    <div className="charge-editor-columns"><span>Description</span><span>Amount (PKR)</span><span /></div>
    {charges.map((charge, index) => <div className="charge-editor-row" key={`charge-${index}`}>
      <Input value={charge.description} onChange={(event) => updateCharge(index, "description", event.target.value)} placeholder="Monthly workspace charge" aria-label={`Charge ${index + 1} description`} />
      <Input value={charge.amount} onChange={(event) => updateCharge(index, "amount", event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" aria-label={`Charge ${index + 1} amount`} />
      <Button type="button" variant="ghost" className="charge-remove-button" onClick={() => onChange(charges.filter((_, chargeIndex) => chargeIndex !== index))} disabled={charges.length === 1} aria-label={`Remove charge ${index + 1}`}><Trash2 size={15} /></Button>
    </div>)}
    <div className="charge-editor-total"><span>Charges total</span><strong>PKR {chargesTotal(charges).toLocaleString("en-PK")}</strong></div>
  </section>;
}
