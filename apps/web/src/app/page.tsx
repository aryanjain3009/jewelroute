import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/jr/logo";
import { HeroTrail } from "@/components/marketing/hero-trail";
import { CommandFragment, FenceFragment, MemoFragment, PriceFragment, WebhookFragment } from "@/components/marketing/fragments";

export const metadata: Metadata = {
  title: { absolute: "JewelRoute — know where every gram of your samples is" },
  description: "Field sales for jewellery manufacturers and wholesalers: GPS-verified shop visits, orders priced from today's gold rate, and a custody ledger for every sample that leaves your vault.",
};

const btnInk = "inline-flex h-11 items-center justify-center rounded-[10px] bg-ink px-5 text-[15px] font-medium text-paper transition-colors hover:bg-ink/85";
const btnLine = "inline-flex h-11 items-center justify-center rounded-[10px] border border-line-strong bg-surface px-5 text-[15px] font-medium text-ink transition-colors hover:border-ink/40";

function Capability({ title, body, facts, children, flip }: { title: string; body: string; facts: string[]; children: React.ReactNode; flip?: boolean }) {
  return (
    <section className="grid grid-cols-1 items-center gap-8 py-14 md:py-20 lg:grid-cols-12 lg:gap-14">
      <div className={flip ? "min-w-0 lg:order-2 lg:col-span-5" : "min-w-0 lg:col-span-5"}>
        <h2 className="max-w-[18ch] font-display text-[32px] leading-[1.08] tracking-[-0.02em] text-ink sm:text-[40px]">{title}</h2>
        <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">{body}</p>
        <ul className="mt-5 space-y-2 text-[14.5px] text-ink-2">
          {facts.map((f) => <li key={f} className="flex gap-3"><span className="mt-[9px] h-px w-3 shrink-0 bg-ink-3" aria-hidden />{f}</li>)}
        </ul>
      </div>
      <div className={flip ? "min-w-0 lg:order-1 lg:col-span-7" : "min-w-0 lg:col-span-7"}>{children}</div>
    </section>
  );
}

const DAY = [
  { time: "9:00 am", title: "Morning issue", body: "The vault issues tagged samples to each salesman's bag. Every piece, weight and value is on record before anyone leaves." },
  { time: "11:00 am", title: "Visits", body: "Each shop on the route is checked in from inside its geofence, with an arrival photo the server stamps and hashes." },
  { time: "12:00 pm", title: "Memo and order", body: "Orders are priced from this morning's gold rate. Samples left behind go on a memo the retailer confirms on their own phone." },
  { time: "7:00 pm", title: "Evening reconciliation", body: "The bag is counted against the ledger. What came back, what is at which shop, and what is due when, without a single phone call." },
];

