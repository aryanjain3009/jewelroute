"use client";
/**
 * /ack/[token] — the retailer's acknowledgement page, as a digital receipt. Mobile first: the
 * retailer opens it from the agent's QR code at the counter.
 *
 * Behaviour and API calls are unchanged from the previous AckView (components/field/ack-view.tsx):
 * GET /api/v1/public/memo-ack/:token to read, POST { confirm: true } to acknowledge, a 5 s poll while
 * pending (the agent may enter the six-digit code instead), 404/400/401 → invalid, 410 → expired.
 *
 * Layout: who hands over what (agent → shop), memo number, due date, every piece with tag, purity,
 * weights and value, the total, the six-digit code, and one confirm action pinned to the bottom
 * (safe-area aware). Confirmed, it becomes a receipt (perforated edge, dashed rules).
 * Motion (emil-design-eng): only the moment of confirmation animates — the check scales in from .8
 * with opacity (260 ms strong ease-out) and the receipt rises 8 px; reduced motion: none.
 */
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckIcon, Clock3Icon, LinkIcon, Loader2, LockIcon, RefreshCwIcon, StoreIcon } from "lucide-react";
import { formatGrams, formatINR } from "@jewelroute/shared";
import { Avatar } from "@/components/app/chrome";
import { PurityTag } from "@/components/jr/money";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtTime, fmtWeekday, mediaUrl, plural } from "@/components/field/format";
import type { PublicAck } from "@/components/field/types";
import { POLL } from "@/lib/sync";
import { cn } from "@/lib/utils";

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

const EASE = [0.23, 1, 0.32, 1] as const;
const dateTime = (iso?: string) => (iso ? `${fmtWeekday(iso)}, ${fmtTime(iso)}` : "");

export function AckView({ token }: { token: string }) {
  const [s, set] = React.useState<State>({ k: "loading" });
  const [busy, setBusy] = React.useState(false);
  const [justConfirmed, setJust] = React.useState(false);

  const load = () => pub<PublicAck>(encodeURIComponent(token))
    .then((d) => set({ k: "ready", d }))
    .catch((e: Error & { status?: number; code?: string }) => {
      if (e.status === 404 || e.status === 410 || e.status === 400 || e.status === 401 || /EXPIRED|INVALID|NOT_FOUND/.test(e.code ?? "")) set({ k: "invalid", expired: e.status === 410 || /EXPIRED/.test(e.code ?? "") });
      else set({ k: "error", message: "We couldn't load this memo. Check your connection and try again." });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { load(); }, [token]);

  // While receipt is pending, re-read the memo: the agent may enter the 6-digit code on their phone,
  // and this page must then show the confirmed receipt instead of the code. A failed background read
  // keeps what is on screen.
  const pendingAck = s.k === "ready" && s.d.ackStatus !== "ACKNOWLEDGED";
  React.useEffect(() => {
    if (!pendingAck) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      pub<PublicAck>(encodeURIComponent(token)).then((d) => { if (d.ackStatus === "ACKNOWLEDGED") set({ k: "ready", d }); }).catch(() => {});
    };
    const t = setInterval(tick, POLL.ackPage);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, [pendingAck, token]);

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
      <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-white min-[481px]:border-x min-[481px]:border-line">
        {s.k === "loading" && <AckSkeleton />}
        {s.k === "invalid" && <Problem expired={s.expired} />}
        {s.k === "error" && <ErrorState message={s.message} onRetry={() => { set({ k: "loading" }); load(); }} />}
        {s.k === "ready" && (s.d.ackStatus === "ACKNOWLEDGED" ? <Receipt d={s.d} animate={justConfirmed} /> : <Pending d={s.d} busy={busy} onConfirm={confirm} />)}
      </div>
    </div>
  );
}

/* ---------- Shared pieces ---------- */
function Brand({ name, right }: { name: string; right?: React.ReactNode }) {
  return (
    <header className="flex h-14 items-center gap-2.5 border-b border-line px-5">
      <span className="grid size-7 place-items-center rounded-[7px] bg-ink text-[12px] font-semibold text-white" aria-hidden>{name.slice(0, 1)}</span>
      <span className="truncate text-[14px] font-medium text-ink">{name}</span>
      <span className="ml-auto shrink-0">{right}</span>
    </header>
  );
}

