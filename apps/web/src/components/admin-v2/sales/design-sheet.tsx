"use client";
/** Design side panel (Attio record preview, 600px): price today, physical samples (intake, issue, return),
 *  and the design form. Ported from components/admin/settings/catalog.tsx; writes go through useSync. */
import * as React from "react";
import Link from "next/link";
import { ArchiveRestoreIcon, PackagePlusIcon, SendIcon } from "lucide-react";
import { formatGrams, formatINR, formatRate, parseRupeesToPaise, priceDesign, PURITY_LABEL } from "@jewelroute/shared";
import { api } from "@/lib/api";
import { useOpKey } from "@/lib/op-key";
import type { Purity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Btn } from "@/components/app/chrome";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGoldRates, useWrite, type AdminDesign } from "./data";
import { IssueDialog, ReturnDialog } from "./piece-actions";
import { holderLabel, PieceStatusDot, Thumb } from "./ui";
import type { PieceStatus } from "@/lib/types";

type F = { sku: string; name: string; category: string; collection: string; purity: Purity; gross: string; net: string; makingType: "PER_GRAM" | "PERCENT"; making: string; stone: string; image: string; description: string };
const toF = (d?: AdminDesign | null): F => d ? {
  sku: d.sku, name: d.name, category: d.category, collection: d.collection, purity: d.purity, gross: String(d.grossWeightMg / 1000), net: String(d.netWeightMg / 1000),
  makingType: d.makingChargeType, making: String(d.makingChargeValue / 100), stone: String(d.stoneValuePaise / 100), image: d.imageUrls[0] ?? "", description: d.description ?? "",
} : { sku: "", name: "", category: "Bangles", collection: "", purity: "K22", gross: "", net: "", makingType: "PER_GRAM", making: "450", stone: "0", image: "", description: "" };

/** "19.25" g → 19250 mg (up to 3 decimals), else null. */
function gramsToMg(v: string): number | null {
  const m = /^(\d{1,6})(?:\.(\d{1,3}))?$/.exec(v.trim());
  return m ? Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0")) : null;
}

const statusOf = (t: string): PieceStatus => (t === "VAULT" ? "IN_VAULT" : t === "AGENT" ? "WITH_AGENT" : t === "SHOP" ? "ON_MEMO" : (t as PieceStatus));

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={cn("block", className)}><span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>{children}</label>;
}
const inputCls = "h-8 border-line-strong text-[14px]";

