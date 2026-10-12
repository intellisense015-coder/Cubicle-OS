"use client";

import type { ReactNode } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "brand" }) {
  return <span className={cn("status-pill", `status-pill-${tone}`)}>{children}</span>;
}

// Shared TanStack table used throughout the OS modules.
export function DataTable({ columns, data, emptyMessage = "No records yet.", emptySubtitle = "Records will appear here when they are added.", onRowClick, className = "" }: { columns: any[]; data: any[]; emptyMessage?: string; emptySubtitle?: string; onRowClick?: (row: any) => void; className?: string }) {
  const table = useReactTable<any>({ data, columns, getCoreRowModel: getCoreRowModel() });
  return <div className={cn("table-card app-table-card", className)}><div className="table-scroll app-table-scroll"><table className="data-table app-table"><thead>{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => <th key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <tr key={row.id} className={onRowClick ? "data-row-clickable" : undefined} onClick={(event) => { if (onRowClick && !(event.target as Element).closest("button")) onRowClick(row.original); }} onKeyDown={(event) => { if (onRowClick && event.key === "Enter") onRowClick(row.original); }} tabIndex={onRowClick ? 0 : undefined}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>) : <tr><td colSpan={columns.length} className="table-empty"><div className="table-empty-state"><img src="/empty-state-illustration.png" alt="" /><strong>{emptyMessage}</strong><span>{emptySubtitle}</span></div></td></tr>}</tbody></table></div></div>;
}
