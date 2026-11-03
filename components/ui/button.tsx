import { forwardRef, useState, type ComponentProps, type ReactNode, type MouseEvent } from "react";
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
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className = "", variant = "primary", size = "md", type = "button", loading = false, disabled = false, children, onClick, ...props }, ref) {
  const [clickLoading, setClickLoading] = useState(false);
  const buttonVariant = variant === "brand" ? "primary" : variant === "soft" ? "ghost" : variant;
  const isLoading = loading || clickLoading;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!onClick || isLoading) return;
    const result = onClick(event);
    const promise = result as unknown as PromiseLike<unknown> | undefined;
    if (!promise || typeof promise.then !== "function") return;
    setClickLoading(true);
    void promise.then(() => setClickLoading(false), () => setClickLoading(false));
  };
  return <motion.button ref={ref} type={type} whileHover={{ y: -2, scale: 1.01 }} whileTap={{ y: 0, scale: 0.985 }} transition={{ duration: 0.2 }} className={`button app-button button-${buttonVariant} button-${size} ${className}`} disabled={disabled || isLoading} onClick={onClick ? handleClick : undefined} {...props}>{isLoading ? <LoaderCircle size={14} className="sign-in-spinner" /> : null}{children}</motion.button>;
});