function Handover({ d }: { d: PublicAck }) {
  return (
    <ol className="mt-6 rounded-[12px] border border-line px-3.5 py-3" aria-label="Hand-over">
      <li className="relative flex items-center gap-3 pb-3">
        <Avatar name={d.agentName} size={32} />
        <span className="absolute top-9 bottom-0 left-[15.5px] border-l border-dashed border-line-strong" aria-hidden />
        <div className="min-w-0 flex-1"><div className="text-[12px] text-ink-3">From</div><div className="truncate text-[14px] font-medium text-ink">{d.agentName}<span className="font-normal text-ink-2"> · {d.tenantName}</span></div></div>
      </li>
      <li className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-gold-soft text-gold-ink" aria-hidden><StoreIcon className="size-4" strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1"><div className="text-[12px] text-ink-3">To</div><div className="truncate text-[14px] font-medium text-ink">{d.shopName}</div></div>
      </li>
    </ol>
  );
}

function Items({ d, compact }: { d: PublicAck; compact?: boolean }) {
  return (
    <ul className={cn("divide-y divide-line", !compact && "overflow-hidden rounded-[12px] border border-line")}>
      {d.items.map((i) => (
        <li key={i.tagCode} className={cn("flex items-center gap-3", compact ? "py-2.5" : "p-3")}>
          {i.imageUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={mediaUrl(i.imageUrl)} alt="" className={cn("shrink-0 rounded-[10px] bg-sunken object-cover", compact ? "size-10" : "size-14")} />
            : <span className={cn("shrink-0 rounded-[10px] bg-sunken", compact ? "size-10" : "size-14")} />}
          <div className="min-w-0 flex-1">
            <p className={cn("line-clamp-2 leading-snug text-ink", compact ? "text-[14px]" : "font-display text-[17px]")}>{i.name}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
              <span className="num whitespace-nowrap font-medium text-ink-2">{i.tagCode}</span>
              <PurityTag purity={i.purity} />
              <span className="num whitespace-nowrap">{formatGrams(i.netWeightMg)} net{i.grossWeightMg && !compact ? ` · ${formatGrams(i.grossWeightMg)} gross` : ""}</span>
            </p>
          </div>
          <span className="num shrink-0 self-start pt-0.5 text-right text-[14px] font-medium text-gold-ink">{formatINR(i.valuePaise)}</span>
        </li>
      ))}
    </ul>
  );
}

const netWeight = (d: PublicAck) => d.items.reduce((a, i) => a + i.netWeightMg, 0);

