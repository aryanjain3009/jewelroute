"use client";
/** Verified visit. The claim and the four outcomes of a check-in sit on the left, as vertical tabs
 *  (Radix Tabs): Verified, Low accuracy, Simulated, Refused — the three `GeoVerification` values the
 *  API records plus the server's refusal. Each one switches the frame on the right to that state: the
 *  shop's 100 m fence with Rahul's fix, and what the server wrote down (or that it wrote nothing).
 *  Switching is instant (a repeated, explanatory action; no animation). Sample data, labelled. */
import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { AlertTriangleIcon, BadgeCheckIcon, CameraIcon, FlaskConicalIcon, LocateIcon, ShieldCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IMG } from "./data";
import { FenceMap, Photo } from "./kit";
import { Eyebrow, Heading, SampleTag, Section, Stage } from "./primitives";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;
type Id = "verified" | "low" | "simulated" | "refused";
const STATES: { id: Id; icon: Icon; tone: string; title: string; text: string }[] = [
  { id: "verified", icon: BadgeCheckIcon, tone: "text-verified", title: "Verified", text: "Inside the fence, GPS accurate to 75 m or better." },
  { id: "low", icon: LocateIcon, tone: "text-warn", title: "Low accuracy", text: "Inside the fence on a weak fix. Accepted, and flagged." },
  { id: "simulated", icon: FlaskConicalIcon, tone: "text-info", title: "Simulated", text: "Demo workspaces only. Never shown as verified." },
  { id: "refused", icon: AlertTriangleIcon, tone: "text-danger", title: "Refused", text: "Outside the fence. The server recomputes the distance." },
];

const FRAME: Record<Id, { map: React.ComponentProps<typeof FenceMap>; status: React.ReactNode; rows?: [string, string][] }> = {
  verified: {
    map: { agent: { x: 352, y: 122 }, distance: "38 m" },
    status: <span className="flex items-center gap-1.5 font-medium text-verified"><span className="size-2 rounded-full bg-verified" />Verified · 38 m from the shop</span>,
    rows: [["Checked in", "11:42 am"], ["Distance", "38 m · fence 100 m"], ["Accuracy", "±9 m"], ["Photo", "11:43 am, server time"], ["SHA-256", "cc23231c…9f04"]],
  },
  low: {
    map: { agent: { x: 360, y: 168 }, distance: "41 m", halo: 64 },
    status: <span className="flex items-center gap-1.5 font-medium text-warn"><span className="size-2 rounded-full bg-warn" />Low accuracy · ±92 m, flagged</span>,
    rows: [["Checked in", "11:42 am"], ["Distance", "41 m · fence 100 m"], ["Accuracy", "±92 m (over 75 m)"], ["Photo", "11:43 am, server time"], ["Flag", "Shown on the visit"]],
  },
  simulated: {
    map: { agent: { x: 330, y: 138 }, distance: "Simulated", tone: "info" },
    status: <span className="flex items-center gap-1.5 font-medium text-info"><span className="size-2 rounded-full bg-info" />Simulated arrival · demo workspace</span>,
    rows: [["Checked in", "11:42 am"], ["Recorded as", "SIMULATED"], ["Shown as", "Simulated, never verified"], ["Photo", "11:43 am, server time"], ["Allowed in", "Demo workspaces only"]],
  },
  refused: {
    map: { agent: { x: 446, y: 262 }, distance: "214 m", tone: "grey" },
    status: <span className="flex items-center gap-1.5 font-medium text-danger"><span className="size-2 rounded-full bg-danger" />Refused · 214 m from the shop</span>,
  },
};

