"use client";
/** ⌘K palette (Attio "quick actions and records"): search shops, pieces (tag codes), orders, memos,
 *  agents and designs via /admin/search, plus quick actions. cmdk inside a Radix dialog. It opens and
 *  closes with no animation — a palette toggled a hundred times a day must feel instant. */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Command as Cmdk } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  ArrowDownIcon, ArrowUpIcon, BoxesIcon, CoinsIcon, CornerDownLeftIcon, GemIcon, HomeIcon, MapPinnedIcon, PlugIcon, ReceiptTextIcon, ScrollTextIcon,
  SearchIcon, ShieldCheckIcon, StoreIcon, UsersIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { qk } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Avatar } from "./chrome";
import type { PieceRow } from "@/lib/types";
import { holderLabel } from "@/components/admin-v2/sales/ui";

type R = { id: string; name: string };
type SearchRes = { shops: (R & { area?: string })[]; pieces: (R & { tagCode: string })[]; orders: (R & { number: string })[]; memos: (R & { number: string })[]; agents: R[]; designs: (R & { sku: string })[] };
type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

export function useCommandMenu() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  return { open, setOpen };
}

const Group = ({ heading, children }: { heading: string; children: React.ReactNode }) => (
  <Cmdk.Group heading={heading} className="px-1.5 pb-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3">
    {children}
  </Cmdk.Group>
);

