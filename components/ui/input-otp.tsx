"use client";

import { OTPInput } from "input-otp";
import type { HTMLAttributes } from "react";

type InputOTPProps = {
  value?: string;
  onChange: (value: string) => void;
  length?: number;
  label?: string;
  masked?: boolean;
  autoFocus?: boolean;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  pattern?: string;
  className?: string;
};

// TITLE: SHADCN INPUT OTP
export function InputOTP({ value = "", onChange, length = 6, label, masked = false, autoFocus = false, inputMode = "numeric", pattern, className = "" }: InputOTPProps) {
  return <div className={`otp-field otp-length-${length} ${className}`}>{label ? <label>{label}</label> : null}<OTPInput value={value} onChange={onChange} maxLength={length} autoFocus={autoFocus} inputMode={inputMode} pattern={pattern} containerClassName="otp-group" render={({ slots }) => <div className="otp-slots" role="group" aria-label={label || "One-time code"}>{slots.map((slot, index) => <div key={index} className={`otp-slot ${slot.isActive ? "active" : ""}`} aria-label={`${label || "One-time code"} digit ${index + 1}`}>{slot.char ? (masked ? "•" : slot.char) : ""}</div>)}</div>} /></div>;
}