/* ---------- Pending: check, then confirm ---------- */
function Pending({ d, busy, onConfirm }: { d: PublicAck; busy: boolean; onConfirm: () => void }) {
  const n = d.items.length;
  return (
    <>
      <Brand name={d.tenantName} right={<span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><LockIcon className="size-3.5" />Secure link</span>} />
      <main className="px-5 pt-7 pb-56">
        <p className="num text-[13px] font-medium text-ink-2">Memo {d.memoNumber}</p>
        <h1 className="mt-1.5 text-balance font-display text-[30px] leading-[1.1] tracking-[-0.02em] text-ink">Confirm you&apos;ve received {plural(n, "piece")}</h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
          {d.agentName} from {d.tenantName} is leaving {n === 1 ? "this sample" : "these samples"} with <span className="font-medium text-ink">{d.shopName}</span> on memo. Check each piece, then confirm.
        </p>

        <Handover d={d} />

        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-[12px] border border-line text-[14px]">
          <div className="px-3.5 py-3"><dt className="text-[12px] text-ink-3">Due back</dt><dd className="mt-0.5 font-medium text-ink">{fmtWeekday(d.dueDate)}</dd></div>
          <div className="border-l border-line px-3.5 py-3"><dt className="text-[12px] text-ink-3">Net weight</dt><dd className="num mt-0.5 font-medium text-ink">{formatGrams(netWeight(d))}</dd></div>
        </dl>

        <div className="mt-3 flex items-center justify-between gap-4 rounded-[12px] border border-dashed border-line-strong px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] text-ink-2">Or read this code to {d.agentName.split(/\s+/)[0]}</p>
            <p className="mt-0.5 text-[12px] text-ink-3">It confirms the same receipt.</p>
          </div>
          <p className="num shrink-0 text-[26px] leading-none font-semibold tracking-[0.12em] text-ink" aria-label={`Code ${d.code?.split("").join(" ")}`}>
            {d.code ? `${d.code.slice(0, 3)} ${d.code.slice(3)}` : "------"}
          </p>
        </div>

        <h2 className="mt-7 mb-2.5 flex items-baseline justify-between text-[14px] font-medium text-ink">Pieces<span className="num text-[13px] font-normal text-ink-3">{n}</span></h2>
        <Items d={d} />
        <div className="mt-3 flex items-baseline justify-between gap-3 px-1">
          <span className="text-[14px] text-ink-2">Total value</span>
          <span className="num text-[24px] leading-none font-semibold tracking-[-0.01em] text-gold-ink">{formatINR(d.totalValuePaise)}</span>
        </div>


        {d.expiresAt && <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-ink-3"><Clock3Icon className="size-3.5 shrink-0" />This link works until {dateTime(d.expiresAt)}</p>}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto max-w-[480px] border-t border-line bg-white px-5 pt-3 safe-bottom min-[481px]:border-x">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-2">{plural(n, "piece")} · total value</span>
            <span className="num text-[18px] leading-none font-semibold text-gold-ink">{formatINR(d.totalValuePaise)}</span>
          </div>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-ink text-[15px] font-medium text-white outline-none transition-[scale,background-color,opacity] duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-blue/35 active:scale-[0.98] disabled:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#2c2d30]"
          >
            {busy ? <><Loader2 className="size-4 animate-spin" />Confirming…</> : <><CheckIcon className="size-4" strokeWidth={2.25} />Confirm receipt of {plural(n, "piece")}</>}
          </button>
          <p className="mt-2 text-center text-[12px] text-ink-3">Only confirm if every piece above is in front of you.</p>
        </div>
      </div>
    </>
  );
}

/* ---------- Acknowledged: the receipt ---------- */
function Receipt({ d, animate }: { d: PublicAck; animate: boolean }) {
  const reduce = useReducedMotion();
  const move = animate && !reduce;
  const rows: [string, React.ReactNode][] = [
    ["Memo", <span key="m" className="num font-medium">{d.memoNumber}</span>],
    ["From", `${d.agentName}, ${d.tenantName}`],
    ["To", d.shopName],
    ["Due back", <span key="d" className="font-medium">{fmtWeekday(d.dueDate)}</span>],
  ];
  return (
    <>
      <Brand name={d.tenantName} right={<span className="flex items-center gap-1.5 text-[12.5px] font-medium text-verified"><CheckIcon className="size-3.5" strokeWidth={2.25} />Received</span>} />
      <main className="px-5 pt-8 pb-12">
        <div className="flex flex-col items-center text-center">
          <motion.span
            initial={move ? { opacity: 0, transform: "scale(0.8)" } : false}
            animate={{ opacity: 1, transform: "scale(1)" }}
            transition={{ duration: 0.26, ease: EASE }}
            className="grid size-14 place-items-center rounded-full bg-verified text-white"
          >
            <CheckIcon className="size-7" strokeWidth={2.5} />
          </motion.span>
          <h1 className="mt-5 font-display text-[30px] leading-tight tracking-[-0.02em] text-ink">Receipt confirmed</h1>
          <p className="mt-2 max-w-[340px] text-[15px] leading-relaxed text-ink-2">
            {d.shopName} received {plural(d.items.length, "piece")} from {d.agentName}{d.ackAt ? <> on <span className="num whitespace-nowrap">{dateTime(d.ackAt)}</span></> : null}.
          </p>
        </div>

        <motion.section
          aria-label="Receipt"
          initial={move ? { opacity: 0, transform: "translateY(8px)" } : false}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.28, ease: EASE, delay: move ? 0.06 : 0 }}
          className="relative mt-8 rounded-[14px] border border-line bg-white px-4 pt-4 pb-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)]"
        >
          <dl className="space-y-2 text-[14px]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4"><dt className="shrink-0 text-ink-3">{k}</dt><dd className="min-w-0 truncate text-right text-ink">{v}</dd></div>
            ))}
          </dl>
          <Perforation />
          <Items d={d} compact />
          <div className="my-4 border-t border-dashed border-line-strong" />
          <div className="flex items-baseline justify-between gap-3">
            <div><div className="text-[14px] font-medium text-ink">Total value</div><div className="num text-[12.5px] text-ink-3">{plural(d.items.length, "piece")} · {formatGrams(netWeight(d))} net</div></div>
            <span className="num text-[22px] leading-none font-semibold text-gold-ink">{formatINR(d.totalValuePaise)}</span>
          </div>
          {d.ackAt && (
            <div className="mt-4 flex items-center gap-2 rounded-[10px] bg-verified-soft px-3 py-2 text-[13px] text-verified">
              <CheckIcon className="size-4 shrink-0" strokeWidth={2.25} />Acknowledged <span className="num ml-auto whitespace-nowrap">{dateTime(d.ackAt)}</span>
            </div>
          )}
        </motion.section>

        <p className="mx-auto mt-6 max-w-[360px] text-center text-[13px] leading-relaxed text-ink-3">
          You can close this page. Return the pieces to {d.agentName.split(/\s+/)[0]} by {fmtWeekday(d.dueDate)}, or tell them which ones you&apos;d like to buy.
        </p>
      </main>
    </>
  );
}

