"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, LoaderCircle } from "lucide-react";

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footerActions?: ReactNode;
  wide?: boolean;
  noScroll?: boolean;
  transparent?: boolean;
}

function useBodyLock(open: boolean) {
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);
}

export function Modal({ open, onClose, title, description, children, footerActions, wide = false, noScroll = false, transparent = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useBodyLock(open);
  useEffect(() => {
    if (!open) return undefined;
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])");
    (firstFocusable || dialogRef.current)?.focus();
    return undefined;
  }, [open]);
  return <AnimatePresence>{open ? <motion.div className="modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}><motion.section ref={dialogRef} role="dialog" aria-modal="true" aria-label={title || "Dialog"} tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className={cn("modal-card", transparent && "invoice-modal-card", wide && "modal-card-wide", noScroll && "modal-card-no-scroll")}>
    <header className="modal-header"><div><h2 className="modal-title">{title}</h2>{description ? <p className="modal-description">{description}</p> : null}</div><button type="button" onClick={onClose} className="modal-close-btn" aria-label="Close dialog"><X size={16} /></button></header>
    <div className={cn("modal-body", title.startsWith("Filter") && "filter-modal-body")}>{children}</div>
    {footerActions ? <footer className="modal-footer">{footerActions}</footer> : null}
  </motion.section></motion.div> : null}</AnimatePresence>;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", loading = false }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string; loading?: boolean }) {
  return <Modal open={open} onClose={onClose} title={title} description={description} footerActions={<><button type="button" className="button button-ghost button-md" onClick={onClose} disabled={loading}>Cancel</button><button type="button" className="button button-danger button-md" onClick={onConfirm} disabled={loading}>{loading ? <LoaderCircle size={14} className="sign-in-spinner" /> : null}{confirmLabel}</button></>}><p className="modal-confirm-copy">This action can be changed later by an administrator.</p></Modal>;
}

// Backwards-compatible wrapper used by existing app screens.
export function Dialog({ open, onClose, children, ariaLabel = "Dialog" }: { open: boolean; onClose: () => void; children: ReactNode; ariaLabel?: string }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useBodyLock(open);
  useEffect(() => {
    if (!open) return undefined;
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])");
    (firstFocusable || dialogRef.current)?.focus();
    return undefined;
  }, [open]);
  const trapFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])") || []).filter((element) => !element.hasAttribute("disabled"));
    if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <AnimatePresence>{open ? <motion.div className="modal-overlay dialog-backdrop" role="presentation" aria-hidden="false" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div ref={dialogRef} className="modal-card dialog-card" role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1} onKeyDown={trapFocus} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>{children}<button type="button" className="modal-close-btn dialog-close" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></motion.div></motion.div> : null}</AnimatePresence>;
}