const TRUST = [
  ["Tenant isolation", "Every query is scoped to your company from the signed session. One firm's data is never readable by another."],
  ["Append-only custody ledger", "A piece's custody changes in the same database transaction as the memo, issue or return that caused it. Nothing is edited after the fact."],
  ["Audit trail", "Rate changes, approvals, secret reveals and memo extensions are recorded with who did it and when."],
  ["Signed webhooks", "Every delivery carries an HMAC-SHA256 signature and timestamp, and is retried with backoff until your system confirms it."],
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-warm">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-5 sm:px-8">
          <Link href="/" aria-label="JewelRoute home"><Logo /></Link>
          <nav className="hidden items-center gap-6 text-[14px] text-ink-2 md:flex">
            <a href="#visits" className="hover:text-ink">Product</a>
            <a href="#day" className="hover:text-ink">How a day runs</a>
            <a href="#trust" className="hover:text-ink">Security</a>
            <Link href="/developers" className="hover:text-ink">Developers</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="hidden h-9 items-center rounded-[10px] px-3 text-[14px] font-medium text-ink hover:bg-sunken sm:inline-flex">Sign in</Link>
            <Link href="/login" className="inline-flex h-9 items-center rounded-[10px] bg-ink px-4 text-[14px] font-medium text-paper hover:bg-ink/85">Try the live demo</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <div className="bg-warm">
        <section className="mx-auto max-w-[1200px] px-5 pt-14 pb-16 sm:px-8 md:pt-20 md:pb-24">
          <h1 className="max-w-[17ch] font-display text-[42px] leading-[1.02] tracking-[-0.025em] text-ink sm:text-[56px] lg:text-[72px]">
            Know where every salesman went, what he sold, and where every gram is.
          </h1>
          <div className="mt-7 grid grid-cols-1 gap-8 lg:grid-cols-12">
            <p className="max-w-[56ch] text-[17px] leading-relaxed text-ink-2 lg:col-span-7">
              JewelRoute is the field sales system for jewellery manufacturers and wholesalers. Shop visits are verified by GPS and photo, orders are priced from today&apos;s gold rate, and every sample that leaves your vault has a custodian at every moment.
            </p>
            <div className="flex flex-wrap items-start gap-3 lg:col-span-5 lg:justify-end">
              <Link href="/login" className={btnInk}>Try the live demo</Link>
              <Link href="/login" className={btnLine}>Sign in</Link>
            </div>
          </div>
          <div className="mt-12 md:mt-16">
            <HeroTrail />
            <p className="mt-3 text-[13px] text-ink-3">One sample, one morning. Each hand-over is a row in the custody ledger, with the evidence attached.</p>
          </div>
        </section>
        </div>

        <div className="border-t border-line">
          <div className="mx-auto max-w-[1200px] divide-y divide-line px-5 sm:px-8">
            <div id="visits">
              <Capability
                title="A visit only counts from inside the shop."
                body="Each retailer has a geofence. Check-in opens when the salesman's phone is within it, and the arrival photo is stored with its location, time and checksum. Demo-mode check-ins are labelled as simulated, never as verified."
                facts={["Distance and GPS accuracy recorded on every check-in", "Photo is uploaded straight to storage and hashed on arrival", "A visit can't be completed without proof"]}
              >
                <FenceFragment />
              </Capability>
            </div>
            <Capability flip
              title="Samples leave on a memo the retailer signs for."
              body="Pick the exact tagged pieces, set a due date, and the retailer confirms on their own phone by scanning a QR code or reading back a six-digit code. Custody moves from the salesman to the shop in the same step."
              facts={["Exact pieces, net weights and values on the memo", "Due-soon and overdue memos surface on their own", "Partial returns and conversion to an order from the same memo"]}
            >
              <MemoFragment />
            </Capability>
            <Capability
              title="Every price starts from this morning's gold rate."
              body="Set the 22K, 18K and 24K rates once. The catalog reprices instantly: gold value from net weight, making per gram or as a percentage, stones and GST. Each order freezes the rate it was booked at."
              facts={["Integer paise and milligrams end to end, no rounding drift", "Rate history is append-only", "Every order waits for a manager's approval before production"]}
            >
              <PriceFragment />
            </Capability>
            <Capability flip
              title="Every shop, order and sample is a record you can open."
              body="Home shows today's orders, visits, samples outside and what needs attention. Shops, agents, orders, memos and samples are tables you can filter, select and act on, and every record keeps its own activity and audit trail."
              facts={["Select pending orders and approve them in one step", "Extend a memo or assign a visit from the record it belongs to", "Where every piece is: vault, a salesman's bag, or the shop it was left at"]}
            >
              <CommandFragment />
            </Capability>
            <Capability
              title="Your ERP hears about it the moment it happens."
              body="Send check-ins, orders, memos and custody changes to Tally connectors, your ERP or a WhatsApp bot. Each event is signed, retried with backoff, and visible in a delivery log you can replay."
              facts={["Twelve event types, subscribe per endpoint", "HMAC-SHA256 signatures with a five-minute replay window", "Dead-letter list and one-click retry"]}
            >
              <WebhookFragment />
            </Capability>
          </div>
        </div>

        {/* A day */}
        <section id="day" className="border-t border-line bg-warm">
          <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 md:py-24">
            <h2 className="max-w-[20ch] font-display text-[32px] leading-[1.08] tracking-[-0.02em] sm:text-[40px]">How a day runs with JewelRoute</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-4 md:gap-6">
              {DAY.map((d, i) => (
                <li key={d.title} className="relative border-t border-ink pt-4">
                  <div className="flex items-baseline gap-3"><span className="text-[13px] font-semibold text-ink num">{i + 1}</span><span className="text-[13px] text-ink-3 num">{d.time}</span></div>
                  <h3 className="mt-2 text-[17px] font-semibold text-ink">{d.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{d.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="border-t border-line">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-12">
            <h2 className="font-display text-[32px] leading-[1.08] tracking-[-0.02em] sm:text-[40px] lg:col-span-4">Built for goods worth more than the building they&apos;re in.</h2>
            <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-8">
              {TRUST.map(([t, b]) => (
                <div key={t} className="border-t border-line pt-4">
                  <dt className="text-[15px] font-semibold text-ink">{t}</dt>
                  <dd className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-line bg-ink text-paper">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-end md:justify-between md:py-20">
            <div>
              <h2 className="max-w-[22ch] font-display text-[32px] leading-[1.08] tracking-[-0.02em] sm:text-[44px]">Walk Rahul&apos;s route, then see it from the manager&apos;s desk.</h2>
              <p className="mt-3 max-w-[52ch] text-[15px] text-paper/70">The demo runs on a real database: check in, book an order, leave samples on memo and watch Home, the records and the webhook log update.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex h-11 items-center rounded-[10px] bg-paper px-5 text-[15px] font-medium text-ink hover:bg-paper/90">Try the live demo</Link>
              <Link href="/login" className="inline-flex h-11 items-center rounded-[10px] border border-paper/25 px-5 text-[15px] font-medium text-paper hover:border-paper/60">Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-10 text-[13.5px] text-ink-2 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4"><Logo /><span className="text-ink-3">Field sales for jewellery makers and wholesalers.</span></div>
          <nav className="flex flex-wrap gap-5">
            <Link href="/login" className="hover:text-ink">Sign in</Link>
            <Link href="/developers" className="hover:text-ink">API &amp; webhooks</Link>
            <a href="/api/docs" className="hover:text-ink">OpenAPI reference</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