function Item({ value, onSelect, icon: I, lead, children, meta }: { value: string; onSelect: () => void; icon?: Icon; lead?: React.ReactNode; children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <Cmdk.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-ink outline-none data-[selected=true]:bg-[#f3f3f4]"
    >
      {lead ?? (I && <span className="grid size-6 shrink-0 place-items-center rounded-[6px] border border-line-strong bg-white text-ink-2"><I className="size-3.5" strokeWidth={1.75} /></span>)}
      <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate">{children}</span>
      {meta && <span className="shrink-0 truncate text-[13px] text-ink-3">{meta}</span>}
    </Cmdk.Item>
  );
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-[5px] border border-line-strong bg-white px-1 font-sans text-[11px] text-ink-2">{children}</kbd>
);

export function CommandMenu({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  React.useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 150); return () => clearTimeout(t); }, [q]);
  React.useEffect(() => { if (!open) setQ(""); }, [open]);
  const res = useQuery({
    queryKey: [...qk.search, dq],
    queryFn: () => api<SearchRes>(`/admin/search?q=${encodeURIComponent(dq)}`),
    enabled: open && dq.length >= 2,
    staleTime: 15_000,
  });
  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };
  // Where each piece is right now, from the samples list the app already keeps (shared qk.pieces key).
  const pieces = useQuery({ queryKey: [...qk.pieces, "rows"], queryFn: () => api<PieceRow[]>("/admin/pieces"), enabled: open && dq.length >= 2, staleTime: 20_000 });
  const pieceById = React.useMemo(() => new Map((pieces.data ?? []).map((p) => [p.id, p])), [pieces.data]);
  const more = (n: number, href: string, label: string) => n >= 5 ? <Item value={`all ${label} ${dq}`} onSelect={() => go(`${href}${encodeURIComponent(dq)}`)} icon={SearchIcon}><span className="text-ink-2">Show all {label} matching “{dq}”</span></Item> : null;
  const d = dq.length >= 2 ? res.data : undefined;
  const hits = d ? d.shops.length + d.pieces.length + d.orders.length + d.memos.length + d.agents.length + d.designs.length : 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/15" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[14vh] z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[14px] border border-line-strong bg-white shadow-[0_24px_60px_-12px_rgb(0_0_0/0.28),0_2px_6px_rgb(0_0_0/0.06)] outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Search JewelRoute</DialogPrimitive.Title>
          <Cmdk label="Search JewelRoute" shouldFilter loop className="flex max-h-[min(560px,70vh)] flex-col">
            <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line px-4">
              <SearchIcon className="size-[18px] shrink-0 text-ink-3" strokeWidth={1.75} />
              <Cmdk.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search shops, tag codes, orders, memos, agents…"
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
              />
              {res.isFetching && dq.length >= 2 && <span className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-line-strong border-t-ink-2 motion-reduce:animate-none" aria-label="Searching" />}
              <Key>esc</Key>
            </div>
            <Cmdk.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5">
              <Cmdk.Empty className="px-4 py-8 text-center text-[13px] text-ink-2">
                {dq.length < 2 ? "Type at least 2 characters to search records." : res.isFetching ? "Searching…" : <>No records match <span className="font-medium text-ink">“{dq}”</span>.</>}
              </Cmdk.Empty>
              {d && hits > 0 && (
                <>
                  {d.shops.length > 0 && <Group heading="Shops">{d.shops.map((s) => <Item key={s.id} value={`shop ${s.name} ${s.area ?? ""} ${s.id}`} onSelect={() => go(`/admin/shops/${s.id}`)} lead={<Avatar name={s.name} size={24} square className="rounded-[6px]" />} meta={s.area}><span className="truncate">{s.name}</span></Item>)}{more(d.shops.length, "/admin/shops?q=", "shops")}</Group>}
                  {d.pieces.length > 0 && <Group heading="Samples">{d.pieces.map((p) => { const row = pieceById.get(p.id); return <Item key={p.id} value={`piece ${p.tagCode} ${p.name} ${p.id}`} onSelect={() => go(`/admin/samples/${p.id}`)} icon={GemIcon} meta={row ? `${row.custodianType === "SHOP" ? "at " : row.custodianType === "AGENT" ? "with " : ""}${holderLabel(row)}${row.status === "OVERDUE" ? " · overdue" : ""}` : p.name}><span className="num font-medium">{p.tagCode}</span><span className="truncate text-[13px] text-ink-3">{p.name}</span></Item>; })}{more(d.pieces.length, "/admin/samples?q=", "samples")}</Group>}
                  {d.orders.length > 0 && <Group heading="Orders">{d.orders.map((o) => <Item key={o.id} value={`order ${o.number} ${o.name} ${o.id}`} onSelect={() => go(`/admin/orders/${o.id}`)} icon={ReceiptTextIcon} meta={o.name.replace(`${o.number} · `, "")}><span className="num">{o.number}</span></Item>)}{more(d.orders.length, "/admin/orders?q=", "orders")}</Group>}
                  {d.memos.length > 0 && <Group heading="Memos">{d.memos.map((m) => <Item key={m.id} value={`memo ${m.number} ${m.name} ${m.id}`} onSelect={() => go(`/admin/memos/${m.id}`)} icon={ScrollTextIcon} meta={m.name.replace(`${m.number} · `, "")}><span className="num">{m.number}</span></Item>)}{more(d.memos.length, "/admin/memos?q=", "memos")}</Group>}
                  {d.agents.length > 0 && <Group heading="Agents">{d.agents.map((a) => <Item key={a.id} value={`agent ${a.name} ${a.id}`} onSelect={() => go(`/admin/agents/${a.id}`)} lead={<Avatar name={a.name} size={24} />}><span className="truncate">{a.name}</span></Item>)}</Group>}
                  {d.designs.length > 0 && <Group heading="Designs">{d.designs.map((x) => <Item key={x.id} value={`design ${x.sku} ${x.name} ${x.id}`} onSelect={() => go(`/admin/catalog?design=${x.id}`)} icon={BoxesIcon} meta={x.sku}><span className="truncate">{x.name}</span></Item>)}</Group>}
                </>
              )}
              <Group heading="Quick actions">
                <Item value="assign visit route plan" onSelect={() => go("/admin/visits?assign=1")} icon={MapPinnedIcon}>Assign visit</Item>
                <Item value="new shop retailer add create" onSelect={() => go("/admin/shops?new=1")} icon={StoreIcon}>New shop</Item>
                <Item value="approve pending orders approvals" onSelect={() => go("/admin/orders?view=pending")} icon={ShieldCheckIcon}>Review pending approvals</Item>
                <Item value="set gold rate today" onSelect={() => go("/admin/settings?tab=gold-rate")} icon={CoinsIcon}>Set today&apos;s gold rate</Item>
                <Item value="memos overdue" onSelect={() => go("/admin/memos?view=overdue")} icon={ScrollTextIcon}>Overdue memos</Item>
                <Item value="samples where every piece custody" onSelect={() => go("/admin/samples")} icon={GemIcon}>Where every sample is</Item>
              </Group>
              <Group heading="Go to">
                <Item value="go home" onSelect={() => go("/admin")} icon={HomeIcon}>Home</Item>
                <Item value="go visits today" onSelect={() => go("/admin/visits")} icon={MapPinnedIcon}>Today&apos;s visits</Item>
                <Item value="go shops retailers" onSelect={() => go("/admin/shops")} icon={StoreIcon}>Shops</Item>
                <Item value="go agents team" onSelect={() => go("/admin/agents")} icon={UsersIcon}>Agents</Item>
                <Item value="webhooks integrations deliveries" onSelect={() => go("/admin/integrations")} icon={PlugIcon}>Webhook deliveries</Item>
              </Group>
            </Cmdk.List>
            <div className={cn("flex h-10 shrink-0 items-center gap-3 border-t border-line bg-[#fafafa] px-4 text-[12.5px] text-ink-3")}>
              <span className="inline-flex items-center gap-1"><Key><ArrowUpIcon className="size-3" /></Key><Key><ArrowDownIcon className="size-3" /></Key><span className="ml-1">Navigate</span></span>
              <span className="inline-flex items-center gap-1"><Key><CornerDownLeftIcon className="size-3" /></Key><span className="ml-1">Open</span></span>
              <span className="ml-auto">Search covers shops, tags, orders, memos, agents and designs</span>
            </div>
          </Cmdk>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
