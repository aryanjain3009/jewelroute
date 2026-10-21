"use client";
/** Event catalogue: every webhook event type, grouped by object, with its description (from
 *  @jewelroute/shared EVENT_DESCRIPTIONS) and its example payload (the API's own EXAMPLES).
 *  Radix Accordion, single selection. On wide screens the selected event's payload is shown in the
 *  sticky code column (Stripe pattern); on phones it opens inline under the row. */
import * as React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { ChevronRightIcon } from "lucide-react";
import { EVENT_DESCRIPTIONS, WEBHOOK_EVENT_TYPES, type WebhookEventType } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import { CodePanel } from "./code-panel";
import { EVENTS } from "./examples";
import { MONO } from "./prose";


const GROUPS: { title: string; prefix: string }[] = [
  { title: "Visits", prefix: "visit." },
  { title: "Orders", prefix: "order." },
  { title: "Memos", prefix: "memo." },
  { title: "Samples", prefix: "sample." },
];

function envelope(type: WebhookEventType) {
  const e = EVENTS[type];
  return JSON.stringify(e ? { id: e.id, type: e.type, tenantId: e.tenantId, createdAt: e.createdAt, data: e.data } : { type }, null, 2);
}

export function EventCatalogue() {
  const [value, setValue] = React.useState<string>("order.created");
  // Collapsing a row (phones) keeps the last event in the wide-screen code column.
  const [last, setLast] = React.useState<string>("order.created");
  const groups = [...GROUPS.map((g) => ({ title: g.title, types: WEBHOOK_EVENT_TYPES.filter((t) => t.startsWith(g.prefix)) as WebhookEventType[] })), { title: "Testing", types: ["ping"] as WebhookEventType[] }];
  const selected = (value || last) as WebhookEventType;
  return (
    <div className="grid gap-x-12 gap-y-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <AccordionPrimitive.Root type="single" collapsible value={value} onValueChange={(v) => { setValue(v); if (v) setLast(v); }} className="min-w-0 max-w-[640px] space-y-6">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-2 flex items-baseline gap-2"><h3 className="text-[14px] font-semibold text-ink">{g.title}</h3><span className="num text-[12.5px] text-ink-3">{g.types.length}</span></div>
            <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
              {g.types.map((t) => (
                <AccordionPrimitive.Item key={t} value={t} className="group/item">
                  <AccordionPrimitive.Header asChild>
                    <div>
                      <AccordionPrimitive.Trigger className="relative flex min-h-11 w-full items-start gap-3 px-3.5 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-blue/30 data-[state=open]:bg-selected data-[state=open]:shadow-[inset_2px_0_0_var(--jr-ink)] [@media(hover:hover)_and_(pointer:fine)]:data-[state=closed]:hover:bg-hover">
                        <ChevronRightIcon className="mt-[3px] size-3.5 shrink-0 text-ink-3 transition-transform duration-200 ease-out group-data-[state=open]/item:rotate-90 xl:hidden" />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-[13px] font-medium text-ink", MONO)}>{t}</span>
                          <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{EVENT_DESCRIPTIONS[t]}</span>
                        </span>
                      </AccordionPrimitive.Trigger>
                    </div>
                  </AccordionPrimitive.Header>
                  <AccordionPrimitive.Content className="xl:hidden">
                    <div className="border-t border-line bg-sunken p-2.5"><CodePanel title={<><span className={MONO}>{t}</span><span className="text-[#a1a1aa]"> · payload</span></>} snippets={[{ label: "JSON", lang: "json", code: envelope(t) }]} numbers={false} /></div>
                  </AccordionPrimitive.Content>
                </AccordionPrimitive.Item>
              ))}
            </div>
          </div>
        ))}
      </AccordionPrimitive.Root>
      <div className="hidden min-w-0 xl:block">
        <div className="sticky top-24">
          <CodePanel key={selected} title={<><span className={cn("text-white", MONO)}>{selected}</span><span className="text-[#a1a1aa]"> · real payload</span></>} snippets={[{ label: "JSON", lang: "json", code: envelope(selected) }]} />
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">Select an event on the left to see a payload captured from a real delivery. Treat unknown fields as additive; new ones can appear without notice.</p>
        </div>
      </div>
    </div>
  );
}
