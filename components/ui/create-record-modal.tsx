"use client";

import { useState, type FormEvent } from "react";
import { Button, DateField, Field, Modal, SelectField } from "./primitives";

interface CreateRecordModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitSuccess?: (data: Record<string, string>) => void;
}

export function CreateRecordModal({ open, onClose, onSubmitSuccess }: CreateRecordModalProps) {
  const [formData, setFormData] = useState({ code: "", name: "", category: "", rate: "", reorderQuantity: "", effectiveDate: "" });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = (key: string, value: string) => setFormData((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!formData.code.trim()) nextErrors.code = "Product code is required.";
    if (!formData.name.trim()) nextErrors.name = "Product name is required.";
    if (!formData.category) nextErrors.category = "Please select a category.";
    if (!formData.rate) nextErrors.rate = "Sell rate is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      onSubmitSuccess?.(formData);
      onClose();
    } catch {
      setErrors({ global: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return <Modal open={open} onClose={onClose} title="Add New Record" description="Fill in the required information to create a new item."><form onSubmit={handleSubmit} className="modal-form-grid">{errors.global ? <div className="modal-form-error">{errors.global}</div> : null}<Field label="Product Code *" placeholder="e.g. FAB-102" value={formData.code} onChange={(event) => update("code", event.target.value)} hint={errors.code} /><Field label="Product Name *" placeholder="e.g. Cotton Lawn" value={formData.name} onChange={(event) => update("name", event.target.value)} hint={errors.name} /><div className="modal-field-full"><SelectField label="Category *" value={formData.category} onChange={(event) => update("category", event.target.value)} hint={errors.category} searchable searchPlaceholder="Search category..."><option value="">Select a category</option><option value="cotton">Pure Cotton</option><option value="silk">Raw Silk</option><option value="linen">Linen</option><option value="chiffon">Chiffon</option></SelectField></div><Field label="Sell Rate / Meter (PKR) *" type="number" min="0" placeholder="0.00" value={formData.rate} onChange={(event) => update("rate", event.target.value)} hint={errors.rate} /><Field label="Reorder Level (Meters)" type="number" min="0" placeholder="50" value={formData.reorderQuantity} onChange={(event) => update("reorderQuantity", event.target.value)} /><div className="modal-field-full"><DateField label="Effective Date" value={formData.effectiveDate} onChange={(event) => update("effectiveDate", event.target.value)} /></div><div className="modal-form-actions"><Button type="button" variant="soft" onClick={onClose} disabled={loading}>Cancel</Button><Button type="submit" variant="brand" loading={loading}>Create Record</Button></div></form></Modal>;
}