function Frame({ id }: { id: Id }) {
  const f = FRAME[id];
  return (
    <figure className="mx-auto w-full max-w-[680px]" aria-label={`Sample data: check-in state ${id} at Sharma Jewellers`}>
      <div aria-hidden inert>
        <div className="overflow-hidden rounded-[12px] border border-line bg-white">
          <div className="flex h-10 items-center gap-2 border-b border-line px-3.5 text-[13px]">
            <ShieldCheckIcon className="size-4 text-ink-2" strokeWidth={1.75} />
            <span className="font-medium text-ink">Sharma Jewellers</span>
            <span className="text-ink-3 max-sm:hidden">Bank Street, Karol Bagh</span>
            <SampleTag className="ml-auto" />
          </div>
          <FenceMap {...f.map} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3.5 py-2.5 text-[12.5px]">{f.status}<span className="num ml-auto text-ink-3">11:42 am</span></div>
        </div>
        {f.rows ? (
          <div className="mt-3 grid overflow-hidden rounded-[12px] border border-line bg-white sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Photo src={IMG.counter} alt="" className="aspect-[16/9] w-full sm:aspect-auto sm:h-full" sizes="(min-width: 640px) 300px, 100vw" />
            <div className="min-w-0 border-line max-sm:border-t sm:border-l">
              <div className="flex h-10 items-center gap-1.5 border-b border-line px-3.5 text-[13px] font-medium text-ink"><CameraIcon className="size-4 text-ink-3" strokeWidth={1.75} />Arrival photo<span className="ml-auto text-[12px] font-normal text-ink-3">written once</span></div>
              <dl className="divide-y divide-line px-3.5 text-[12.5px]">
                {f.rows.map(([k, v]) => (
                  <div key={k} className="flex h-8 items-center justify-between gap-3"><dt className="text-ink-2">{k}</dt><dd className="num truncate text-ink">{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-[12px] border border-line bg-white px-4 py-4 text-[13px]">
            <div className="flex gap-2.5 rounded-[10px] border border-warn/25 bg-warn-soft px-3 py-2.5 text-warn">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              <span>You&apos;re 214 m from Sharma Jewellers. Check-in opens within 100 m.</span>
            </div>
            <p className="mt-3 text-ink-2">Nothing is written: no check-in, no photo, no event. The visit stays planned until Rahul is inside the fence.</p>
          </div>
        )}
      </div>
    </figure>
  );
}

export function VerifiedVisitSection() {
  const [id, setId] = React.useState<Id>("verified");
  return (
    <Section id="visit" labelledBy="visit-title">
      <TabsPrimitive.Root value={id} onValueChange={(v) => setId(v as Id)} orientation="vertical" className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="px-5 pt-20 pb-10 sm:px-8 md:pt-28 lg:px-14 lg:pt-32 lg:pb-24">
          <Eyebrow>Verified visits</Eyebrow>
          <Heading id="visit-title" className="mt-4" lead="Proof that he was there." rest="Check-in opens only inside the shop's fence, and the arrival photo is stamped on the server." />
          <TabsPrimitive.List aria-label="Check-in outcomes" className="mt-10 flex flex-col divide-y divide-line border-y border-line">
            {STATES.map((s) => (
              <TabsPrimitive.Trigger
                key={s.id}
                value={s.id}
                className="group relative flex min-h-[68px] items-start gap-3.5 px-1 py-3.5 text-left outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-blue/30 data-[state=active]:bg-selected data-[state=active]:shadow-[inset_2px_0_0_var(--jr-ink)] [@media(hover:hover)_and_(pointer:fine)]:data-[state=inactive]:hover:bg-hover"
              >
                <s.icon className={cn("mt-0.5 ml-2.5 size-[18px] shrink-0", s.tone)} strokeWidth={1.75} />
                <span className="text-[15px] leading-snug text-ink-2"><span className="font-medium text-ink">{s.title}.</span> {s.text}</span>
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        </div>
        <Stage className="flex items-center border-t border-line px-4 py-8 lg:min-h-[720px] sm:px-8 lg:border-t-0 lg:border-l lg:px-12 lg:py-16">
          {STATES.map((s) => (
            <TabsPrimitive.Content key={s.id} value={s.id} className="w-full outline-none">
              <Frame id={s.id} />
            </TabsPrimitive.Content>
          ))}
        </Stage>
      </TabsPrimitive.Root>
    </Section>
  );
}
