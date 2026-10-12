import { forwardRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { sanitizeNumericInput } from "@/lib/number-input";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
  leftIcon?: ReactNode;
};

// TITLE: SHARED INPUT
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className = "", leftIcon, type, onChange, ...props }, ref) {
  const hasError = className.split(/\s+/).includes("has-error");
  const hasSuccess = className.split(/\s+/).includes("is-success");
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (type === "number") event.target.value = sanitizeNumericInput(event.target.value);
    onChange?.(event);
  };
  return <div className={`input-wrap ${className}`}><div className="input-icon">{leftIcon}</div><input ref={ref} type={type} onChange={handleChange} className={`text-input auth-field floating-input ${leftIcon ? "input-with-icon" : ""}`} data-error={hasError ? "true" : undefined} data-success={hasSuccess ? "true" : undefined} {...props} /></div>;
});
