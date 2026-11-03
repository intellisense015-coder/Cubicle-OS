"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "brand" }) {
  return <span className={cn("status-pill", `status-pill-${tone}`)}>{children}</span>;
}

// Shared TanStack table used throughout the OS modules.
export function DataTable({ columns, data, emptyMessage = "No records yet.", emptySubtitle = "Records will appear here when they are added.", onRowClick, className = "", pageSize = 20 }: { columns: any[]; data: any[]; emptyMessage?: string; emptySubtitle?: string; onRowClick?: (row: any) => void; className?: string; pageSize?: number }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 20;
  const pageCount = Math.max(1, Math.ceil(data.length / safePageSize));

  useEffect(() => {
    setPagination((current) => {
      const nextPageIndex = Math.min(current.pageIndex, pageCount - 1);
      if (current.pageIndex === nextPageIndex && current.pageSize === safePageSize) return current;
      return { pageIndex: nextPageIndex, pageSize: safePageSize };
    });
  }, [pageCount, safePageSize]);

  const table = useReactTable<any>({
    data,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });
  const showPagination = data.length > safePageSize;
  const firstVisibleRow = data.length ? pagination.pageIndex * safePageSize + 1 : 0;
  const lastVisibleRow = Math.min((pagination.pageIndex + 1) * safePageSize, data.length);

  return <div className={cn("table-card app-table-card", className)}><div className="table-scroll app-table-scroll"><table className="data-table app-table"><thead>{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => <th key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <tr key={row.id} className={onRowClick ? "data-row-clickable" : undefined} onClick={(event) => { if (onRowClick && !(event.target as Element).closest("button")) onRowClick(row.original); }} onKeyDown={(event) => { if (onRowClick && event.key === "Enter") onRowClick(row.original); }} tabIndex={onRowClick ? 0 : undefined}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>) : <tr><td colSpan={columns.length} className="table-empty"><div className="table-empty-state"><img src="/empty-state-illustration.png" alt="" /><strong>{emptyMessage}</strong><span>{emptySubtitle}</span></div></td></tr>}</tbody></table></div>{showPagination ? <nav className="data-table-pagination" aria-label="Table pagination"><span className="data-table-pagination-summary">Showing {firstVisibleRow}–{lastVisibleRow} of {data.length}</span><div className="data-table-pagination-actions"><button type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">Previous</button><span aria-live="polite">Page {pagination.pageIndex + 1} of {pageCount}</span><button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">Next</button></div></nav> : null}</div>;
}
