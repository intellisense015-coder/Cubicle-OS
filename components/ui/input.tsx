import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
  leftIcon?: ReactNode;
};

// TITLE: SHARED INPUT
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className = "", leftIcon, ...props }, ref) {
  const hasError = className.split(/\s+/).includes("has-error");
  const hasSuccess = className.split(/\s+/).includes("is-success");
  return <div className={`input-wrap ${className}`}><div className="input-icon">{leftIcon}</div><input ref={ref} className={`text-input auth-field floating-input ${leftIcon ? "input-with-icon" : ""}`} data-error={hasError ? "true" : undefined} data-success={hasSuccess ? "true" : undefined} {...props} /></div>;
});
