"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export type TableActionMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  keepOpen?: boolean;
};

export function TableActionMenu({ ariaLabel, items }: { ariaLabel: string; items: TableActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 8;
    const horizontalPadding = 12;
    const top = triggerRect.bottom + gap;
    const left = Math.max(horizontalPadding, Math.min(triggerRect.right - menuRect.width, window.innerWidth - menuRect.width - horizontalPadding));
    setMenuPosition({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  const choose = (item: TableActionMenuItem) => {
    if (item.disabled) return;
    if (!item.keepOpen) setOpen(false);
    item.onSelect?.();
  };

  const itemClassName = (item: TableActionMenuItem) => `table-action-menu-item${item.destructive ? " table-action-menu-item-danger" : ""}`;
  const renderItem = (item: TableActionMenuItem) => {
    const content = <>{item.icon ? <span className="table-action-menu-icon" aria-hidden="true">{item.icon}</span> : null}{item.label}</>;
    if (item.href) {
      return <Link className={itemClassName(item)} href={item.href} aria-disabled={item.disabled || undefined} onClick={(event) => { event.stopPropagation(); if (item.disabled) { event.preventDefault(); return; } choose(item); }}>{content}</Link>;
    }
    return <button className={itemClassName(item)} type="button" role="menuitem" disabled={item.disabled} onClick={(event) => { event.stopPropagation(); choose(item); }}>{content}</button>;
  };

  return <div className="table-action-menu"><button ref={triggerRef} className="action-icon-btn table-action-menu-trigger" type="button" onClick={(event) => { event.stopPropagation(); setOpen((current) => !current); }} aria-label={ariaLabel} aria-expanded={open} aria-haspopup="menu" title={ariaLabel}><MoreVertical size={17} /></button>{open && typeof document !== "undefined" ? createPortal(<div ref={menuRef} className="table-action-menu-panel" role="menu" style={{ top: menuPosition.top, left: menuPosition.left }}>{items.map((item) => <span className="table-action-menu-entry" key={item.label}>{renderItem(item)}</span>)}</div>, document.body) : null}</div>;
}
