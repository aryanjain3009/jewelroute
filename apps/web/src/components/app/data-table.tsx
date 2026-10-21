"use client";
/** Attio-style data grid on TanStack Table: hairline grid, 40px rows, sticky first column with
 *  hover checkbox, click-to-sort headers with attribute icons, count/sum footer, floating bulk bar. */
import * as React from "react";
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowSelectionState, type SortingState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

export interface ColMeta {
  icon?: Icon;
  align?: "left" | "right";
  width?: number;           // px
  /** Footer content for this column (e.g. a formatted sum). */
  footer?: React.ReactNode;
  className?: string;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Col<T> = ColumnDef<T, any> & { meta?: ColMeta };

export interface DataTableProps<T> {
  data: T[];
  columns: Col<T>[];
  getRowId: (row: T) => string;
  onOpen?: (row: T) => void;
  /** Highlight the row whose id matches (e.g. the one open in a side panel). */
  activeId?: string | null;
  selectable?: boolean;
  bulkActions?: (rows: T[], clear: () => void) => React.ReactNode;
  initialSort?: SortingState;
  countLabel?: string;      // "shops"
  empty?: React.ReactNode;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
  /** Fixed layout: columns keep their `width` exactly and cells truncate (Attio) — the table fills the
   *  page and only scrolls horizontally below the sum of the widths. */
  fit?: boolean;
}

export function DataTable<T>({
  data, columns, getRowId, onOpen, activeId, selectable = true, bulkActions, initialSort = [], countLabel, empty, className, rowClassName, fit,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSort);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const table = useReactTable({
    data, columns, getRowId: (r) => getRowId(r),
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const rows = table.getRowModel().rows;
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const allSel = table.getIsAllRowsSelected();
  const someSel = table.getIsSomeRowsSelected();
  const hasFooter = columns.some((c) => c.meta?.footer !== undefined);

  if (!data.length && empty) return <div className={className}>{empty}</div>;

  return (
    <div className={cn("relative min-h-0 flex-1 overflow-auto", className)}>
      <table
        className={cn("border-separate border-spacing-0 text-[14px]", fit ? "w-full table-fixed" : "w-max min-w-full")}
        style={fit ? { minWidth: columns.reduce((a, c) => a + ((c.meta as ColMeta | undefined)?.width ?? 120), 0) } : undefined}
      >
        <thead className="sticky top-0 z-20 bg-white">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h, i) => {
                const meta = h.column.columnDef.meta as ColMeta | undefined;
                const sorted = h.column.getIsSorted();
                const canSort = h.column.getCanSort();
                const I = meta?.icon;
                return (
                  <th
                    key={h.id}
                    style={{ width: meta?.width, minWidth: fit ? undefined : meta?.width }}
                    className={cn(
                      "h-9 border-b border-r border-line bg-white px-3 text-left align-middle text-[13px] font-medium text-ink last:border-r-0",
                      i === 0 && "sticky left-0 z-10",
                      meta?.align === "right" && "text-right",
                    )}
                  >
                    <div className={cn("flex items-center gap-1.5", meta?.align === "right" && "justify-end")}>
                      {i === 0 && selectable && (
                        <Check
                          checked={allSel}
                          indeterminate={someSel && !allSel}
                          onChange={() => table.toggleAllRowsSelected(!allSel)}
                          label="Select all rows"
                          className="mr-1.5"
                        />
                      )}
                      <button
                        type="button"
                        disabled={!canSort}
                        onClick={h.column.getToggleSortingHandler()}
                        className={cn("inline-flex items-center gap-1.5 truncate", canSort && "hover:text-ink-2")}
                      >
                        {I && <I className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />}
                        <span className="truncate">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                        {sorted === "asc" && <ArrowUpIcon className="size-3 text-ink-3" />}
                        {sorted === "desc" && <ArrowDownIcon className="size-3 text-ink-3" />}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => {
            const isActive = activeId === row.id;
            const isSel = row.getIsSelected();
            return (
              <tr
                key={row.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button,a,input,label,select")) return;
                  onOpen?.(row.original);
                }}
                className={cn(
                  "group h-10",
                  onOpen && "cursor-pointer",
                  isSel || isActive ? "bg-selected" : "hover:bg-hover",
                  rowClassName?.(row.original),
                )}
              >
                {row.getVisibleCells().map((cell, i) => {
                  const meta = cell.column.columnDef.meta as ColMeta | undefined;
                  return (
                    <td
                      key={cell.id}
                      style={fit ? undefined : { width: meta?.width, minWidth: meta?.width, maxWidth: meta?.width ? meta.width + 120 : 420 }}
                      className={cn(
                        "h-10 truncate border-b border-r border-line px-3 align-middle last:border-r-0",
                        i === 0 && cn("sticky left-0 z-10", isSel || isActive ? "bg-selected" : "bg-white group-hover:bg-hover"),
                        meta?.align === "right" && "text-right",
                        meta?.className,
                      )}
                    >
                      <div className={cn("flex items-center gap-2", meta?.align === "right" && "justify-end")}>
                        {i === 0 && selectable && (
                          <Check
                            checked={isSel}
                            onChange={() => row.toggleSelected()}
                            label="Select row"
                            className={cn("mr-1", !isSel && !someSel && !allSel && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
                          />
                        )}
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {(hasFooter || countLabel) && (
          <tfoot className="sticky bottom-0 z-20 bg-white">
            <tr>
              {table.getVisibleLeafColumns().map((col, i) => {
                const meta = col.columnDef.meta as ColMeta | undefined;
                return (
                  <td
                    key={col.id}
                    className={cn(
                      "h-9 border-r border-t border-line bg-white px-3 text-[13px] text-ink-2 last:border-r-0",
                      i === 0 && "sticky left-0 z-10",
                      meta?.align === "right" && "text-right",
                    )}
                  >
                    {i === 0 ? (
                      <span><span className="num font-medium text-ink">{data.length}</span> {countLabel ?? "count"}</span>
                    ) : meta?.footer}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>

      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.16 }}
            className="sticky bottom-14 z-30 mx-auto flex w-fit items-center gap-1.5 rounded-xl border border-line-strong bg-white p-1.5 shadow-[0_8px_30px_-6px_rgb(0_0_0/0.18)]"
          >
            <span className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-ink-2">
              <span className="num grid size-5 place-items-center rounded-[5px] bg-blue text-[12px] font-semibold text-white">{selected.length}</span>
              selected
            </span>
            {bulkActions?.(selected, () => setRowSelection({}))}
            <button type="button" aria-label="Clear selection" onClick={() => setRowSelection({})} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-hover">
              <XIcon className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Check({ checked, indeterminate, onChange, label, className }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string; className?: string }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className={cn("size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-line-strong bg-white transition-opacity checked:border-blue checked:bg-blue checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22M4 8.5l2.5 2.5L12 5.5%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/></svg>')] indeterminate:border-blue indeterminate:bg-blue", className)}
    />
  );
}

/** First-column cell: avatar/thumbnail + name with Attio's dotted underline on hover. */
export function NameCell({ lead, name, sub }: { lead?: React.ReactNode; name: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {lead}
      <span className="truncate font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{name}</span>
      {sub && <span className="truncate text-[13px] text-ink-3">{sub}</span>}
    </span>
  );
}
export const Muted = ({ children }: { children?: React.ReactNode }) => <span className="truncate text-ink-3">{children ?? "—"}</span>;
