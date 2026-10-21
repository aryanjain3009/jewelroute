"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Loader2, ShieldAlert } from "lucide-react";
import { formatGrams, formatINR } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PurityTag } from "@/components/jr/money";
import { fmtTime, fmtWeekday, mediaUrl, plural } from "./format";
import type { PublicAck } from "./types";

/** Public endpoints: plain fetch, no session refresh/redirect behaviour. */
async function pub<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1/public/memo-ack/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store",
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: { ok?: boolean; data?: T; error?: { code?: string; message?: string } } | null = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (!res.ok || json?.ok === false) throw Object.assign(new Error(json?.error?.message ?? "Request failed"), { status: res.status, code: json?.error?.code });
  return (json?.data ?? json) as T;
}

type State = { k: "loading" } | { k: "invalid"; expired: boolean } | { k: "error"; message: string } | { k: "ready"; d: PublicAck };

export function AckView({ token }: { token: string }) {
  const [s, set] = useState<State>({ k: "loading" });
  const [busy, setBusy] = useState(false);
  const [justConfirmed, setJust] = useState(false);

  const load = () => pub<PublicAck>(encodeURIComponent(token))
    .then((d) => set({ k: "ready", d }))
    .catch((e: Error & { status?: number; code?: string }) => {
      if (e.status === 404 || e.status === 410 || e.status === 400 || e.status === 401 || /EXPIRED|INVALID|NOT_FOUND/.test(e.code ?? "")) set({ k: "invalid", expired: e.status === 410 || /EXPIRED/.test(e.code ?? "") });
      else set({ k: "error", message: "We couldn't load this memo. Check your connection and try again." });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [token]);

  async function confirm() {
    if (s.k !== "ready") return;
    setBusy(true);
    try {
      const r = await pub<{ ackStatus: "ACKNOWLEDGED"; ackAt: string }>(encodeURIComponent(token), { confirm: true });
      setJust(true);
      set({ k: "ready", d: { ...s.d, ackStatus: r.ackStatus, ackAt: r.ackAt, code: undefined } });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 404 || err.status === 410) set({ k: "invalid", expired: err.status === 410 });
      else set({ k: "error", message: err.message || "Confirmation didn't go through. Try again." });
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-dvh bg-sunken text-[15px] text-ink">
      <div className="mx-auto min-h-dvh max-w-[520px] bg-paper px-4 pb-48 pt-6 min-[521px]:border-x min-[521px]:border-line">
        {s.k === "loading" && <AckSkeleton />}
        {s.k === "invalid" && (
          <div className="pt-16 text-center">
            <ShieldAlert className="mx-auto size-7 text-ink-3" />
            <h1 className="mt-4 font-display text-[28px] leading-tight tracking-[-0.02em]">{s.expired ? "This link has expired" : "This link isn't valid"}</h1>
            <p className="mx-auto mt-3 max-w-xs text-ink-2">
              {s.expired ? "Acknowledgement links last 72 hours. Ask the agent to read you the memo details, or call the supplier." : "It may have been mistyped or already replaced. Ask the agent to show you the QR code again."}
            </p>
          </div>
        )}
        {s.k === "error" && (
          <div className="pt-16 text-center">
            <h1 className="font-display text-[28px] leading-tight tracking-[-0.02em]">Something went wrong</h1>
            <p className="mx-auto mt-3 max-w-xs text-ink-2">{s.message}</p>
            <Button variant="outline" className="mt-6 h-11" onClick={() => { set({ k: "loading" }); load(); }}>Try again</Button>
          </div>
        )}
        {s.k === "ready" && (s.d.ackStatus === "ACKNOWLEDGED" ? <Receipt d={s.d} animate={justConfirmed} /> : (
          <>
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><span className="grid size-6 place-items-center rounded-md bg-ink text-[11px] font-semibold text-white">{s.d.tenantName.slice(0, 1)}</span>{s.d.tenantName}</p>
            <h1 className="mt-4 font-display text-[30px] leading-[1.1] tracking-[-0.02em]">Samples left with you on memo</h1>
            <p className="mt-2 text-[15px] text-ink-2">
              {s.d.agentName} is leaving these pieces with <span className="font-medium text-ink">{s.d.shopName}</span>. Check each one, then confirm you’ve received them.
            </p>

            <dl className="mt-5 grid grid-cols-2 divide-x divide-line rounded-xl border border-line text-[14px]">
              <div className="px-3 py-2.5"><dt className="text-[12px] text-ink-3">Memo</dt><dd className="num mt-0.5 font-medium">{s.d.memoNumber}</dd></div>
              <div className="px-3 py-2.5"><dt className="text-[12px] text-ink-3">Due back</dt><dd className="mt-0.5 font-medium">{fmtWeekday(s.d.dueDate)}</dd></div>
            </dl>

            <Items d={s.d} />

            <div className="mt-6 rounded-xl border border-line p-4 text-center">
              <p className="text-[13px] text-ink-2">Or read this code to the agent</p>
              <p className="num mt-1.5 text-[32px] font-semibold tracking-[0.16em] text-ink" aria-label={`Code ${s.d.code?.split("").join(" ")}`}>
                {s.d.code ? `${s.d.code.slice(0, 3)} ${s.d.code.slice(3)}` : "------"}
              </p>
            </div>

            <div className="fixed inset-x-0 bottom-0">
              <div className="mx-auto max-w-[520px] border-t border-line bg-paper px-4 pt-3 safe-bottom min-[521px]:border-x">
                <Button className="h-12 w-full text-[15px]" disabled={busy} onClick={confirm}>
                  {busy && <Loader2 className="animate-spin" />}Confirm receipt
                </Button>
                <p className="mt-2 text-center text-[12px] text-ink-3">Only confirm if every piece above is in front of you.</p>
              </div>
            </div>
          </>
        ))}
      </div>
    </div>
  );
}

function Items({ d }: { d: PublicAck }) {
  const weight = d.items.reduce((a, i) => a + i.netWeightMg, 0);
  return (
    <>
      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {d.items.map((i) => (
          <li key={i.tagCode} className="flex items-center gap-3 p-3">
            {i.imageUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={mediaUrl(i.imageUrl)} alt="" className="size-14 shrink-0 rounded-lg bg-sunken object-cover" />
              : <span className="size-14 shrink-0 rounded-lg bg-sunken" />}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-display text-[17px] leading-snug">{i.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3"><span className="num whitespace-nowrap font-medium text-ink-2">{i.tagCode}</span><PurityTag purity={i.purity} /><span className="num whitespace-nowrap">{formatGrams(i.netWeightMg)}</span></p>
            </div>
            <span className="num shrink-0 text-sm font-medium text-gold-ink">{formatINR(i.valuePaise)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between px-1">
        <span className="text-sm text-ink-2">{plural(d.items.length, "piece")}, <span className="num">{formatGrams(weight)}</span> net gold</span>
        <span className="num text-[22px] font-semibold leading-none tracking-[-0.01em] text-gold-ink">{formatINR(d.totalValuePaise)}</span>
      </div>
    </>
  );
}

function Receipt({ d, animate }: { d: PublicAck; animate: boolean }) {
  return (
    <div className="pt-4">
      <div className="flex flex-col items-center text-center">
        <motion.span initial={animate ? { scale: 0.4, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 18 }}
          className="grid size-14 place-items-center rounded-full bg-verified text-white"><Check className="size-7" strokeWidth={2.5} /></motion.span>
        <h1 className="mt-5 font-display text-[30px] leading-tight tracking-[-0.02em]">Receipt confirmed</h1>
        <p className="mt-2 text-ink-2">Thank you. {d.tenantName} has a record that {d.shopName} received these samples{d.ackAt ? ` at ${fmtTime(d.ackAt)}` : ""}.</p>
      </div>
      <div className="relative mt-8 rounded-xl border border-line p-4">
        <div className="flex justify-between text-sm"><span className="text-ink-3">Memo</span><span className="num font-medium">{d.memoNumber}</span></div>
        <div className="mt-2 flex justify-between text-sm"><span className="text-ink-3">From</span><span>{d.agentName}, {d.tenantName}</span></div>
        <div className="mt-2 flex justify-between text-sm"><span className="text-ink-3">To</span><span>{d.shopName}</span></div>
        <div className="mt-2 flex justify-between text-sm"><span className="text-ink-3">Due back</span><span className="font-medium">{fmtWeekday(d.dueDate)}</span></div>
        <div className="my-4 border-t border-dashed border-line-strong" />
        {d.items.map((i) => (
          <div key={i.tagCode} className="flex justify-between gap-3 py-1 text-sm">
            <span className="min-w-0 truncate"><span className="num font-medium text-ink-2">{i.tagCode}</span> {i.name}</span>
            <span className="num shrink-0">{formatINR(i.valuePaise)}</span>
          </div>
        ))}
        <div className="my-4 border-t border-dashed border-line-strong" />
        <div className="flex items-baseline justify-between"><span className="font-medium">Total value</span><span className="num text-[20px] font-semibold leading-none text-gold-ink">{formatINR(d.totalValuePaise)}</span></div>
      </div>
      <p className="mt-4 text-center text-[13px] text-ink-3">You can close this page. Return the pieces to the agent by the due date, or tell them which ones you’d like to buy.</p>
    </div>
  );
}

function AckSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
