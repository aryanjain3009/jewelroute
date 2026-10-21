"use client";
/** Code panel for /developers (reference: Stripe's API reference code column): a dark panel with a
 *  quiet title row, optional language tabs (Radix Tabs), a copy button and a line-number gutter.
 *  Copy feedback: the icon cross-fades copy → check with a 2 px blur bridge (150 ms, emil-design-eng),
 *  the button presses at scale .97, and a polite live region says "Copied". Tabs switch instantly
 *  (people flip between languages repeatedly; no animation on a frequent action). */
import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { highlight, type Lang } from "./highlight";

export interface Snippet { label: string; lang: Lang; code: string }

import { MONO } from "./prose";

function CopyButton({ text, className, tone = "dark", label = "Copy code" }: { text: string; className?: string; tone?: "dark" | "light"; label?: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  React.useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(t);
  }, [state]);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState("copied"); } catch { setState("failed"); }
  }
  const on = state === "copied";
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={on ? "Copied" : label}
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-[8px] outline-none before:absolute before:-inset-1 before:content-[''] sm:size-7 sm:before:hidden transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.97]",
        tone === "dark"
          ? "text-[#a1a1aa] focus-visible:ring-2 focus-visible:ring-[#8ec5ff]/60 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-white/10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-white"
          : "text-ink-3 focus-visible:ring-[3px] focus-visible:ring-blue/30 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-hover [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink",
        className,
      )}
    >
      <CopyIcon className={cn("col-start-1 row-start-1 size-3.5 transition-[opacity,filter,scale] duration-150 ease-out", on ? "scale-90 opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-[0px]")} />
      <CheckIcon className={cn("col-start-1 row-start-1 size-3.5 transition-[opacity,filter,scale] duration-150 ease-out", on ? "scale-100 opacity-100 blur-[0px]" : "scale-90 opacity-0 blur-[2px]", tone === "dark" ? "text-[#b9dba5]" : "text-verified")} />
      <span className="sr-only" aria-live="polite">{on ? "Copied" : state === "failed" ? "Copy failed" : ""}</span>
    </button>
  );
}

function Body({ snippet, numbers, wrap }: { snippet: Snippet; numbers: boolean; wrap?: boolean }) {
  const lines = snippet.code.split("\n").length;
  return (
    <div className="flex overflow-x-auto py-3.5 text-[12.5px] leading-[1.7]">
      {numbers && lines > 1 && (
        <div aria-hidden className={cn("sticky left-0 shrink-0 select-none bg-[#1c1d1f] pr-3 pl-4 text-right text-[#5c5e66]", MONO)}>
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
      )}
      <pre className={cn("min-w-0 flex-1 pr-5 text-[#e6e6e9]", numbers && lines > 1 ? "pl-1" : "pl-4", wrap && "break-all whitespace-pre-wrap", MONO)}><code className={MONO}>{highlight(snippet.code, snippet.lang)}</code></pre>
    </div>
  );
}

/** One snippet, or several behind language tabs. `title` names what the code is (e.g. "Verify a delivery"). */
export function CodePanel({ title, snippets, numbers = true, wrap, className }: { title?: React.ReactNode; snippets: Snippet[]; numbers?: boolean; wrap?: boolean; className?: string }) {
  const [tab, setTab] = React.useState(snippets[0]?.label ?? "");
  const current = snippets.find((s) => s.label === tab) ?? snippets[0];
  const many = snippets.length > 1;
  return (
    <figure className={cn("overflow-hidden rounded-[12px] border border-[#2c2d31] bg-[#1c1d1f] shadow-[0_1px_2px_rgb(0_0_0/0.06)]", className)}>
      <TabsPrimitive.Root value={tab} onValueChange={setTab}>
        <div className="flex h-12 items-center gap-2 border-b border-[#2c2d31] bg-[#222326] pr-1.5 pl-4 sm:h-10">
          {title && <figcaption className="truncate text-[12.5px] font-medium text-[#d4d4d8]">{title}</figcaption>}
          {many && (
            <TabsPrimitive.List aria-label="Language" className={cn("flex items-center gap-0.5", title ? "ml-auto" : "-ml-2")}>
              {snippets.map((s) => (
                <TabsPrimitive.Trigger
                  key={s.label}
                  value={s.label}
                  className="h-9 rounded-[6px] px-2.5 text-[12.5px] font-medium sm:h-7 sm:px-2 sm:text-[12px] text-[#a1a1aa] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8ec5ff]/60 data-[state=active]:bg-white/10 data-[state=active]:text-white [@media(hover:hover)_and_(pointer:fine)]:hover:text-white"
                >
                  {s.label}
                </TabsPrimitive.Trigger>
              ))}
            </TabsPrimitive.List>
          )}
          <CopyButton text={current?.code ?? ""} className={cn(!many && "ml-auto")} />
        </div>
        {snippets.map((s) => (
          <TabsPrimitive.Content key={s.label} value={s.label} className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8ec5ff]/40">
            <Body snippet={s} numbers={numbers} wrap={wrap} />
          </TabsPrimitive.Content>
        ))}
      </TabsPrimitive.Root>
    </figure>
  );
}

export { CopyButton };
