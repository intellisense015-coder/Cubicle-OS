"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { sileo, Toaster } from "sileo";

type ToastVariant = "success" | "error" | "info" | "warning";

type ToastOptions = {
  variant?: ToastVariant;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  duration?: number;
  loop?: boolean;
};

type ToastContextValue = {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toastCreators = {
  success: sileo.success,
  error: sileo.error,
  info: sileo.info,
  warning: sileo.warning,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const showToast = useCallback((options: ToastOptions) => {
    const variant = options.variant ?? "info";
    const duration = options.loop || options.duration === 0 ? null : options.duration ?? 3200;
    let toastId = "";

    const action = options.actionLabel
      ? {
          title: options.actionLabel,
          onClick: () => {
            options.onAction?.();
            if (toastId) sileo.dismiss(toastId);
          },
        }
      : options.secondaryActionLabel
        ? {
            title: options.secondaryActionLabel,
            onClick: () => {
              options.onSecondaryAction?.();
              if (toastId) sileo.dismiss(toastId);
            },
          }
        : undefined;

    toastId = toastCreators[variant]({
      title: options.title,
      description: options.message == null ? undefined : String(options.message),
      duration,
      button: action,
    });

    return toastId;
  }, []);

  const dismissToast = useCallback((id: string) => {
    sileo.dismiss(id);
  }, []);

  const contextValue = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return <ToastContext.Provider value={contextValue}>
    {children}
    <Toaster
      position="top-center"
      offset={{ top: 16 }}
      theme="light"
      options={{
        duration: 3200,
      }}
    />
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
