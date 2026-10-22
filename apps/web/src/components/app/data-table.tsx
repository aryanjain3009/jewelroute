"use client";
/** Attio-style data grid on TanStack Table: hairline grid, 40px rows, sticky first column with
 *  hover checkbox, click-to-sort headers with attribute icons, count/sum footer, floating bulk bar. */
import * as React from "react";
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowSelectionState, type SortingState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, PanelRightOpenIcon, XIcon } from "lucide-react";
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
  /** false = left out below 640 px, so a phone sees the name, the money and the status without scrolling. */
  phone?: boolean;
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
  /** Attio row preview: a preview icon appears on hover in the first cell; Space opens it for the keyboard row. */
  onPreview?: (row: T) => void;
  /** Reports the visible (sorted) row order — record previews step through it with ↑ ↓. */
  onOrderChange?: (ids: string[]) => void;
  /** Controlled sort (e.g. from `useUrlSort`, so it survives refresh and Back). */
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
}

export function DataTable<T>({
  data, columns, getRowId, onOpen, activeId, selectable = true, bulkActions, initialSort = [], countLabel, empty, className, rowClassName, fit, onPreview, onOrderChange,
  sorting: sortingProp, onSortingChange,
}: DataTableProps<T>) {
  const [cursor, setCursor] = React.useState<number>(-1);
  const bodyRef = React.useRef<HTMLTableSectionElement>(null);
  const [sortingLocal, setSortingLocal] = React.useState<SortingState>(initialSort);
  const sorting = sortingProp ?? sortingLocal;
  const setSorting = (u: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof u === "function" ? u(sorting) : u;
    if (onSortingChange) onSortingChange(next); else setSortingLocal(next);
  };
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const isPhone = usePhone();
  const columnVisibility = React.useMemo(
    () => (isPhone ? Object.fromEntries(columns.filter((c) => (c.meta as ColMeta | undefined)?.phone === false && c.id).map((c) => [c.id!, false])) : {}),
    [isPhone, columns],
  );
  const table = useReactTable({
    data, columns, getRowId: (r) => getRowId(r),
    state: { sorting, rowSelection, columnVisibility },
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
  const order = rows.map((r) => r.id).join("|");
  React.useEffect(() => { onOrderChange?.(order ? order.split("|") : []); }, [order, onOrderChange]);
  // Scroll ONLY this table's own container, and only after a keyboard move (never on mount, never
  // when a preview opens) — scrollIntoView would also scroll every ancestor, i.e. the page.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const keyMoved = React.useRef(false);
  const prevActive = React.useRef<string | null | undefined>(activeId);
  React.useEffect(() => {
    // Stepping an open preview (↑/↓) keeps its row in view; opening one, or mounting with one, never scrolls.
    const stepped = !!prevActive.current && !!activeId && prevActive.current !== activeId;
    prevActive.current = activeId;
    if (!activeId) return;
    const i = rows.findIndex((r) => r.id === activeId);
    if (i >= 0) { if (stepped) keyMoved.current = true; setCursor(i); }
  }, [activeId, order]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!keyMoved.current) return;
    keyMoved.current = false;
    const box = scrollRef.current;
    const row = bodyRef.current?.querySelector<HTMLElement>(`tr[data-idx="${cursor}"]`);
    if (!box || !row) return;
    const head = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const foot = box.querySelector("tfoot")?.getBoundingClientRect().height ?? 0;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const bottom = top + row.offsetHeight;
    if (top - head < box.scrollTop) box.scrollTop = top - head;
    else if (bottom + foot > box.scrollTop + box.clientHeight) box.scrollTop = bottom + foot - box.clientHeight;
  }, [cursor]);
  /** ↑ ↓ move the keyboard row, Enter opens the record, Space previews it, x selects it (Attio). */
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input,button,a,select")) return;
    if (activeId) return; // an open preview owns ↑ ↓
    const r = rows[cursor];
    if (e.key === "ArrowDown") { e.preventDefault(); keyMoved.current = true; setCursor((c) => Math.min(rows.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); keyMoved.current = true; setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter" && r) { e.preventDefault(); onOpen?.(r.original); }
    else if (e.key === " " && r && onPreview) { e.preventDefault(); onPreview(r.original); }
    else if (e.key === "x" && r && selectable) { e.preventDefault(); r.toggleSelected(); }
  };

  const isEmpty = !data.length && !!empty;
  const [moreRight, setMoreRight] = React.useState(false);
  const measure = React.useCallback(() => {
    const el = scrollRef.current;
    if (el) setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);
  React.useEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [measure, data.length]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    {/* Right-edge fade while more columns sit off-screen (phones, tablets). */}
    <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 z-30 w-10 bg-gradient-to-l from-white to-transparent transition-opacity duration-150", moreRight ? "opacity-100" : "opacity-0")} />
    <div ref={scrollRef} onScroll={measure} className={cn("relative min-h-0 flex-1 overflow-auto outline-none", className)} tabIndex={0} onKeyDown={onKey} aria-label={countLabel ? `${countLabel} table` : "Table"}>
      <table
        className={cn("border-separate border-spacing-0 text-[14px]", fit ? "w-full table-fixed" : "w-max min-w-full")}
        style={fit ? { minWidth: table.getVisibleLeafColumns().reduce((a, c, i) => a + colWidth((c.columnDef.meta as ColMeta | undefined)?.width ?? 120, i, isPhone), 0) } : undefined}
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
                    style={{ width: meta?.width && colWidth(meta.width, i, isPhone), minWidth: fit ? undefined : meta?.width }}
                    className={cn(
                      "h-9 border-b border-r border-line bg-white px-2.5 text-left align-middle text-[13px] font-medium text-ink last:border-r-0",
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
                        {/* The sort arrow takes the attribute icon's place, so a sorted header never truncates. */}
                        {sorted === "asc" ? <ArrowUpIcon className="size-3.5 shrink-0 text-ink-2" strokeWidth={2} /> : sorted === "desc" ? <ArrowDownIcon className="size-3.5 shrink-0 text-ink-2" strokeWidth={2} /> : I && <I className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />}
                        <span className="truncate">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody ref={bodyRef}>
          {rows.map((row, ri) => {
            const isActive = activeId === row.id;
            const isCursor = cursor === ri && !activeId;
            const isSel = row.getIsSelected();
            return (
              <tr
                key={row.id}
                data-idx={ri}
                onMouseEnter={() => { if (!activeId && cursor !== -1) setCursor(ri); }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button,a,input,label,select")) return;
                  onOpen?.(row.original);
                }}
                className={cn(
                  "group h-10",
                  onOpen && "cursor-pointer",
                  // --row = the row's current fill, so the preview button's fade matches it.
                  isSel || isActive ? "bg-selected [--row:var(--jr-selected)]" : isCursor ? "bg-hover [--row:var(--jr-hover)]" : "[--row:#fff] hover:bg-hover hover:[--row:var(--jr-hover)]",
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
                        "h-10 truncate border-b border-r border-line px-2.5 align-middle last:border-r-0",
                        i === 0 && cn("sticky left-0 z-10", isSel || isActive ? "bg-selected" : isCursor ? "bg-hover" : "bg-white group-hover:bg-hover"),
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
                        {/* A block wrapper so plain text cells truncate with an ellipsis instead of clipping. */}
                        <div className={cn("min-w-0 flex-1 truncate", meta?.align === "right" && "text-right")}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </div>
                      {i === 0 && onPreview && (
                        <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-[var(--row)] from-55% to-transparent", isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
                      )}
                      {i === 0 && onPreview && (
                        <button
                          type="button"
                          aria-label="Preview record"
                          title="Preview (Space)"
                          onClick={(e) => { e.stopPropagation(); setCursor(ri); onPreview(row.original); }}
                          className={cn("absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md border border-line-strong bg-white text-ink-2 shadow-[0_1px_2px_rgb(0_0_0/0.06)] hover:text-ink", isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
                        >
                          <PanelRightOpenIcon className="size-3.5" strokeWidth={1.75} />
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {(hasFooter || countLabel) && !isEmpty && (
          <tfoot className="sticky bottom-0 z-20 bg-white">
            <tr>
              {table.getVisibleLeafColumns().map((col, i) => {
                const meta = col.columnDef.meta as ColMeta | undefined;
                return (
                  <td
                    key={col.id}
                    className={cn(
                      "h-9 border-r border-t border-line bg-white px-2.5 text-[13px] text-ink-2 last:border-r-0",
                      i === 0 && "sticky left-0 z-10",
                      meta?.align === "right" && "text-right",
                    )}
                  >
                    {i === 0 ? (
                      <span><span className="num font-medium text-ink">{data.length}</span> {countLabel ? (data.length === 1 ? singular(countLabel) : countLabel) : "count"}</span>
                    ) : meta?.footer}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
      {/* Empty: the header stays (what the columns are), the message sits under it, pinned to the viewport width. */}
      {isEmpty && <div className="sticky left-0 w-full">{empty}</div>}

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
      className={cn("size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-line-strong bg-white transition-opacity checked:border-blue checked:bg-blue checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22M4 8.5l2.5 2.5L12 5.5%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/></svg>')] indeterminate:border-blue indeterminate:bg-blue indeterminate:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22M4.5 8h7%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22/></svg>')]", className)}
    />
  );
}

/** "orders" → "order", "deliveries" → "delivery" for a count of one. */
const singular = (w: string) => (w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("s") ? w.slice(0, -1) : w);

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

/** On a phone the name column gives up width so the money and status columns start on the first screen. */
const colWidth = (w: number, i: number, phone: boolean) => (phone && i === 0 ? Math.min(w, 176) : w);

/** Below 640 px (Tailwind `sm`). False on the server and the first paint, so hydration matches. */
const PHONE = "(max-width: 639px)";
function usePhone() {
  return React.useSyncExternalStore(
    (cb) => { const m = window.matchMedia(PHONE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}