/** A dashed tear line with a half-circle notch cut into each edge of the receipt. */
function Perforation() {
  return (
    <div className="relative my-4 border-t border-dashed border-line-strong" aria-hidden>
      <span className="absolute -top-2 -left-[25px] size-4 rounded-full border border-line bg-white [clip-path:inset(0_0_0_50%)]" />
      <span className="absolute -top-2 -right-[25px] size-4 rounded-full border border-line bg-white [clip-path:inset(0_50%_0_0)]" />
    </div>
  );
}

/* ---------- Invalid, expired, error, loading ---------- */
function Problem({ expired }: { expired: boolean }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-sunken text-ink-2" aria-hidden>{expired ? <Clock3Icon className="size-6" strokeWidth={1.75} /> : <LinkIcon className="size-6" strokeWidth={1.75} />}</span>
      <h1 className="mt-5 font-display text-[28px] leading-tight tracking-[-0.02em] text-ink">{expired ? "This link has expired" : "This link isn't valid"}</h1>
      <p className="mt-3 max-w-[320px] text-[15px] leading-relaxed text-ink-2">
        {expired
          ? "Acknowledgement links last 72 hours. Ask the agent to open a new QR code on their phone, then scan it again."
          : "It may have been mistyped or replaced by a newer one. Ask the agent to show you the QR code again."}
      </p>
      <p className="mt-6 flex items-center gap-1.5 text-[12.5px] text-ink-3"><LockIcon className="size-3.5" />Nothing has been confirmed from this link.</p>
    </main>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-display text-[28px] leading-tight tracking-[-0.02em] text-ink">Something went wrong</h1>
      <p className="mt-3 max-w-[320px] text-[15px] leading-relaxed text-ink-2">{message}</p>
      <button type="button" onClick={onRetry} className="mt-6 inline-flex h-11 items-center gap-2 rounded-[10px] border border-line-strong bg-white px-4 text-[15px] font-medium text-ink outline-none transition-[scale,background-color] duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-blue/30 active:scale-[0.98] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-hover">
        <RefreshCwIcon className="size-4" />Try again
      </button>
    </main>
  );
}

function AckSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the memo">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-5"><Skeleton className="size-7 rounded-[7px]" /><Skeleton className="h-4 w-28" /></div>
      <div className="space-y-3 px-5 pt-7">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-3 h-[58px] w-full rounded-[12px]" />
        <Skeleton className="h-[62px] w-full rounded-[12px]" />
        <Skeleton className="mt-4 h-40 w-full rounded-[12px]" />
      </div>
    </div>
  );
}
