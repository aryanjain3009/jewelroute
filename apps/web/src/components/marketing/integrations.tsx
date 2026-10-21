/** Integrations: JewelRoute → signed webhooks → ERP / accounting / internal systems, four example
 *  events, link to /developers. No payloads here. Reference: the split "SDK/API" block — claim and
 *  button on the left, one diagram on the right. Server-rendered. */
import { ArrowDownIcon, ArrowRightIcon, KeyRoundIcon } from "lucide-react";
import { EVENT_DESCRIPTIONS } from "@jewelroute/shared";
import { Logo } from "@/components/jr/logo";
import { cn } from "@/lib/utils";
import { CtaLink, Eyebrow, Heading, Section, Stage } from "./primitives";

const EVENTS = ["visit.completed", "order.created", "memo.created", "sample.custody_changed"] as const;
const TARGETS = [["ERP", "Orders and stock"], ["Accounting", "Invoices and dues"], ["Internal systems", "Alerts, BI, WhatsApp"]] as const;
const mono = "font-[ui-monospace,SFMono-Regular,Menlo,monospace]";

export function IntegrationsSection() {
  return (
    <Section id="integrations" labelledBy="integrations-title">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="px-5 pt-20 pb-12 sm:px-8 md:pt-28 lg:px-14 lg:py-32">
          <Eyebrow>Integrations</Eyebrow>
          <Heading id="integrations-title" className="mt-4 max-w-[520px]" lead="Signed webhooks." rest="Every visit, order, memo and custody move, delivered to the systems you already run." />
          <div className="mt-8"><CtaLink href="/developers" tone="secondary">Read the developer docs<ArrowRightIcon className="size-4" /></CtaLink></div>
        </div>
        <Stage className="flex items-center border-t border-line px-4 py-12 sm:px-8 lg:border-t-0 lg:border-l lg:px-14 lg:py-20">
          <div className="mx-auto w-full max-w-[560px]" aria-hidden inert>
            {/* source */}
            <div className="overflow-hidden rounded-[12px] border border-line bg-white">
              <div className="flex h-11 items-center gap-2 border-b border-line px-3.5"><Logo className="[&>span]:text-[15px] [&>svg]:size-5" /><span className="ml-auto text-[12px] text-ink-3 max-sm:hidden">Outbox · same transaction as the change</span></div>
              <ul className="divide-y divide-line">
                {EVENTS.map((e) => (
                  <li key={e} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className={cn("shrink-0 text-[13px] text-ink", mono)}>{e}</span>
                    <span className="min-w-0 truncate text-[12.5px] text-ink-3 max-sm:hidden">{EVENT_DESCRIPTIONS[e]}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* transport */}
            <div className="flex flex-col items-center py-3 text-ink-3">
              <span className="h-5 w-px bg-line-strong" />
              <span className="flex items-center gap-1.5 rounded-[8px] border border-line-strong bg-white px-2.5 py-1 text-[12.5px] font-medium text-ink"><KeyRoundIcon className="size-3.5 text-ink-2" />HMAC-SHA256 signed · retried up to 6 times</span>
              <span className="h-5 w-px bg-line-strong" />
              <ArrowDownIcon className="-mt-1 size-3.5" />
            </div>
            {/* destinations */}
            <div className="grid grid-cols-3 gap-2">
              {TARGETS.map(([t, d]) => (
                <div key={t} className="rounded-[12px] border border-line bg-white px-3 py-3">
                  <div className="text-[13.5px] font-medium text-ink">{t}</div>
                  <div className="mt-0.5 text-[12px] leading-snug text-ink-3">{d}</div>
                </div>
              ))}
            </div>
          </div>
        </Stage>
      </div>
    </Section>
  );
}
