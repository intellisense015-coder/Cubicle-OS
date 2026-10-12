import type { ReactNode } from "react";

// TITLE: FORM FIELD
export function FormField({ label, error, children }: { label: ReactNode; error?: ReactNode; children: ReactNode }) {
  return <div className="form-field"><label>{label}</label>{children}{error ? <p className="field-error">{error}</p> : null}</div>;
}
