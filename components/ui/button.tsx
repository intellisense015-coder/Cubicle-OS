import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { motion } from "motion/react";
import { LoaderCircle } from "lucide-react";

type ButtonProps = Omit<ComponentProps<typeof motion.button>, "ref" | "children"> & {
  children?: ReactNode;
  className?: string;
  variant?: "primary" | "brand" | "soft" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

// TITLE: SHARED BUTTON
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className = "", variant = "primary", size = "md", type = "button", loading = false, disabled = false, children, ...props }, ref) {
  const buttonVariant = variant === "brand" ? "primary" : variant === "soft" ? "ghost" : variant;
  return <motion.button ref={ref} type={type} whileHover={{ y: -2, scale: 1.01 }} whileTap={{ y: 0, scale: 0.985 }} transition={{ duration: 0.2 }} className={`button app-button button-${buttonVariant} button-${size} ${className}`} disabled={disabled || loading} {...props}>{loading ? <LoaderCircle size={14} className="sign-in-spinner" /> : null}{children}</motion.button>;
});
