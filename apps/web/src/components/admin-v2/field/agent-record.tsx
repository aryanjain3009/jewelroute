"use client";
/** Agent record: today's route on a map, the bag (pieces in custody) with issue/return actions,
 *  memos they own, orders they booked, and their activity. */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ActivityIcon, ArchiveRestoreIcon, ClockIcon, GemIcon, HomeIcon, MailIcon, MapPinnedIcon, PackagePlusIcon, PhoneIcon, ReceiptTextIcon, RouteIcon,
  ScrollTextIcon, StoreIcon, Trash2Icon, TrendingUpIcon,
  CircleDotIcon, UserCheckIcon, UserXIcon,
} from "lucide-react";
import { formatINRCompact, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { api } from "@/lib/api";
import { qk, useSync } from "@/lib/sync";
import { cn } from "@/lib/utils";
import type { Piece, PieceRow } from "@/lib/types";
import { Avatar, Btn, Empty } from "@/components/app/chrome";
import { Highlight, Highlights, ListCard, MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { Timeline } from "@/components/app/timeline";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JrMap } from "@/components/admin/map-lazy";
import type { MapMarker, MapTone } from "@/components/jr/map";
import { useAgentRecord, type AgentRec, type VRow } from "./data";
import { AgentActiveDialog, AssignVisitDialog, errMsg, useUnassign } from "./dialogs";
import { AGENT_STATE, agentState } from "./agents-list";
import { MemoRow, OrderRow } from "./visit-record";
import { PieceLine } from "./shop-record";
import { LinkBtn, PROOF, QueryError, RecordSkeleton, StatusChip, StatusDot, VISIT_STATUS, fmtDist, istTime, mediaUrl, relDay, toTimeline, wallTime } from "./ui";

export function AgentRecord({ id }: { id: string }) {
  const q = useAgentRecord(id);
  const tab = useTab("route");
  const router = useRouter();
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [activeOpen, setActiveOpen] = React.useState(false);
  if (q.isLoading) return <RecordSkeleton />;
  if (q.error || !q.data) return <QueryError error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const a = d.agent;
  const done = d.today.filter((v) => v.status === "COMPLETED").length;
  const open = d.today.find((v) => v.status === "CHECKED_IN" || v.status === "ACTIVE");
  const ordersToday = d.orders.filter((o) => istDate(new Date(o.createdAt)) === istDate() && o.status !== "REJECTED");
  const bagValue = d.bag.reduce((s, p) => s + p.valuePaise, 0);
  const memoValue = d.memos.reduce((s, m) => s + m.outstandingValuePaise, 0);
  const overdue = d.memos.filter((m) => m.displayStatus === "OVERDUE");
  const state = agentState({ active: a.active, currentVisit: open?.shop.name, today: { planned: d.today.length, completed: done } });

  return (
    <RecordLayout
      back={{ href: "/admin/agents", label: "Agents" }}
      panel={<>
        <RecordHeader
          lead={<Avatar name={a.name} size={40} />}
          title={a.name}
          subtitle={<span className="inline-flex items-center gap-2">Field agent{a.homeArea ? ` · ${a.homeArea}` : ""}<StatusChip map={AGENT_STATE} value={state} /></span>}
          primary={<Btn icon={MapPinnedIcon} onClick={() => setAssignOpen(true)} disabled={!a.active}>Assign visit</Btn>}
          actions={<>
            {a.phone && <Tip label={`Call ${a.phone}`}><LinkBtn href={`tel:${a.phone.replace(/\s/g, "")}`} external icon={PhoneIcon} label="Call agent" /></Tip>}
            <Tip label={`Email ${a.email}`}><LinkBtn href={`mailto:${a.email}`} external icon={MailIcon} label="Email agent" /></Tip>
            <Tip label="Issue samples"><Btn icon={PackagePlusIcon} aria-label="Issue samples" onClick={() => setIssueOpen(true)} disabled={!a.active} /></Tip>
            <Tip label={a.active ? "Deactivate agent" : "Reactivate agent"}><Btn icon={a.active ? UserXIcon : UserCheckIcon} aria-label={a.active ? "Deactivate agent" : "Reactivate agent"} onClick={() => setActiveOpen(true)} /></Tip>
          </>}
        />
        <PropertySection title="Agent details">
          <Property icon={MailIcon} label="Email"><a href={`mailto:${a.email}`} className="block min-w-0 truncate hover:underline" title={a.email}>{a.email}</a></Property>
          <Property icon={PhoneIcon} label="Phone">{a.phone && <a href={`tel:${a.phone.replace(/\s/g, "")}`} className="num hover:underline">{a.phone}</a>}</Property>
          <Property icon={HomeIcon} label="Home area">{a.homeArea}</Property>
          <Property icon={CircleDotIcon} label="Account">{a.active ? <span className="text-ink">Active · can sign in</span> : <span className="text-danger">Deactivated</span>}</Property>
          <Property icon={TrendingUpIcon} label="Today">{d.today.length > 0 && <span className="num">{done} of {d.today.length} visits done</span>}</Property>
          <Property icon={StoreIcon} label="Current visit">{open && <Link href={`/admin/visits/${open.id}`} className="hover:underline">{open.shop.name}<span className="text-ink-3"> · since {istTime(open.checkInAt)}</span></Link>}</Property>
          <Property icon={GemIcon} label="Bag">{d.bag.length > 0 && <span className="num text-gold-ink">{d.bag.length} pieces · {formatINRCompact(bagValue)}</span>}</Property>
          <Property icon={ScrollTextIcon} label="Open memos">{d.memos.length > 0 && <span className="num"><span className="text-gold-ink">{d.memos.length} · {formatINRCompact(memoValue)}</span>{overdue.length > 0 && <span className="text-danger"> · {overdue.length} overdue</span>}</span>}</Property>
          <Property icon={ClockIcon} label="Last check-in">{a.lastCheckInAt && <span className="num" title={new Date(a.lastCheckInAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}>{relDay(a.lastCheckInAt)}</span>}</Property>
        </PropertySection>
      </>}
    >
      <RecordTabs param="tab" tabs={[
        { value: "route", label: "Today's route", icon: RouteIcon, count: d.today.length },
        { value: "bag", label: "Bag", icon: GemIcon, count: d.bag.length },
        { value: "memos", label: "Memos", icon: ScrollTextIcon, count: d.memos.length },
        { value: "orders", label: "Orders", icon: ReceiptTextIcon, count: d.orders.length },
        { value: "activity", label: "Activity", icon: ActivityIcon, count: d.activity.length },
      ]} />

      {tab === "route" && (
        <div className="pb-10">
          <MainSection title="Highlights">
            <Highlights>
              <Highlight label="Route progress" icon={TrendingUpIcon} sub={open ? `In visit at ${open.shop.name}` : d.today.length ? `${d.today.length - done} to go` : undefined}>
                {d.today.length ? <span className="num">{done} / {d.today.length}</span> : <span className="text-ink-3">No route today</span>}
              </Highlight>
              <Highlight label="Orders today" icon={ReceiptTextIcon} sub={`${ordersToday.length} order${ordersToday.length === 1 ? "" : "s"} · excl. rejected`}>
                {ordersToday.length ? formatINRCompact(ordersToday.reduce((s, o) => s + o.totalPaise, 0)) : <span className="text-ink-3">None yet</span>}
              </Highlight>
              <Highlight label="In the bag" icon={GemIcon} tone={d.bag.length ? "gold" : undefined} sub={`${d.bag.length} piece${d.bag.length === 1 ? "" : "s"} · at today's rate`}>
                {d.bag.length ? formatINRCompact(bagValue) : <span className="text-ink-3">Empty</span>}
              </Highlight>
            </Highlights>
          </MainSection>
          <MainSection title="Route" action={<Btn size="sm" icon={MapPinnedIcon} onClick={() => setAssignOpen(true)} disabled={!a.active}>Add stop</Btn>}>
            {d.today.length ? <RouteView visits={d.today} /> : <ListCard><Empty icon={RouteIcon} title="No visits today" hint={`Plan a route so ${a.name.split(" ")[0]} knows where to go.`} action={<Btn icon={MapPinnedIcon} onClick={() => setAssignOpen(true)}>Assign visit</Btn>} /></ListCard>}
          </MainSection>
        </div>
      )}
      {tab === "bag" && <BagTab d={d} onIssue={() => setIssueOpen(true)} />}
      {tab === "memos" && (
        <MainSection title="Open memos" count={d.memos.length}>
          {d.memos.length ? <ListCard>{d.memos.map((m) => <MemoRow key={m.id} m={m} showShop />)}</ListCard> : <ListCard><Empty icon={ScrollTextIcon} title="No open memos" hint="Samples this agent leaves with retailers appear here until they come back." /></ListCard>}
        </MainSection>
      )}
      {tab === "orders" && (
        <MainSection title="Orders" count={d.orders.length}>
          {d.orders.length ? <ListCard>{d.orders.map((o) => <OrderRow key={o.id} o={o} showShop />)}</ListCard> : <ListCard><Empty icon={ReceiptTextIcon} title="No orders yet" hint="Orders this agent books during visits appear here." /></ListCard>}
        </MainSection>
      )}
      {tab === "activity" && (
        <div className="px-6 py-5">
          <h2 className="mb-4 text-[15px] font-medium text-ink">Activity</h2>
          <Timeline items={toTimeline(d.activity, (h) => router.push(h), { proofs: true })} empty={<Empty icon={ActivityIcon} title="No activity yet" hint="Check-ins, proofs, orders and memos by this agent appear here." />} />
        </div>
      )}
      <AssignVisitDialog open={assignOpen} onOpenChange={setAssignOpen} agentId={a.id} />
      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} agent={a} />
      <AgentActiveDialog open={activeOpen} onOpenChange={setActiveOpen} agent={a} />
    </RecordLayout>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

/* ---------------- route: map + ordered stops ---------------- */
const TONE: Partial<Record<string, MapTone>> = { COMPLETED: "done", CHECKED_IN: "active", ACTIVE: "active", PLANNED: "planned", MISSED: "alert", CANCELLED: "muted" };
function RouteView({ visits }: { visits: VRow[] }) {
  const router = useRouter();
  const unassign = useUnassign();
  const sorted = [...visits].sort((a, b) => a.sequence - b.sequence);
  const nextId = sorted.find((v) => v.status === "PLANNED")?.id;
  const markers: MapMarker[] = sorted.map((v) => ({
    id: v.id, lat: v.shop.lat, lng: v.shop.lng, badge: v.sequence, label: v.shop.name, tone: v.id === nextId ? "next" : TONE[v.status] ?? "planned",
    onClick: () => router.push(`/admin/visits/${v.id}`),
  }));
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <div className="h-[280px] border-b border-line"><JrMap markers={markers} route={sorted.map((v) => v.id)} initialZoom={12} /></div>
      <ol className="divide-y divide-line">
        {sorted.map((v) => (
          <li key={v.id} className="group flex min-h-11 items-center gap-3 px-3.5 py-1.5 hover:bg-hover">
            <span className={cn("num grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold", v.id === nextId ? "bg-ink text-white" : v.status === "COMPLETED" ? "bg-verified-soft text-verified" : "border border-line-strong text-ink-2")}>{v.sequence}</span>
            <Link href={`/admin/visits/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{v.shop.name}</span>
                <span className="block truncate text-[12.5px] text-ink-3">{v.shop.area}{v.plannedTime ? ` · planned ${wallTime(v.plannedTime)}` : ""}{v.checkInAt ? ` · in ${istTime(v.checkInAt)}` : ""}{v.completedAt ? ` · out ${istTime(v.completedAt)}` : ""}</span>
              </span>
              <span className="hidden w-[130px] shrink-0 md:block">{v.proofState !== "NOT_STARTED" ? <StatusDot map={PROOF} value={v.proofState} className="text-[13px]" /> : null}</span>
              <span className="num hidden w-12 shrink-0 text-right text-[13px] text-ink-2 sm:block">{fmtDist(v.checkInDistanceM) ?? ""}</span>
              <span className="w-[100px] shrink-0"><StatusDot map={VISIT_STATUS} value={v.status} className="text-[13px]" /></span>
            </Link>
            <span className="w-8 shrink-0">
              {v.status === "PLANNED" && (
                <Btn size="sm" variant="ghost" icon={Trash2Icon} aria-label={`Remove ${v.shop.name} from route`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" disabled={unassign.isPending}
                  onClick={() => { if (confirm(`Remove ${v.shop.name} from today's route?`)) unassign.mutate(v.id); }} />
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- bag: pieces in custody, return to vault ---------------- */
function BagTab({ d, onIssue }: { d: AgentRec; onIssue: () => void }) {
  const sync = useSync();
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setSel((s) => new Set([...s].filter((id) => d.bag.some((p) => p.id === id)))), [d.bag]);
  const ret = useMutation({
    mutationFn: (pieceIds: string[]) => api("/admin/pieces/return-to-vault", { body: { pieceIds } }),
    onSuccess: (_, ids) => { toast.success(`${ids.length} piece${ids.length > 1 ? "s" : ""} returned to the vault`); setSel(new Set()); },
    onError: (e) => toast.error(errMsg(e)),
    onSettled: () => sync("piece.moved"),
  });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <MainSection
      title="In the bag"
      count={d.bag.length}
      action={<div className="flex gap-1.5">
        {sel.size > 0 && <Btn size="sm" icon={ArchiveRestoreIcon} disabled={ret.isPending} onClick={() => ret.mutate([...sel])}>{ret.isPending ? "Returning…" : `Return ${sel.size} to vault`}</Btn>}
        <Btn size="sm" icon={PackagePlusIcon} onClick={onIssue}>Issue samples</Btn>
      </div>}
    >
      {d.bag.length ? (
        <ListCard>
          {d.bag.map((p) => (
            <div key={p.id} className={cn("flex items-center", sel.has(p.id) && "bg-selected")}>
              <input type="checkbox" aria-label={`Select ${p.tagCode}`} checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="ml-3.5 size-4 shrink-0 cursor-pointer accent-[#2f6bf2]" />
              <div className="min-w-0 flex-1"><PieceLine p={p} /></div>
            </div>
          ))}
          <div className="flex h-9 items-center justify-between px-3.5 text-[13px] text-ink-2"><span><span className="num font-medium text-ink">{d.bag.length}</span> pieces</span><span className="num">Value at today&apos;s rate <span className="font-medium text-gold-ink">{formatINRCompact(d.bag.reduce((s, p) => s + p.valuePaise, 0))}</span></span></div>
        </ListCard>
      ) : <ListCard><Empty icon={GemIcon} title="The bag is empty" hint="Issue samples from the vault before the agent heads out." action={<Btn icon={PackagePlusIcon} onClick={onIssue}>Issue samples</Btn>} /></ListCard>}
    </MainSection>
  );
}

/** Issue vault pieces to this agent (VAULT → AGENT through the custody ledger on the server). */
function IssueDialog({ open, onOpenChange, agent }: { open: boolean; onOpenChange: (o: boolean) => void; agent: { id: string; name: string } }) {
  const sync = useSync();
  const vault = useQuery({ queryKey: [...qk.pieces, "vault"], queryFn: () => api<(Piece | PieceRow)[]>("/admin/pieces?custodianType=VAULT"), enabled: open });
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  React.useEffect(() => { if (open) { setSel(new Set()); setQ(""); } }, [open]);
  const rows = (vault.data ?? []).filter((p) => !q || `${p.tagCode} ${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase()));
  const value = (vault.data ?? []).filter((p) => sel.has(p.id)).reduce((s, p) => s + p.valuePaise, 0);
  const m = useMutation({
    mutationFn: () => api("/admin/pieces/issue", { body: { pieceIds: [...sel], agentId: agent.id } }),
    onSuccess: () => { toast.success(`${sel.size} piece${sel.size > 1 ? "s" : ""} issued to ${agent.name}`); onOpenChange(false); },
    onError: (e) => toast.error(errMsg(e)),
    onSettled: () => sync("piece.moved"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-xl p-0 sm:max-w-[560px]">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="text-[15px] font-semibold">Issue samples to {agent.name}</DialogTitle>
          <DialogDescription className="text-[13px]">Pieces move from the vault into the agent&apos;s bag. Each move is written to the custody ledger.</DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tag code or design" className="h-8 w-full rounded-lg border border-line-strong px-2.5 text-[14px] outline-none placeholder:text-ink-3 focus:border-blue focus:ring-2 focus:ring-blue/15" />
        </div>
        <div className="max-h-[360px] overflow-y-auto border-y border-line">
          {vault.isLoading && <p className="px-5 py-6 text-[13px] text-ink-3">Loading vault…</p>}
          {vault.error && <p className="px-5 py-6 text-[13px] text-danger">{errMsg(vault.error)}</p>}
          {vault.data && !rows.length && <p className="px-5 py-6 text-[13px] text-ink-3">{vault.data.length ? "No pieces match." : "The vault is empty. Take pieces into stock from the catalog first."}</p>}
          {rows.map((p) => (
            <label key={p.id} className={cn("flex h-11 cursor-pointer items-center gap-3 border-b border-line px-5 last:border-b-0 hover:bg-hover", sel.has(p.id) && "bg-selected")}>
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className="size-4 accent-[#2f6bf2]" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.imageUrl ? <img src={mediaUrl(p.imageUrl)} alt="" className="size-7 rounded-md border border-line object-cover" /> : <span className="size-7 rounded-md bg-hover" />}
              <span className="num w-[96px] shrink-0 text-[13px] font-medium text-ink">{p.tagCode}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{p.name} <span className="font-semibold text-gold-ink">{PURITY_LABEL[p.purity]}</span></span>
              <span className="num text-[13px] font-medium text-gold-ink">{formatINRCompact(p.valuePaise)}</span>
            </label>
          ))}
        </div>
        <DialogFooter className="mx-0 mb-0 items-center border-t-0 bg-white px-5 py-3 sm:justify-between">
          <span className="text-[13px] text-ink-2">{sel.size ? <><span className="num font-medium text-ink">{sel.size}</span> selected · <span className="num font-medium text-gold-ink">{formatINRCompact(value)}</span></> : "Select pieces to issue"}</span>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
            <Btn variant="primary" icon={PackagePlusIcon} disabled={!sel.size || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Issuing…" : "Issue samples"}</Btn>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
