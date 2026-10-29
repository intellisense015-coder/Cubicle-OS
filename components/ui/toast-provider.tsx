"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

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

type ToastRecord = ToastOptions & {
  id: string;
  variant: ToastVariant;
  duration: number;
  remaining: number;
};

type ToastContextValue = {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") return <CheckCircle2 size={17} />;
  if (variant === "warning") return <AlertTriangle size={17} />;
  if (variant === "info") return <Info size={17} />;
  return <AlertCircle size={17} />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const showToast = useCallback((options: ToastOptions) => {
    const duration = Math.max(0, Math.round(options.duration ?? 12));
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = options.message == null ? options.message : String(options.message);
    setToasts((current) => [...current, {
      ...options,
      message,
      id,
      variant: options.variant ?? "info",
      duration,
      remaining: duration,
    }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToasts((current) => current.flatMap((toast) => {
        if (toast.duration === 0) return [toast];
        const remaining = toast.remaining - 1;
        if (remaining > 0) return [{ ...toast, remaining }];
        if (toast.loop) return [{ ...toast, remaining: toast.duration }];
        return [];
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const contextValue = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return <ToastContext.Provider value={contextValue}>
    {children}
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => <article className={`app-toast app-toast-${toast.variant}`} key={toast.id} role={toast.variant === "error" ? "alert" : "status"}>
        <div className="app-toast-inner">
          <span className="app-toast-icon" aria-hidden="true"><ToastIcon variant={toast.variant} /></span>
          <div className="app-toast-copy">
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>
          <div className="app-toast-actions">
            {toast.actionLabel ? <button type="button" className="toast-action toast-action-primary" onClick={() => { toast.onAction?.(); dismissToast(toast.id); }}>{toast.actionLabel}</button> : null}
            {toast.secondaryActionLabel ? <button type="button" className="toast-action toast-action-secondary" onClick={() => { toast.onSecondaryAction?.(); dismissToast(toast.id); }}>{toast.secondaryActionLabel}</button> : null}
            <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}><X size={15} /></button>
          </div>
        </div>
        {toast.duration > 0 ? <div className="toast-timing" aria-label={`Notification closes in ${toast.remaining} seconds`}><span>Closes in {toast.remaining}s</span><span className="toast-progress" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, (toast.remaining / toast.duration) * 100))}%` }} /></span></div> : null}
      </article>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
