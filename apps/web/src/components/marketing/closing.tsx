/** Trust row (four short statements on hairlines) and the closing call to action. Server-rendered. */
import { cn } from "@/lib/utils";
import { CtaLink, Heading, INSET, Section } from "./primitives";

const TRUST = [
  { t: "Tenant isolated", d: "Every query is scoped to your workspace from the signed session." },
  { t: "Auditable custody", d: "An append-only ledger with exactly one holder per piece." },
  { t: "Historical pricing preserved", d: "Orders keep the gold rate they were booked at." },
  { t: "Signed integrations", d: "HMAC-signed webhooks, retried, with a dead-letter queue." },
];

export function TrustAndCta() {
  return (
    <Section id="trust" labelledBy="trust-title">
      <h2 id="trust-title" className="sr-only">Built to be trusted with gold</h2>
      <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
        {TRUST.map((x) => (
          <li key={x.t} className="bg-white px-5 py-7 sm:px-8 lg:px-10">
            <p className="text-[15px] font-medium text-ink">{x.t}</p>
            <p className="mt-1 max-w-[30ch] text-[14px] leading-snug text-ink-2">{x.d}</p>
          </li>
        ))}
      </ul>
      <div className={cn(INSET, "flex flex-col items-center border-t border-line py-24 text-center md:py-32")}>
        <Heading size="xl" lead="Walk Rahul's route yourself." />
        <p className="mt-5 max-w-[520px] text-pretty text-[17px] leading-[1.45] font-medium text-ink-2">
          Sign in to the demo workspace and follow the same check-in, order and memo, as Rahul and as Priya.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <CtaLink href="/developers" tone="secondary">Developer docs</CtaLink>
          <CtaLink href="/login">Explore live demo</CtaLink>
        </div>
      </div>
    </Section>
  );
}
