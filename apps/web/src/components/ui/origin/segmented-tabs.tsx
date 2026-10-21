"use client";
/**
 * Origin UI segmented tabs (coss.com/origin, comp-427: Radix Tabs list with a filled active segment),
 * adapted with the clip-path tab technique from emil-design-eng: the list is drawn twice — quiet
 * labels underneath, an ink copy on top clipped to the active segment — so the colour change and the
 * moving pill are one motion (220 ms, strong ease-out) with no text-colour cross-timing.
 * Segments are equal width, so the clip is pure percentages (no measuring, no layout reads).
 *
 * Optional `progress`: a thin bar in the active segment that fills linearly over `duration` (Web
 * Animations API, compositor-only `transform`), pausable, calling `onDone` when it completes — used by
 * the hero's auto-advance. Keyboard: Radix arrow-key roving focus; no animation is added to keys.
 */
import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;
export interface SegmentedItem { value: string; label: string; short?: string; icon?: Icon }

export function SegmentedTabsList({
  items, value, className, progress, onTriggerPointerDown, triggerProps,
}: {
  items: SegmentedItem[];
  value: string;
  className?: string;
  progress?: { id: string; duration: number; paused: boolean; onDone: () => void } | null;
  onTriggerPointerDown?: () => void;
  triggerProps?: (item: SegmentedItem) => Record<string, string>;
}) {
  const n = items.length;
  const i = Math.max(0, items.findIndex((it) => it.value === value));
  const clip = `inset(0 ${((n - i - 1) * 100) / n}% 0 ${(i * 100) / n}% round 8px)`;
  const bar = React.useRef<HTMLSpanElement>(null);
  const anim = React.useRef<Animation | null>(null);

  // (Re)start the fill whenever the progress id changes; pause/resume without restarting.
  const onDone = progress?.onDone;
  const doneRef = React.useRef(onDone);
  React.useEffect(() => { doneRef.current = onDone; }, [onDone]);
  const pid = progress?.id;
  const duration = progress?.duration ?? 0;
  React.useEffect(() => {
    const el = bar.current;
    anim.current?.cancel();
    anim.current = null;
    if (!el || !pid || typeof el.animate !== "function") return;
    const a = el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration, easing: "linear", fill: "forwards" });
    a.onfinish = () => doneRef.current?.();
    anim.current = a;
    return () => { a.onfinish = null; a.cancel(); };
  }, [pid, duration]);
  const paused = !!progress?.paused;
  React.useEffect(() => {
    const a = anim.current;
    if (!a) return;
    if (paused) a.pause(); else if (a.playState === "paused") a.play();
  }, [paused, pid]);

  // Radix moves focus in a way Chrome reports as :focus-visible even for a mouse click, so the ring
  // follows the input that was actually used (keyboard → ring, pointer → none).
  const [kbd, setKbd] = React.useState(false);
  const lastPointer = React.useRef(0);
  const seg = "flex h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap px-2 text-[13.5px] font-medium sm:h-8 sm:px-4 sm:text-[14px]";
  return (
    <TabsPrimitive.List
      onKeyDown={() => setKbd(true)}
      onPointerDown={() => { lastPointer.current = Date.now(); setKbd(false); }}
      onFocusCapture={() => { if (Date.now() - lastPointer.current > 400) setKbd(true); }}
      data-kbd={kbd || undefined}
      className={cn("group/seg relative grid grid-flow-col auto-cols-fr rounded-[11px] border border-line-strong bg-white p-[3px] shadow-[0_1px_2px_rgb(0_0_0/0.04)]", className)}
    >
      {items.map((it) => {
        const I = it.icon;
        return (
          <TabsPrimitive.Trigger
            key={it.value}
            value={it.value}
            onPointerDown={onTriggerPointerDown}
            {...triggerProps?.(it)}
            className={cn(
              seg,
              "relative rounded-[8px] text-ink-2 outline-none transition-[color,background-color] duration-150 ease-out",
              "group-data-[kbd]/seg:focus-visible:z-20 group-data-[kbd]/seg:focus-visible:ring-[3px] group-data-[kbd]/seg:focus-visible:ring-blue/35 data-[state=active]:text-white",
              "[@media(hover:hover)_and_(pointer:fine)]:data-[state=inactive]:hover:bg-hover [@media(hover:hover)_and_(pointer:fine)]:data-[state=inactive]:hover:text-ink",
            )}
          >
            {I && <I className="size-4 shrink-0 max-sm:hidden" strokeWidth={1.75} />}
            {it.short ? <><span className="sm:hidden">{it.short}</span><span className="max-sm:hidden">{it.label}</span></> : it.label}
          </TabsPrimitive.Trigger>
        );
      })}
      {/* Active layer: the same segments in ink, clipped to the active one. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[3px] z-10 grid grid-flow-col auto-cols-fr rounded-[8px] bg-ink text-white transition-[clip-path] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ clipPath: clip }}
      >
        {items.map((it, k) => {
          const I = it.icon;
          return (
            <span key={it.value} className={cn(seg, "relative")}>
              {I && <I className="size-4 shrink-0 max-sm:hidden" strokeWidth={1.75} />}
              {it.short ? <><span className="sm:hidden">{it.short}</span><span className="max-sm:hidden">{it.label}</span></> : it.label}
              {k === i && progress && (
                <span className="absolute inset-x-3 bottom-[3px] h-[2px] overflow-hidden rounded-full bg-white/15">
                  <span ref={bar} className="block h-full w-full origin-left scale-x-0 rounded-full bg-white/70" />
                </span>
              )}
            </span>
          );
        })}
      </div>
    </TabsPrimitive.List>
  );
}

export const SegmentedTabs = TabsPrimitive.Root;
export const SegmentedTabsContent = TabsPrimitive.Content;
