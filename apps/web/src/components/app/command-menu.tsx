"use client";
/** ⌘K palette: search shops, pieces (tag codes), orders, memos, agents, designs via /admin/search,
 *  plus quick actions. Built on shadcn Command (cmdk). */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BoxesIcon, GemIcon, MapPinnedIcon, PlugIcon, ReceiptTextIcon, ScrollTextIcon, StoreIcon, UsersIcon, CoinsIcon } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { api } from "@/lib/api";
import { qk } from "@/lib/sync";

type R = { id: string; name: string };
type SearchRes = { shops: (R & { area?: string })[]; pieces: (R & { tagCode: string })[]; orders: (R & { number: string })[]; memos: (R & { number: string })[]; agents: R[]; designs: (R & { sku: string })[] };

export function useCommandMenu() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  return { open, setOpen };
}

export function CommandMenu({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  React.useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 150); return () => clearTimeout(t); }, [q]);
  const res = useQuery({
    queryKey: [...qk.search, dq],
    queryFn: () => api<SearchRes>(`/admin/search?q=${encodeURIComponent(dq)}`),
    enabled: open && dq.length >= 2,
    staleTime: 15_000,
  });
  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };
  const d = res.data;
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search JewelRoute" description="Search shops, samples, orders, memos and agents">
      <CommandInput value={q} onValueChange={setQ} placeholder="Search shops, tag codes, orders, memos, agents…" />
      <CommandList>
        <CommandEmpty>{dq.length < 2 ? "Type at least 2 characters." : res.isFetching ? "Searching…" : "No matches."}</CommandEmpty>
        {d && (
          <>
            {d.shops.length > 0 && <CommandGroup heading="Shops">{d.shops.map((s) => <CommandItem key={s.id} value={`shop ${s.name} ${s.area ?? ""}`} onSelect={() => go(`/admin/shops/${s.id}`)}><StoreIcon />{s.name}<span className="ml-auto text-xs text-ink-3">{s.area}</span></CommandItem>)}</CommandGroup>}
            {d.pieces.length > 0 && <CommandGroup heading="Samples">{d.pieces.map((p) => <CommandItem key={p.id} value={`piece ${p.tagCode} ${p.name}`} onSelect={() => go(`/admin/samples/${p.id}`)}><GemIcon /><span className="font-medium">{p.tagCode}</span>{p.name}</CommandItem>)}</CommandGroup>}
            {d.orders.length > 0 && <CommandGroup heading="Orders">{d.orders.map((o) => <CommandItem key={o.id} value={`order ${o.number} ${o.name}`} onSelect={() => go(`/admin/orders/${o.id}`)}><ReceiptTextIcon />{o.number}<span className="ml-auto text-xs text-ink-3">{o.name}</span></CommandItem>)}</CommandGroup>}
            {d.memos.length > 0 && <CommandGroup heading="Memos">{d.memos.map((m) => <CommandItem key={m.id} value={`memo ${m.number} ${m.name}`} onSelect={() => go(`/admin/memos/${m.id}`)}><ScrollTextIcon />{m.number}<span className="ml-auto text-xs text-ink-3">{m.name}</span></CommandItem>)}</CommandGroup>}
            {d.agents.length > 0 && <CommandGroup heading="Agents">{d.agents.map((a) => <CommandItem key={a.id} value={`agent ${a.name}`} onSelect={() => go(`/admin/agents/${a.id}`)}><UsersIcon />{a.name}</CommandItem>)}</CommandGroup>}
            {d.designs.length > 0 && <CommandGroup heading="Designs">{d.designs.map((x) => <CommandItem key={x.id} value={`design ${x.sku} ${x.name}`} onSelect={() => go(`/admin/catalog?design=${x.id}`)}><BoxesIcon />{x.name}<span className="ml-auto text-xs text-ink-3">{x.sku}</span></CommandItem>)}</CommandGroup>}
          </>
        )}
        <CommandGroup heading="Go to">
          <CommandItem value="go visits today" onSelect={() => go("/admin/visits")}><MapPinnedIcon />Today&apos;s visits</CommandItem>
          <CommandItem value="go memos overdue" onSelect={() => go("/admin/memos?view=overdue")}><ScrollTextIcon />Overdue memos</CommandItem>
          <CommandItem value="go samples where every piece" onSelect={() => go("/admin/samples")}><GemIcon />Where every sample is</CommandItem>
          <CommandItem value="set gold rate" onSelect={() => go("/admin/settings?tab=gold-rate")}><CoinsIcon />Set today&apos;s gold rate</CommandItem>
          <CommandItem value="webhooks integrations deliveries" onSelect={() => go("/admin/integrations")}><PlugIcon />Webhook deliveries</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