export function DesignSheet({ design, onClose }: { design: AdminDesign | null; onClose: () => void }) {
  const rates = useGoldRates();
  const [f, setF] = React.useState<F>(toF(design));
  React.useEffect(() => setF(toF(design)), [design?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [count, setCount] = React.useState("2");
  const [dialog, setDialog] = React.useState<"issue" | "return" | null>(null);
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  // Integer mg / paise / basis points straight from the typed digits — no float maths on money or weight.
  const netMg = gramsToMg(f.net) ?? NaN, grossMg = gramsToMg(f.gross) ?? NaN;
  const makingValue = parseRupeesToPaise(f.making) ?? NaN; // PER_GRAM: paise/g; PERCENT: basis points (12.5 % → 1250)
  const stonePaise = parseRupeesToPaise(f.stone || "0") ?? NaN;
  const rate = rates.data?.current.find((r) => r.purity === f.purity);
  const preview = rate && netMg > 0 && Number.isFinite(makingValue) && Number.isFinite(stonePaise) ? priceDesign({ netWeightMg: netMg, ratePaisePerGram: rate.ratePaisePerGram, makingChargeType: f.makingType, makingChargeValue: makingValue, stoneValuePaise: stonePaise, otherComponents: design?.otherComponents }) : null;
  // The API requires a collection (1–100 chars); say so here instead of a generic validation error.
  const valid = !!(f.sku.trim() && f.name.trim() && f.category.trim() && f.collection.trim() && netMg > 0 && grossMg >= netMg && Number.isFinite(makingValue) && Number.isFinite(stonePaise));
  const body = {
    sku: f.sku.trim(), name: f.name.trim(), category: f.category.trim(), collection: f.collection.trim(), purity: f.purity, grossWeightMg: grossMg, netWeightMg: netMg,
    makingChargeType: f.makingType, makingChargeValue: makingValue, stoneValuePaise: stonePaise,
    imageUrls: f.image.trim() ? [f.image.trim(), ...(design?.imageUrls.slice(1) ?? [])] : design?.imageUrls ?? [], description: f.description.trim() || undefined, otherComponents: design?.otherComponents ?? [],
  };
  const save = useWrite(() => (design ? api(`/admin/designs/${design.id}`, { method: "PATCH", body }) : api("/admin/designs", { body })), {
    changes: ["design.saved"], success: design ? `${f.name} saved` : `${f.name} added to the catalog`, onSuccess: () => { if (!design) onClose(); },
  });
  const intakeOp = useOpKey();
  const intake = useWrite(() => { const body = { count: parseInt(count, 10) }; return api(`/admin/designs/${design!.id}/pieces`, { body, idempotencyKey: intakeOp.keyFor({ design: design!.id, ...body }) }); }, {
    changes: ["design.saved", "piece.moved"], success: () => `${count} piece${count === "1" ? "" : "s"} taken into the vault`, onSuccess: () => intakeOp.done(),
  });
  const pieces = design?.pieces ?? [];
  const selPieces = pieces.filter((p) => sel.has(p.id));
  const canIssue = selPieces.length > 0 && selPieces.every((p) => p.custodianType === "VAULT");
  const canReturn = selPieces.length > 0 && selPieces.every((p) => p.custodianType === "AGENT");
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[600px]">
        <SheetHeader className="flex-row items-center gap-3 border-b border-line px-5 py-4">
          {design && <Thumb src={design.imageUrls[0]} alt={design.name} size={40} className="rounded-[10px]" />}
          <div className="min-w-0">
            <SheetTitle className="truncate font-display text-[20px] font-normal leading-tight text-ink">{design ? design.name : "Add a design"}</SheetTitle>
            <SheetDescription className="truncate text-[13px] text-ink-2">{design ? `${design.sku} · ${design.category}${design.collection ? ` · ${design.collection}` : ""}` : "Prices are computed from today's gold rate."}</SheetDescription>
          </div>
        </SheetHeader>

        <div className="divide-y divide-line">
          {design && design.imageUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-5 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {design.imageUrls.map((u) => <img key={u} src={u} alt={design.name} className="aspect-square h-36 shrink-0 rounded-xl bg-sunken object-cover ring-1 ring-black/5" />)}
            </div>
          )}

          <section className="px-5 py-4">
            <h3 className="mb-2 text-[14px] font-medium text-ink">Price today</h3>
            {preview && rate ? (
              <dl className="rounded-[10px] border border-line px-3.5 py-2 text-[14px]">
                <Row k={<>Gold · {formatGrams(netMg)} × {formatRate(rate.ratePaisePerGram)}</>} v={formatINR(preview.goldValuePaise)} />
                <Row k="Making" v={formatINR(preview.makingPaise)} />
                {preview.stonePaise > 0 && <Row k="Stones" v={formatINR(preview.stonePaise)} />}
                {preview.otherPaise > 0 && <Row k="Other" v={formatINR(preview.otherPaise)} />}
                <Row k="Price before GST" v={<span className="font-medium text-gold-ink">{formatINR(preview.unitPricePaise)}</span>} top />
                <Row k="With 3% GST" v={formatINR(preview.totalWithGstPaise)} />
              </dl>
            ) : <p className="text-[13px] text-ink-3">{rate ? "Enter weights to see the price." : `No ${PURITY_LABEL[f.purity]} rate is set yet, so this design has no price.`}</p>}
          </section>

          {design && (
            <section className="px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-[14px] font-medium text-ink">Physical samples</h3>
                <span className="num text-[13px] text-ink-3">{pieces.length}</span>
                <form className="ml-auto flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); intake.mutate(undefined); }}>
                  <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))} className="h-7 w-11 border-line-strong text-center text-[13px]" aria-label="Number of pieces" />
                  <Btn size="sm" type="submit" icon={PackagePlusIcon} disabled={!parseInt(count, 10) || intake.isPending}>{intake.isPending ? "Adding…" : "Add to vault"}</Btn>
                </form>
              </div>
              {pieces.length === 0 ? <p className="rounded-[10px] border border-dashed border-line-strong px-3.5 py-4 text-[13px] text-ink-2">No physical samples yet. Add pieces to take them into the vault; each gets a tag code and its first ledger entry.</p> : (
                <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
                  {pieces.map((p) => {
                    const movable = p.custodianType === "VAULT" || p.custodianType === "AGENT";
                    return (
                      <div key={p.id} className={cn("flex h-10 items-center gap-3 px-3 text-[14px]", sel.has(p.id) ? "bg-selected" : "hover:bg-hover")}>
                        <input type="checkbox" className="size-4 accent-[#2f6bf2]" checked={sel.has(p.id)} disabled={!movable} onChange={() => toggle(p.id)} aria-label={`Select ${p.tagCode}`} />
                        <Link href={`/admin/samples/${p.id}`} className="num font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 hover:underline">{p.tagCode}</Link>
                        <span className="num text-[13px] text-ink-3">{formatGrams(p.netWeightMg)}</span>
                        <span className="ml-auto flex items-center gap-2 truncate text-[13px]"><span className="truncate text-ink-2">{holderLabel(p)}</span><PieceStatusDot status={statusOf(p.custodianType)} /></span>
                      </div>
                    );
                  })}
                </div>
              )}
              {sel.size > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-line px-3 py-2">
                  <span className="text-[13px] text-ink-2"><span className="num font-medium text-ink">{sel.size}</span> selected</span>
                  <div className="ml-auto flex gap-1.5">
                    <Btn size="sm" icon={SendIcon} disabled={!canIssue} title={canIssue ? undefined : "Select only vault pieces"} onClick={() => setDialog("issue")}>Issue to agent</Btn>
                    <Btn size="sm" icon={ArchiveRestoreIcon} disabled={!canReturn} title={canReturn ? undefined : "Select only pieces in agents' bags"} onClick={() => setDialog("return")}>Return to vault</Btn>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="px-5 py-4">
            <h3 className="mb-3 text-[14px] font-medium text-ink">{design ? "Design details" : "Details"}</h3>
            <form className="grid grid-cols-2 gap-3.5" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(undefined); }}>
              <Field label="Name" className="col-span-2"><Input value={f.name} onChange={set("name")} placeholder="Rajwada bangle" className={inputCls} /></Field>
              <Field label="SKU"><Input value={f.sku} onChange={set("sku")} placeholder="AJ-BNG-2201" className={inputCls} /></Field>
              <Field label="Purity">
                <Select value={f.purity} onValueChange={(v) => setF({ ...f, purity: v as Purity })}><SelectTrigger className="h-8 w-full border-line-strong"><SelectValue /></SelectTrigger><SelectContent>{(["K24", "K22", "K18", "K14"] as Purity[]).map((p) => <SelectItem key={p} value={p}>{PURITY_LABEL[p]}</SelectItem>)}</SelectContent></Select>
              </Field>
              <Field label="Category"><Input value={f.category} onChange={set("category")} className={inputCls} /></Field>
              <Field label="Collection"><Input value={f.collection} onChange={set("collection")} placeholder="Rajwada" required aria-invalid={!f.collection.trim() && !!f.name.trim()} className={inputCls} /></Field>
              <Field label="Gross weight (g)"><Input inputMode="decimal" value={f.gross} onChange={set("gross")} className={inputCls} /></Field>
              <Field label="Net gold weight (g)"><Input inputMode="decimal" value={f.net} onChange={set("net")} className={inputCls} /></Field>
              <Field label="Making charge">
                <Select value={f.makingType} onValueChange={(v) => setF({ ...f, makingType: v as F["makingType"] })}><SelectTrigger className="h-8 w-full border-line-strong"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PER_GRAM">₹ per gram</SelectItem><SelectItem value="PERCENT">% of gold value</SelectItem></SelectContent></Select>
              </Field>
              <Field label={f.makingType === "PER_GRAM" ? "₹ per gram" : "Percent"}><Input inputMode="decimal" value={f.making} onChange={set("making")} className={inputCls} /></Field>
              <Field label="Stone value (₹)"><Input inputMode="decimal" value={f.stone} onChange={set("stone")} className={inputCls} /></Field>
              <Field label="Image URL"><Input value={f.image} onChange={set("image")} placeholder="https://…" className={inputCls} /></Field>
              <Field label="Description" className="col-span-2"><Textarea value={f.description} onChange={set("description")} className="min-h-16 border-line-strong text-[14px]" /></Field>
              {grossMg > 0 && netMg > grossMg && <p className="col-span-2 text-[13px] text-danger">Net gold weight can&apos;t be more than the gross weight.</p>}
              {f.name.trim() && !f.collection.trim() && <p className="col-span-2 text-[13px] text-ink-2">Add a collection (e.g. Rajwada) — every design belongs to one.</p>}
              {[f.gross, f.net].some((x) => x.trim() && gramsToMg(x) == null) && <p className="col-span-2 text-[13px] text-danger">Weights are grams with up to 3 decimals, e.g. 19.25.</p>}
              <div className="col-span-2 flex justify-end gap-2 pt-1">
                <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
                <Btn variant="primary" type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : design ? "Save design" : "Add design"}</Btn>
              </div>
            </form>
          </section>
        </div>
        <IssueDialog pieces={dialog === "issue" ? selPieces : []} open={dialog === "issue"} onOpenChange={(o) => !o && setDialog(null)} onDone={() => setSel(new Set())} />
        <ReturnDialog pieces={dialog === "return" ? selPieces : []} open={dialog === "return"} onOpenChange={(o) => !o && setDialog(null)} onDone={() => setSel(new Set())} />
      </SheetContent>
    </Sheet>
  );
}

function Row({ k, v, top }: { k: React.ReactNode; v: React.ReactNode; top?: boolean }) {
  return <div className={cn("flex h-8 items-center justify-between gap-4", top && "mt-1 border-t border-line pt-1")}><dt className="text-ink-2">{k}</dt><dd className="num text-ink">{v}</dd></div>;
}
