"use client";
/** The one page-load moment: a single sample piece moving Vault → Rahul → Sharma Jewellers,
 *  with the evidence JewelRoute records at each hand-over. Reduced motion shows the final state. */
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { CameraIcon, CheckIcon, RotateCcwIcon, ShieldCheckIcon } from "lucide-react";
import { formatGrams, formatINR } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import { PIECE, PIECE_PRICE } from "./data";

const STOPS = [
  { who: "Vault", where: "Aurum Jewels, Karol Bagh", time: "9:05 am", verb: "Issued for field sales" },
  { who: "Rahul Verma", where: "Field bag", time: "11:42 am", verb: "Checked in at the shop" },
  { who: "Sharma Jewellers", where: "Bank Street, Karol Bagh", time: "11:58 am", verb: "Left on memo" },
];

function FenceMini({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 120 84" className="h-[84px] w-[120px] shrink-0" aria-hidden>
      <rect width="120" height="84" rx="10" fill="#f5f3ee" />
      <path d="M0 52 L120 38 M38 0 L54 84 M0 18 L120 26" stroke="#e9e5dc" strokeWidth="5" />
      <circle cx="60" cy="42" r="30" fill={on ? "rgb(44 122 84 / .1)" : "rgb(176 138 53 / .08)"} stroke={on ? "#2c7a54" : "#b08a35"} strokeWidth="1.2" strokeDasharray="3 3" style={{ transition: "all .6s" }} />
      <circle cx="60" cy="42" r="5" fill="#191714" />
      <circle cx="60" cy="42" r="2" fill="#fcfbf8" />
      <g style={{ transform: on ? "translate(0,0)" : "translate(34px,-26px)", transition: "transform 1s cubic-bezier(.2,.7,.2,1)" }}>
        <circle cx="74" cy="34" r="9" fill="rgb(47 95 143 / .15)" />
        <circle cx="74" cy="34" r="4" fill="#2f5f8f" stroke="#fff" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

export function HeroTrail() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0); // 0 = vault only … 3 = done
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (reduce) { setStep(3); return; }
    setStep(0);
    const ts = [setTimeout(() => setStep(1), 500), setTimeout(() => setStep(2), 1900), setTimeout(() => setStep(3), 3500)];
    return () => ts.forEach(clearTimeout);
  }, [reduce, run]);
  const holder = STOPS[Math.max(0, Math.min(step, 3) - 1)] ?? STOPS[0];

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-line bg-surface">
      {/* Piece header */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://images.unsplash.com/photo-1758995116383-f51775896add?w=240&q=70&auto=format&fit=crop" alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-ink">22K {PIECE.name}</div>
          <div className="text-[13px] text-ink-3 num">{PIECE.tag} · {formatGrams(PIECE.netWeightMg)} net</div>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-ink-3">Value at today&apos;s rate</div>
            <div className="text-[15px] font-semibold text-gold-ink num">{formatINR(PIECE_PRICE.unitPricePaise)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-3">Right now with</div>
            <div key={holder.who} className="animate-in fade-in text-[15px] font-semibold text-ink duration-500">{step === 0 ? "Vault" : holder.who}</div>
          </div>
        </div>
      </div>

      {/* Track */}
      <div className="px-5 pt-6 pb-5 sm:px-6">
        <ol className="relative grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-5">
          {/* connecting rule (desktop) */}
          <div className="pointer-events-none absolute top-[9px] right-[calc((100%-40px)/3-9px)] left-[9px] hidden h-px bg-line md:block" aria-hidden>
            <div className="h-px origin-left bg-gold transition-transform duration-[1400ms] ease-[cubic-bezier(.3,.7,.2,1)]" style={{ transform: `scaleX(${step <= 1 ? 0 : step === 2 ? 0.5 : 1})` }} />
          </div>
          {/* connecting rule (mobile) */}
          <div className="pointer-events-none absolute top-[9px] bottom-6 left-[9px] w-px bg-line md:hidden" aria-hidden>
            <div className="w-px origin-top bg-gold transition-transform duration-[1400ms]" style={{ height: "100%", transform: `scaleY(${step <= 1 ? 0 : step === 2 ? 0.5 : 1})` }} />
          </div>

          {STOPS.map((s, i) => {
            const reached = step >= i + 1 || (i === 0 && step >= 0);
            const current = (step === 0 && i === 0) || (step >= 1 && i === Math.min(step, 3) - 1);
            return (
              <li key={s.who} className="relative min-w-0 pl-8 md:pl-0">
                <span className={cn("absolute top-0 left-0 grid size-[19px] place-items-center rounded-full border-[1.5px] bg-surface transition-colors duration-500 md:relative", reached ? "border-gold" : "border-line-strong")}>
                  <span className={cn("size-[9px] rounded-full transition-all duration-500", current ? "scale-100 bg-gold" : reached ? "scale-75 bg-gold/50" : "scale-50 bg-line-strong")} />
                </span>
                <div className={cn("transition-opacity duration-500 md:mt-3", reached ? "opacity-100" : "opacity-40")}>
                  <div className="text-[15px] font-semibold text-ink">{s.who}</div>
                  <div className="text-[13px] text-ink-3">{s.where}</div>
                  <div className="mt-1 text-[12.5px] text-ink-2 num">{s.time} · {s.verb}</div>
                </div>
                <div className={cn("mt-3 transition-all duration-700", step >= i + 1 || (i === 0 && step >= 1) ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0")} aria-hidden={!(step >= i + 1)}>
                  {i === 0 && (
                    <div className="rounded-xl bg-sunken px-3.5 py-3 text-[12.5px] text-ink-2">
                      <div className="flex justify-between"><span>Issued by</span><span className="text-ink">Priya Mehta</span></div>
                      <div className="flex justify-between"><span>Bag value after issue</span><span className="font-medium text-gold-ink num">₹11.5L</span></div>
                      <div className="flex justify-between"><span>Ledger entry</span><span className="text-ink num">#41</span></div>
                    </div>
                  )}
                  {i === 1 && (
                    <div className="flex items-center gap-3 rounded-xl bg-sunken p-2 pr-3.5">
                      <FenceMini on={step >= 2} />
                      <div className="min-w-0 text-[12.5px]">
                        <div className="inline-flex items-center gap-1 rounded-full bg-verified-soft px-2 py-0.5 font-medium text-verified"><CheckIcon className="size-3.5" />Location verified</div>
                        <div className="mt-1.5 text-ink-2 xl:whitespace-nowrap num">38 m from shop · 100 m fence</div>
                        <div className="mt-0.5 inline-flex items-center gap-1 text-ink-3"><CameraIcon className="size-3.5" />Arrival photo · 11:43 am</div>
                      </div>
                    </div>
                  )}
                  {i === 2 && (
                    <div className="rounded-xl bg-sunken px-3.5 py-3 text-[12.5px] text-ink-2">
                      <div className="flex justify-between"><span>Memo</span><span className="text-ink num">MEMO-2026-00017</span></div>
                      <div className="flex justify-between"><span>Due back</span><span className="font-medium text-ink num">26 Oct</span></div>
                      <div className="mt-1 flex items-center gap-1 text-verified"><ShieldCheckIcon className="size-3.5" />Retailer confirmed with code 48 29 13</div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {!reduce && step === 3 && (
          <button onClick={() => setRun((r) => r + 1)} className="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
            <RotateCcwIcon className="size-3" />Replay the hand-over
          </button>
        )}
        <span className="sr-only">Sample {PIECE.tag} was issued from the vault to Rahul Verma at 9:05 am, checked in at Sharma Jewellers 38 metres from the shop at 11:42 am, and left on memo MEMO-2026-00017 due 26 October, confirmed by the retailer.</span>
      </div>
    </div>
  );
}
