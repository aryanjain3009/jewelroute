/** Landing-page building blocks: browser and phone frames, section headings, small product
 *  primitives that mirror the app (object squares, the field map, catalogue photos). Server-safe. */
import Image from "next/image";
import { LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/** The app's object colours (mirrors `OBJECT_TINT` in components/app/shell.tsx). */
export const TINT = {
  home: "bg-[#6e6f73]", visits: "bg-[#2f6bf2]", agents: "bg-[#7a5af5]", shops: "bg-[#0f9f8f]",
  orders: "bg-[#e5732b]", memos: "bg-[#b08a35]", samples: "bg-[#c2410c]", catalog: "bg-[#d1477a]",
  integrations: "bg-[#1c1d1f]", settings: "bg-[#6e6f73]",
} as const;

export function ObjectSquare({ icon: I, tint, size = 18 }: { icon: Icon; tint: string; size?: number }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-[5px] text-white", tint)} style={{ width: size, height: size }} aria-hidden>
      <I className={size > 18 ? "size-3.5" : "size-3"} strokeWidth={2.2} />
    </span>
  );
}

/** Flat browser window: hairline, one float shadow (it floats), address bar, "Sample data" marker. */
export function BrowserFrame({ url, children, className, bodyClassName }: { url: string; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[14px] border border-line-strong bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_64px_-24px_rgb(28_29_31/0.18)]", className)}>
      <div className="flex h-10 items-center gap-3 border-b border-line bg-[#fbfbfa] px-3.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#e3e3e3]" /><span className="size-2.5 rounded-full bg-[#e3e3e3]" /><span className="size-2.5 rounded-full bg-[#e3e3e3]" />
        </div>
        <div className="mx-auto flex h-6 min-w-0 max-w-[420px] flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-3 text-[12px] text-ink-3 ring-1 ring-line">
          <LockIcon className="size-3 shrink-0" strokeWidth={2} />
          <span className="truncate">{url}</span>
        </div>
        <span className="hidden h-5 shrink-0 items-center rounded-[5px] bg-[#f1f1f2] px-1.5 text-[11.5px] font-medium text-ink-2 sm:inline-flex">Sample data</span>
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** A phone at field-app proportions. Content is the real field layout at 14–17 px. */
export function PhoneFrame({ children, className, time = "11:59" }: { children: React.ReactNode; className?: string; time?: string }) {
  return (
    <div className={cn("relative w-[320px] shrink-0 overflow-hidden rounded-[38px] border border-line-strong bg-white p-[7px] shadow-[0_1px_2px_rgb(0_0_0/0.05),0_20px_50px_-20px_rgb(28_29_31/0.22)]", className)}>
      <div className="relative flex h-full flex-col overflow-hidden rounded-[31px] border border-line bg-white">
        <div className="flex h-8 shrink-0 items-center justify-between px-6 pt-1 text-[12px] font-semibold text-ink" aria-hidden>
          <span className="num">{time}</span>
          <span className="h-[18px] w-[72px] rounded-full bg-ink" />
          <span className="flex items-center gap-1"><span className="h-2 w-3.5 rounded-[2px] border border-ink/70" /></span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Section heading: object label (tinted square + name), Newsreader headline, short body. */
export function SectionHead({ icon, tint, label, title, children, className, id, split }: { icon: Icon; tint: string; label: string; title: React.ReactNode; children?: React.ReactNode; className?: string; id?: string; split?: boolean }) {
  return (
    <div className={cn(split ? "grid gap-x-12 lg:grid-cols-12 lg:items-end" : "max-w-[640px]", className)}>
      <div className={split ? "lg:col-span-6" : undefined}>
        <div className="flex items-center gap-2 text-[14px] font-medium text-ink-2">
          <ObjectSquare icon={icon} tint={tint} />{label}
        </div>
        <h2 id={id} className="mt-4 text-balance font-display text-[32px] leading-[1.08] tracking-[-0.02em] text-ink sm:text-[40px] lg:text-[44px]">{title}</h2>
      </div>
      {children && <div className={cn("mt-4 max-w-[56ch] text-pretty text-[16px] leading-relaxed text-ink-2 sm:text-[17px]", split && "lg:col-span-6 lg:mt-0 lg:pb-1.5")}>{children}</div>}
    </div>
  );
}

/** Catalogue photo via next/image (responsive, lazy). */
export function Photo({ src, alt, className, sizes = "120px", priority }: { src: string; alt: string; className?: string; sizes?: string; priority?: boolean }) {
  return (
    <span className={cn("relative block overflow-hidden bg-sunken", className)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </span>
  );
}

/** Small inline street map with a geofence (the field map's look without MapLibre). */
export function FenceMap({ className, agent = { x: 362, y: 128 }, label = "Sharma Jewellers", distance = "38 m", outside, compact, halo, tone = "blue", away }: {
  className?: string; agent?: { x: number; y: number }; label?: string; distance?: string; outside?: { x: number; y: number; text: string }; compact?: boolean;
  /** Accuracy circle radius (map units) drawn around the agent — a weak GPS fix. */ halo?: number;
  /** Agent pin colour: blue (live GPS), grey (refused, outside), info (simulated). */ tone?: "blue" | "grey" | "info";
  /** The agent is outside the fence: the app draws the ring amber and the stop marker ink. */ away?: boolean;
}) {
  const ring = away ? "#a8661a" : "#2c7a54";
  const pin = tone === "grey" ? "#9b9ca0" : tone === "info" ? "#2f5f8f" : "#2f6bf2";
  return (
    <svg viewBox="0 0 560 300" className={cn("block h-auto w-full", className)} role="img" aria-label={`100 metre geofence around ${label}; the agent is ${distance} from the shop`}>
      <rect width="560" height="300" fill="#f4f4f2" />
      {/* blocks */}
      <g fill="#ebebe8">
        <rect x="18" y="98" width="150" height="80" rx="3" /><rect x="268" y="10" width="170" height="64" rx="3" /><rect x="458" y="16" width="96" height="70" rx="3" />
        <rect x="16" y="238" width="190" height="56" rx="3" /><rect x="420" y="214" width="130" height="78" rx="3" /><rect x="22" y="12" width="150" height="50" rx="3" />
      </g>
      <g stroke="#ffffff" strokeWidth="14" fill="none" strokeLinecap="round">
        <path d="M-10 214 C 120 196, 260 232, 570 176" /><path d="M206 -10 L 250 310" /><path d="M-10 84 L 570 98" /><path d="M396 -10 L 410 310" />
      </g>
      {!compact && (
        <g fill="#9b9ca0" fontSize="11" fontFamily="var(--font-ui)">
          <text x="440" y="114">Bank Street</text><text x="40" y="206">Ajmal Khan Road</text><text x="215" y="290" transform="rotate(-80 215 290)">Arya Samaj Rd</text>
        </g>
      )}
      <circle cx="320" cy="150" r="100" fill={away ? "rgb(168 102 26 / .06)" : "rgb(44 122 84 / .07)"} stroke={ring} strokeWidth="1.5" strokeDasharray="5 5" />
      {!compact && <text x="386" y="246" fill={ring} fontSize="11" fontFamily="var(--font-ui)">100 m fence</text>}
      <line x1="320" y1="150" x2={agent.x} y2={agent.y} stroke="#1c1d1f" strokeWidth="1" strokeDasharray="2 3" />
      {/* The app's numbered stop marker: label pill under the GPS dot, numbered circle on top. */}
      {!compact && (
        <g>
          <rect x="337.5" y="139.5" width="120" height="22" rx="8" fill="#fff" stroke="#e3e3e3" />
          <text x="346" y="154.5" fill="#1c1d1f" fontSize="12" fontWeight="600" fontFamily="var(--font-ui)">{label}</text>
        </g>
      )}
      <circle cx="320" cy="150" r="11" fill={away ? "#1c1d1f" : "#2c7a54"} stroke={away ? "#1c1d1f" : "#2c7a54"} strokeWidth="1.5" />
      <text x="320" y="154" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600" fontFamily="var(--font-ui)">1</text>
      {halo ? <circle cx={agent.x} cy={agent.y} r={halo} fill="rgb(168 102 26 / .08)" stroke="#a8661a" strokeWidth="1" strokeDasharray="3 4" /> : null}
      <circle cx={agent.x} cy={agent.y} r="15" fill={tone === "grey" ? "rgb(155 156 160 / .16)" : "rgb(47 107 242 / .14)"} />
      <circle cx={agent.x} cy={agent.y} r="6.5" fill={pin} stroke="#fff" strokeWidth="2.5" />
      {!compact && <text x={agent.x + 14} y={agent.y - 12} fill="#1c1d1f" fontSize="12" fontWeight="600" fontFamily="var(--font-ui)">{distance}</text>}
      {outside && (
        <g>
          <circle cx={outside.x} cy={outside.y} r="6.5" fill="#c4c5c9" stroke="#fff" strokeWidth="2.5" />
          <text x={outside.x + 13} y={outside.y + 4} fill="#6e6f73" fontSize="11" fontFamily="var(--font-ui)">{outside.text}</text>
        </g>
      )}
    </svg>
  );
}
