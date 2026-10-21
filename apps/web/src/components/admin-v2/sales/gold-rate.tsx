"use client";
/** Gold rate: today's 24K/22K/18K, set-rate dialog that explains snapshots, append-only history. */
import * as React from "react";
import { CoinsIcon, HistoryIcon, LockIcon, PlusIcon } from "lucide-react";
import { formatINR, formatRate, formatRateDelta, formatRupees, parseRupeesToPaise, priceDesign, PURITY_LABEL } from "@jewelroute/shared";
import { api } from "@/lib/api";
import type { GoldRateRow, Purity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, Btn, Empty, ViewTabs } from "@/components/app/chrome";
import { MainSection } from "@/components/app/record";
import { Input } from "@/components/ui/input";
import { useDesigns, useGoldRates, usePieces, useWrite } from "./data";
import { ErrorState, fmtDayTime, MiniTable, Modal, MTd } from "./ui";

const PURITIES: Purity[] = ["K24", "K22", "K18"];

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 112, h = 28, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-28 overflow-visible" role="img" aria-label={`Last ${values.length} rates`}>
      <path d={d} fill="none" stroke="#b08a35" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="#b08a35" />
    </svg>
  );
}

function SetRate({ purity, current, open, onOpenChange }: { purity: Purity; current?: GoldRateRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const designs = useDesigns();
  const pieces = usePieces();
  const [value, setValue] = React.useState("");
  React.useEffect(() => { if (open) setValue(""); }, [open]);
  const parsed = parseRupeesToPaise(value.replace(/[₹\s]/g, "")); // integer paise, no floats
  const next = parsed ?? NaN;
  const valid = parsed != null && parsed >= 100_00 && parsed <= 50_000_00;
  const affected = (designs.data ?? []).filter((d) => d.purity === purity);
  const piecesAffected = (pieces.data ?? []).filter((p) => p.purity === purity && p.status !== "SOLD").length;
  const sample = affected[0];
  const price = (rate: number) => (sample ? priceDesign({ netWeightMg: sample.netWeightMg, ratePaisePerGram: rate, makingChargeType: sample.makingChargeType, makingChargeValue: sample.makingChargeValue, stoneValuePaise: sample.stoneValuePaise, otherComponents: sample.otherComponents }).unitPricePaise : 0);
  const save = useWrite(() => api("/admin/gold-rates", { body: { purity, ratePaisePerGram: next } }), {
    changes: ["gold_rate.set"], success: `${PURITY_LABEL[purity]} set to ${formatRate(next)}`, onSuccess: () => onOpenChange(false),
  });
  const delta = current && valid ? next - current.ratePaisePerGram : 0;
  return (
    <Modal open={open} onOpenChange={onOpenChange} width={500}
      title={`Set today's ${PURITY_LABEL[purity]} rate`}
      description={<>Current rate {current ? <span className="num font-medium text-ink">{formatRate(current.ratePaisePerGram)}</span> : "not set"}. Rates are append-only — the new rate becomes current now and the old one stays in history.</>}
      footer={<><Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn><Btn variant="primary" disabled={!valid || save.isPending} onClick={() => save.mutate(undefined)}>{save.isPending ? "Saving…" : valid ? `Set ${PURITY_LABEL[purity]} to ${formatRate(next)}` : "Set rate"}</Btn></>}>
      <label htmlFor={`rate-${purity}`} className="mb-1.5 block text-[13px] font-medium text-ink">Rate per gram (₹)</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-3">₹</span>
        <Input id={`rate-${purity}`} autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={current ? formatRupees(current.ratePaisePerGram).replace(/[₹,]/g, "") : "10540"} className="h-9 border-line-strong pl-6 pr-9 text-[15px]" />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">/g</span>
      </div>
      {value && !valid && <p className="mt-1.5 text-[13px] text-danger">Enter a rate between ₹100 and ₹50,000 per gram.</p>}
      <div className="mt-4 overflow-hidden rounded-[10px] border border-line text-[13px]">
        <div className="space-y-1.5 px-3.5 py-3">
          <p className="text-ink">What changes now</p>
          <p className="text-ink-2"><span className="num text-ink">{affected.length}</span> {PURITY_LABEL[purity]} design{affected.length === 1 ? "" : "s"} in the catalog and <span className="num text-ink">{piecesAffected}</span> sample piece{piecesAffected === 1 ? "" : "s"} are re-priced at the new rate{valid && delta !== 0 ? <> (<span className="num">{formatRateDelta(delta)}/g</span>)</> : null}.</p>
          {sample && current && valid && <p className="text-ink-2">For example, {sample.name}: <span className="num">{formatINR(price(current.ratePaisePerGram))}</span> → <span className="num font-medium text-gold-ink">{formatINR(price(next))}</span> before GST.</p>}
        </div>
        <div className="flex gap-2 border-t border-line bg-sunken px-3.5 py-2.5 text-ink-2">
          <LockIcon className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
          <span>What doesn&apos;t: every order already booked keeps a snapshot of the rate it was priced at, so its totals never change. Memo values stay as they were at hand-over.</span>
        </div>
      </div>
    </Modal>
  );
}

export function GoldRateSettings() {
  const q = useGoldRates();
  const [setting, setSetting] = React.useState<Purity | null>(null);
  const [filter, setFilter] = React.useState<"all" | Purity>("all");
  const history = React.useMemo(() => [...(q.data?.history ?? [])].sort((a, b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom)), [q.data]);
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <div className="grid gap-2.5 px-6 py-5 md:grid-cols-3">{PURITIES.map((p) => <span key={p} className="h-[132px] animate-pulse rounded-[10px] bg-hover" />)}</div>;
  const prevOf = (r: GoldRateRow) => history.find((h) => h.purity === r.purity && +new Date(h.effectiveFrom) < +new Date(r.effectiveFrom));
  const rows = history.filter((h) => filter === "all" || h.purity === filter);

  return (
    <>
      <MainSection title="Today's rates">
        <div className="grid gap-2.5 md:grid-cols-3">
          {PURITIES.map((p) => {
            const cur = q.data.current.find((c) => c.purity === p);
            const series = history.filter((h) => h.purity === p).slice(0, 14).reverse();
            const prev = cur ? prevOf(cur) : undefined;
            const d = cur && prev ? cur.ratePaisePerGram - prev.ratePaisePerGram : 0;
            return (
              <div key={p} className="flex flex-col rounded-[10px] border border-line px-4 py-3.5">
                <div className="flex items-center justify-between text-[13px] text-ink-2"><span>{PURITY_LABEL[p]} gold</span><CoinsIcon className="size-4 text-ink-3" strokeWidth={1.6} /></div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className={cn("num text-[20px] font-semibold leading-none tracking-[-0.01em]", cur ? "text-gold-ink" : "text-ink-3")}>{cur ? formatRate(cur.ratePaisePerGram) : "Not set"}</div>
                    <div className="num mt-1.5 text-[12.5px] text-ink-3">{prev ? (d === 0 ? "Same as previous" : `${formatRateDelta(d)} vs previous`) : cur ? "First rate" : "Designs of this purity have no price"}</div>
                  </div>
                  <Sparkline values={series.map((s) => s.ratePaisePerGram)} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                  <span className="truncate text-[12.5px] text-ink-3">{cur ? `Since ${fmtDayTime(cur.effectiveFrom)}${cur.createdBy?.name ? ` · ${cur.createdBy.name.split(" ")[0]}` : ""}` : "—"}</span>
                  <Btn size="sm" icon={PlusIcon} onClick={() => setSetting(p)}>Set rate</Btn>
                </div>
              </div>
            );
          })}
        </div>
      </MainSection>
      <MainSection title="History" count={rows.length} action={<ViewTabs value={filter} onChange={setFilter} items={[{ value: "all", label: "All" }, ...PURITIES.map((p) => ({ value: p, label: PURITY_LABEL[p] }))]} />}>
        <p className="-mt-1 mb-3 text-[13px] text-ink-2">Append-only. Every order line records the exact rate row it was priced from.</p>
        {rows.length === 0 ? <Empty icon={HistoryIcon} title="No rates yet" /> : (
          <MiniTable minWidth={620} head={[{ label: "Purity", width: 90 }, { label: "Rate", align: "right", width: 130 }, { label: "Change", align: "right", width: 120 }, { label: "Effective from", width: 170 }, { label: "Set by" }]}>
            {rows.map((r) => {
              const prev = prevOf(r); const d = prev ? r.ratePaisePerGram - prev.ratePaisePerGram : 0;
              return (
                <tr key={r.goldRateId} className="hover:bg-hover">
                  <MTd className="text-gold-ink">{PURITY_LABEL[r.purity]}</MTd>
                  <MTd align="right" className="num font-medium text-gold-ink">{formatRate(r.ratePaisePerGram)}</MTd>
                  <MTd align="right" className={cn("num", d === 0 && "text-ink-3")}>{prev ? (d === 0 ? "—" : formatRateDelta(d)) : <span className="text-ink-3">First</span>}</MTd>
                  <MTd className="num">{fmtDayTime(r.effectiveFrom)}</MTd>
                  <MTd>{r.createdBy?.name ? <span className="flex items-center gap-2"><Avatar name={r.createdBy.name} />{r.createdBy.name}</span> : <span className="text-ink-3">System</span>}</MTd>
                </tr>
              );
            })}
          </MiniTable>
        )}
      </MainSection>
      {setting && <SetRate purity={setting} current={q.data.current.find((c) => c.purity === setting)} open onOpenChange={(o) => !o && setSetting(null)} />}
    </>
  );
}
