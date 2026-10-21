"use client";
/** Integrations (webhooks) in Attio chrome with Stripe-developer density: endpoint header + properties,
 *  then Deliveries / Test receiver / Verify signatures. Ported from components/admin/settings/integrations.tsx
 *  with every capability kept: add, edit URL, enable/disable, events, masked secret reveal + rotate, send test,
 *  delivery log, delivery detail (payload, exact signed headers, attempt log, retry), built-in receiver. */
import * as React from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, InboxIcon, KeyRoundIcon, ListChecksIcon, PencilIcon, PlugIcon, PlusIcon, RadioTowerIcon, RefreshCwIcon,
  RotateCcwIcon, SendIcon, ShieldCheckIcon, ShieldXIcon, Trash2Icon, ActivityIcon, CalendarIcon, CodeXmlIcon, GlobeIcon, HashIcon, TimerIcon, CircleDotIcon,
} from "lucide-react";
import { EVENT_DESCRIPTIONS, WEBHOOK_EVENT_TYPES } from "@jewelroute/shared";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { qk } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Btn, Chip, Dot, Empty, RowsSkeleton, TitleBar, ViewBar, ViewTabs, type Tone } from "@/components/app/chrome";
import { DataTable, Muted, type Col } from "@/components/app/data-table";
import { Property, RecordTabs, useTab } from "@/components/app/record";
import { OBJECT_TINT } from "@/components/app/shell";
import { relTime } from "@/components/app/timeline";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Delivery, DeliveryAttempt, DeliveryDetail, EventType, ReceivedWebhook, WebhookEndpoint } from "@/components/admin/types";
import { errMessage, useWrite } from "./data";
import { ErrorState, fmtDayTime, fmtTime, Modal, useHydrated } from "./ui";

const mono = "font-[ui-monospace,SFMono-Regular,Menlo,monospace]";
type Row = Delivery & { endpointUrl?: string };
const host = (u?: string) => (u ?? "").replace(/^https?:\/\//, "");

/* ---------------- queries (keys from lib/sync) ---------------- */
const PAGE = 50;
type DeliveryPage = { items: Row[]; nextCursor?: string };
const useWebhooks = () => useQuery({ queryKey: qk.webhooks, queryFn: () => api<WebhookEndpoint[]>("/admin/webhooks"), refetchInterval: 15_000 });
const useEventTypes = () => useQuery({ queryKey: qk.eventTypes, queryFn: () => api<EventType[]>("/admin/webhooks/event-types"), staleTime: Infinity });
/** Cursor-paged delivery log (newest first). `endpointId` undefined = every endpoint. Polling refetches the loaded pages. */
const useDeliveries = (endpointId?: string) =>
  useInfiniteQuery({
    queryKey: [...qk.deliveries, "pages", endpointId ?? "all"],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: String(PAGE) });
      if (endpointId) p.set("endpointId", endpointId);
      if (pageParam) p.set("cursor", pageParam);
      return api<DeliveryPage>(`/admin/webhooks/deliveries?${p}`);
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 5_000,
  });
const useDelivery = (id?: string | null) => useQuery({ queryKey: qk.delivery(id), queryFn: () => api<DeliveryDetail>(`/admin/webhooks/deliveries/${id}`), enabled: !!id, refetchInterval: 5_000 });
/** What the built-in receiver accepted. With an endpoint id, only that endpoint's rows (the Test receiver tab). */
const useReceived = (endpointId?: string) => useQuery({
  queryKey: [...qk.received, endpointId ?? "all"],
  queryFn: () => api<ReceivedWebhook[]>(`/admin/webhooks/received${endpointId ? `?endpointId=${encodeURIComponent(endpointId)}` : ""}`),
  refetchInterval: 5_000,
});

function useEventList() {
  const q = useEventTypes();
  return React.useMemo(() => {
    const fromApi = (q.data ?? []).filter((e) => e.type !== "ping" && e.type !== "*");
    return fromApi.length ? fromApi : WEBHOOK_EVENT_TYPES.map((t) => ({ type: t, description: EVENT_DESCRIPTIONS[t] }));
  }, [q.data]);
}

const STATUS: Record<Delivery["status"], [Tone, string]> = { SUCCEEDED: ["green", "Delivered"], PENDING: ["grey", "Queued"], FAILED: ["amber", "Retrying"], DEAD: ["red", "Dead letter"] };
function statusDetail(d: Delivery) {
  if (d.status === "FAILED") return d.nextAttemptAt ? `next ${relTime(d.nextAttemptAt)}` : "";
  if (d.status === "DEAD") return d.lastError === "Endpoint is disabled" ? "endpoint disabled" : `after ${d.attempts}`;
  if (d.status === "PENDING") return d.nextAttemptAt ? relTime(d.nextAttemptAt) : "";
  return "";
}

/* ---------------- small pieces ---------------- */
function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return <Btn size="sm" icon={done ? CheckIcon : CopyIcon} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* blocked */ } }}>{done ? "Copied" : label}</Btn>;
}
function Code({ children, className }: { children: string; className?: string }) {
  return <pre className={cn("overflow-x-auto rounded-[10px] border border-line bg-[#fafafa] p-3.5 text-[12.5px] leading-[1.6] text-ink", mono, className)}><code className={mono}>{children}</code></pre>;
}

function EventChecklist({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const events = useEventList();
  const all = events.every((e) => value.includes(e.type));
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <label className="flex h-9 cursor-pointer items-center gap-2.5 border-b border-line bg-sunken px-3 text-[13px] text-ink-2">
        <input type="checkbox" className="size-4 accent-[#2f6bf2]" checked={all} onChange={(e) => onChange(e.target.checked ? events.map((x) => x.type) : [])} />
        All {events.length} events
      </label>
      <div className="max-h-72 divide-y divide-line overflow-y-auto">
        {events.map((e) => (
          <label key={e.type} className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-hover">
            <input type="checkbox" className="mt-0.5 size-4 accent-[#2f6bf2]" checked={value.includes(e.type)} onChange={(x) => onChange(x.target.checked ? [...value, e.type] : value.filter((t) => t !== e.type))} />
            <span className="min-w-0"><span className={cn("block text-[12.5px] text-ink", mono)}>{e.type}</span><span className="block text-[12.5px] text-ink-3">{e.description}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SecretOnce({ secret, title, onClose }: { secret: string; title: string; onClose: () => void }) {
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={title} width={520}
      description="Copy the signing secret now. It won't be shown in full again unless you reveal it, which is written to the audit log."
      footer={<Btn variant="primary" onClick={onClose}>I&apos;ve saved it</Btn>}>
      <div className="flex items-center gap-2 rounded-[10px] border border-line bg-sunken p-2.5"><code className={cn("min-w-0 flex-1 break-all text-[13px] text-ink", mono)}>{secret}</code><CopyBtn text={secret} /></div>
    </Modal>
  );
}

function AddEndpoint({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string, secret: string) => void }) {
  const events = useEventList();
  const [url, setUrl] = React.useState(""); const [description, setDescription] = React.useState(""); const [sel, setSel] = React.useState<string[]>([]);
  React.useEffect(() => { if (open) { setUrl(""); setDescription(""); setSel(events.map((e) => e.type)); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = /^https?:\/\/.+/.test(url.trim()) && sel.length > 0;
  const create = useWrite(() => api<{ endpoint: WebhookEndpoint; secret: string }>("/admin/webhooks", { body: { url: url.trim(), description: description.trim() || undefined, events: sel } }), {
    changes: ["webhook.changed"], success: "Endpoint added", onSuccess: (r) => onCreated(r.endpoint.id, r.secret),
  });
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} width={560} title="Add a webhook endpoint" description="JewelRoute sends a signed POST to this URL for every event you choose."
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!valid || create.isPending} onClick={() => create.mutate(undefined)}>{create.isPending ? "Adding…" : "Add endpoint"}</Btn></>}>
      <div className="space-y-3.5">
        <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-ink">Endpoint URL</span><Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://erp.example.in/hooks/jewelroute" className={cn("h-8 border-line-strong text-[13px]", mono)} /></label>
        <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-ink">Description</span><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tally sync, WhatsApp alerts to the owner…" className="h-8 border-line-strong text-[14px]" /></label>
        <div><span className="mb-1.5 block text-[13px] font-medium text-ink">Events to send</span><EventChecklist value={sel} onChange={setSel} /></div>
      </div>
    </Modal>
  );
}

function SecretRow({ ep }: { ep: WebhookEndpoint }) {
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = React.useState(false);
  const [fresh, setFresh] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => { if (!revealed) return; const t = setTimeout(() => setRevealed(null), 30_000); return () => clearTimeout(t); }, [revealed]);
  React.useEffect(() => setRevealed(null), [ep.id]);
  const rotate = useWrite(() => api<{ secret: string }>(`/admin/webhooks/${ep.id}/rotate-secret`, { method: "POST" }), {
    changes: ["webhook.changed"], success: "Secret rotated. Update your receiver.", onSuccess: (r) => { setConfirmRotate(false); setRevealed(null); setFresh(r.secret); },
  });
  const reveal = async () => {
    if (revealed) return setRevealed(null);
    setLoading(true);
    try { setRevealed((await api<{ secret: string }>(`/admin/webhooks/${ep.id}/secret`)).secret); } catch (e) { toast.error(errMessage(e)); } finally { setLoading(false); }
  };
  return (
    <>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <code className={cn("min-w-0 truncate rounded-md bg-sunken px-1.5 py-0.5 text-[12.5px] text-ink", mono)}>{revealed ?? `whsec_${"•".repeat(12)}${ep.secretLast4}`}</code>
        {revealed && <CopyBtn text={revealed} />}
        <Btn size="sm" icon={revealed ? EyeOffIcon : EyeIcon} onClick={reveal} disabled={loading}>{revealed ? "Hide" : "Reveal"}</Btn>
        <Btn size="sm" icon={RefreshCwIcon} onClick={() => setConfirmRotate(true)}>Rotate</Btn>
      </span>
      <Modal open={confirmRotate} onOpenChange={setConfirmRotate} title="Rotate signing secret?" description="The current secret stops working immediately. Deliveries signed after this use the new secret, so update your receiver right away."
        footer={<><Btn variant="ghost" onClick={() => setConfirmRotate(false)}>Cancel</Btn><Btn variant="primary" className="bg-danger hover:bg-danger/90" disabled={rotate.isPending} onClick={() => rotate.mutate(undefined)}>Rotate secret</Btn></>} />
      {fresh && <SecretOnce secret={fresh} title="New signing secret" onClose={() => setFresh(null)} />}
    </>
  );
}

function TestResult({ id }: { id: string }) {
  const d = useDelivery(id).data;
  if (!d) return <span className="text-[13px] text-ink-3">Sending…</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[13px]">
      <Dot tone={STATUS[d.status][0]}>{STATUS[d.status][1]}</Dot>
      {d.lastStatusCode != null && <span className={cn("num font-medium", d.lastStatusCode < 300 ? "text-verified" : "text-danger")}>HTTP {d.lastStatusCode}</span>}
      {d.lastLatencyMs != null && <span className="num text-ink-2">{d.lastLatencyMs} ms</span>}
      {d.lastError && d.lastError !== `HTTP ${d.lastStatusCode}` && <span className="text-danger">{d.lastError}</span>}
    </span>
  );
}

/* ---------------- endpoint header (Stripe endpoint page) ---------------- */
function EndpointHeader({ ep, onDeleted }: { ep: WebhookEndpoint; onDeleted: () => void }) {
  const total = useEventList().length;
  const [editingUrl, setEditingUrl] = React.useState(false);
  const [url, setUrl] = React.useState(ep.url);
  const [events, setEvents] = React.useState(ep.events);
  const [editEvents, setEditEvents] = React.useState(false);
  const [testId, setTestId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  React.useEffect(() => { setUrl(ep.url); setEvents(ep.events); setTestId(null); setEditingUrl(false); }, [ep.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = useWrite((body: Partial<Pick<WebhookEndpoint, "url" | "events" | "active">>) => api(`/admin/webhooks/${ep.id}`, { method: "PATCH", body }), {
    changes: ["webhook.changed"], success: (_r, b) => (b.active !== undefined ? (b.active ? "Endpoint enabled" : "Endpoint disabled. New deliveries are parked as dead letters.") : b.url ? "Endpoint URL saved" : "Event subscriptions saved"),
    onSuccess: () => { setEditingUrl(false); setEditEvents(false); },
  });
  const test = useWrite(() => api<{ delivery: Delivery }>(`/admin/webhooks/${ep.id}/test`, { method: "POST" }), { changes: ["webhook.changed"], onSuccess: (r) => setTestId(r.delivery.id) });
  const del = useWrite(() => api(`/admin/webhooks/${ep.id}`, { method: "DELETE" }), { changes: ["webhook.changed"], success: "Endpoint deleted", onSuccess: () => { setConfirmDelete(false); onDeleted(); } });
  const wildcard = ep.events.includes("*");

  return (
    <section className="border-b border-line px-6 pb-4 pt-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-line bg-sunken text-ink-2"><RadioTowerIcon className="size-5" strokeWidth={1.6} /></span>
        <div className="min-w-0 flex-1">
          {editingUrl ? (
            <form className="flex max-w-xl gap-1.5" onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\/.+/.test(url.trim())) patch.mutate({ url: url.trim() }); }}>
              <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} className={cn("h-8 border-line-strong text-[13px]", mono)} />
              <Btn type="submit" variant="primary" disabled={patch.isPending}>Save</Btn>
              <Btn variant="ghost" onClick={() => { setUrl(ep.url); setEditingUrl(false); }}>Cancel</Btn>
            </form>
          ) : (
            <h2 className={cn("truncate text-[15px] font-medium text-ink", mono)} title={ep.url}>{ep.url}</h2>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <Dot tone={ep.active ? "green" : "grey"} className="text-[13px]">{ep.active ? "Enabled" : "Disabled"}</Dot>
            {ep.description && <><span className="text-ink-3">·</span><span>{ep.description}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!editingUrl && <Btn size="sm" icon={PencilIcon} onClick={() => setEditingUrl(true)}>Edit URL</Btn>}
          <Btn size="sm" variant="danger" icon={Trash2Icon} aria-label="Delete endpoint" onClick={() => setConfirmDelete(true)} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-10 xl:grid-cols-2">
        <Property icon={KeyRoundIcon} label="Signing secret"><SecretRow ep={ep} /></Property>
        <Property icon={CircleDotIcon} label="Status">
          <span className="flex flex-wrap items-center gap-2.5">
            <Switch checked={ep.active} onCheckedChange={(v) => patch.mutate({ active: v })} aria-label="Endpoint enabled" />
            <span className="num text-[13px] text-ink-2">Last 24 h: {ep.stats.succeeded24h} delivered{ep.stats.failed24h ? <>, <span className="text-danger">{ep.stats.failed24h} failed</span></> : ", none failed"}</span>
          </span>
        </Property>
        <Property icon={ListChecksIcon} label="Events">
          <span className="flex flex-wrap items-center gap-2"><span className="num">{wildcard ? "All events" : `${ep.events.length} of ${total}`}</span><Btn size="sm" onClick={() => { setEvents(wildcard ? [] : ep.events); setEditEvents(true); }}>Edit</Btn></span>
        </Property>
        <Property icon={SendIcon} label="Test">
          <span className="flex flex-wrap items-center gap-2.5">
            <Btn size="sm" icon={SendIcon} onClick={() => test.mutate(undefined)} disabled={test.isPending || !ep.active} title={ep.active ? undefined : "Enable the endpoint first"}>{test.isPending ? "Sending…" : "Send test event"}</Btn>
            {testId ? <TestResult id={testId} /> : <span className="text-[13px] text-ink-3">Sends a signed <code className={mono}>ping</code> now</span>}
          </span>
        </Property>
      </dl>

      <Modal open={editEvents} onOpenChange={setEditEvents} width={520} title="Events sent to this endpoint"
        footer={<><Btn variant="ghost" onClick={() => setEditEvents(false)}>Cancel</Btn><Btn variant="primary" disabled={!events.length || patch.isPending} onClick={() => patch.mutate({ events })}>Save events</Btn></>}>
        <EventChecklist value={events} onChange={setEvents} />
      </Modal>
      <Modal open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this endpoint?" description="Pending retries stop and are moved to the dead letter list. Delivery history is kept for the audit trail."
        footer={<><Btn variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Btn><Btn variant="primary" className="bg-danger hover:bg-danger/90" disabled={del.isPending} onClick={() => del.mutate(undefined)}>Delete endpoint</Btn></>} />
    </section>
  );
}

/* ---------------- deliveries ---------------- */
function Deliveries({ endpointId, onOpen, openId }: { endpointId: string; onOpen: (id: string) => void; openId: string | null }) {
  const [status, setStatus] = React.useState<"all" | Delivery["status"]>("all");
  const [scope, setScope] = React.useState<"endpoint" | "all">("endpoint");
  const q = useDeliveries(scope === "all" ? undefined : endpointId);
  const retry = useWrite((id: string) => api(`/admin/webhooks/deliveries/${id}/retry`, { method: "POST" }), { changes: ["webhook.changed"], success: "Retry sent" });
  const base = React.useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const rows = base.filter((d) => status === "all" || d.status === status);
  const n = (s: Delivery["status"]) => base.filter((d) => d.status === s).length;
  const cols: Col<Row>[] = [
    { id: "event", header: "Event", accessorFn: (d) => d.eventType, meta: { icon: HashIcon, width: 190 }, cell: ({ row: { original: d } }) => <code className={cn("truncate text-[12.5px] text-ink", mono)}>{d.eventType}</code> },
    { id: "endpoint", header: "Endpoint", accessorFn: (d) => d.endpointUrl ?? d.endpointId, meta: { icon: GlobeIcon, width: 190 }, cell: ({ row: { original: d } }) => <span className={cn("truncate text-[12.5px] text-ink-2", mono)} title={d.endpointUrl}>{host(d.endpointUrl) || d.endpointId}</span> },
    { id: "http", header: "HTTP", accessorFn: (d) => d.lastStatusCode ?? 0, meta: { icon: CodeXmlIcon, width: 76 }, cell: ({ row: { original: d } }) => (d.lastStatusCode != null ? <span className={cn("num font-medium", d.lastStatusCode < 300 ? "text-verified" : "text-danger")}>{d.lastStatusCode}</span> : d.lastError ? <span className="text-[12.5px] text-danger" title={d.lastError}>ERR</span> : <Muted />) },
    { id: "latency", header: "Latency", accessorFn: (d) => d.lastLatencyMs ?? -1, meta: { icon: TimerIcon, width: 90, align: "right" }, cell: ({ row: { original: d } }) => (d.lastLatencyMs != null ? <span className="num">{d.lastLatencyMs} ms</span> : <Muted />) },
    { id: "attempt", header: "Attempt", accessorFn: (d) => d.attempts, meta: { icon: RotateCcwIcon, width: 90, align: "right" }, cell: ({ row: { original: d } }) => <span className="num">{d.attempts}<span className="text-ink-3"> / 7</span></span> },
    { id: "at", header: "Timestamp", accessorFn: (d) => d.createdAt, meta: { icon: CalendarIcon, width: 140 }, cell: ({ row: { original: d } }) => <span className="num" title={d.createdAt}>{fmtDayTime(d.createdAt)}</span> },
    {
      id: "status", header: "Status", accessorFn: (d) => d.status, meta: { icon: ActivityIcon, width: 230 },
      cell: ({ row: { original: d } }) => (
        <span className="flex w-full items-center gap-2">
          <Dot tone={STATUS[d.status][0]}>{STATUS[d.status][1]}</Dot>
          {statusDetail(d) && <span className="num truncate text-[12.5px] text-ink-3">{statusDetail(d)}</span>}
          {(d.status === "FAILED" || d.status === "DEAD") && <Btn size="sm" icon={RotateCcwIcon} className="ml-auto h-6 px-2 text-[12px]" disabled={retry.isPending} onClick={() => retry.mutate(d.id)}>Retry</Btn>}
        </span>
      ),
    },
  ];
  return (
    <div className="flex min-h-[420px] flex-1 flex-col lg:min-h-0">
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line px-6 py-2">
        <ViewTabs value={status} onChange={setStatus} items={[
          { value: "all", label: "All", count: q.data ? base.length : undefined }, { value: "SUCCEEDED", label: "Delivered", count: q.data ? n("SUCCEEDED") : undefined },
          { value: "FAILED", label: "Retrying", count: q.data ? n("FAILED") : undefined }, { value: "DEAD", label: "Dead letter", count: q.data ? n("DEAD") : undefined },
        ]} />
        <label className="ml-auto inline-flex items-center gap-2 text-[13px] text-ink-2"><Switch checked={scope === "all"} onCheckedChange={(v) => setScope(v ? "all" : "endpoint")} aria-label="Show all endpoints" />All endpoints</label>
        <span className="text-[12.5px] text-ink-3">Live · refreshes every 5 s{q.hasNextPage ? ` · newest ${base.length} loaded` : ""}</span>
      </div>
      {q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.isLoading ? <RowsSkeleton rows={6} /> : (
        <DataTable data={rows} columns={cols} getRowId={(d) => d.id} onOpen={(d) => onOpen(d.id)} activeId={openId} selectable={false} countLabel="deliveries" initialSort={[{ id: "at", desc: true }]}
          empty={<Empty icon={InboxIcon} title={base.length ? "No deliveries with this status" : "No deliveries yet"} hint={base.length ? undefined : "Send a test event, or do something in the field app — check-ins, orders and memos all emit events."} />} />
      )}
      {q.hasNextPage && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-line px-6 py-2.5">
          <Btn size="sm" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? "Loading…" : `Load ${PAGE} older`}</Btn>
          {q.isFetchNextPageError && <span className="text-[13px] text-danger">Couldn&apos;t load older deliveries. Try again.</span>}
        </div>
      )}
    </div>
  );
}

/** Headers as captured by the built-in receiver or recorded per attempt (real signature + timestamp). */
function pickHeaders(h?: Record<string, string> | null) {
  const out: Record<string, string> = {};
  if (!h) return out;
  const canon: Record<string, string> = { "content-type": "Content-Type", "user-agent": "User-Agent", "x-jewelroute-event": "X-JewelRoute-Event", "x-jewelroute-delivery": "X-JewelRoute-Delivery", "x-jewelroute-timestamp": "X-JewelRoute-Timestamp", "x-jewelroute-signature": "X-JewelRoute-Signature" };
  for (const [k, v] of Object.entries(h)) { const c = canon[k.toLowerCase()]; if (c) out[c] = String(v); }
  return out;
}
const attemptAt = (a: DeliveryAttempt) => a.at ?? a.createdAt;

function DeliverySheet({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useDelivery(id);
  const d = q.data;
  const received = useReceived();
  const echo = received.data?.find((r) => r.deliveryId === id && r.headers);
  const retry = useWrite(() => api(`/admin/webhooks/deliveries/${id}/retry`, { method: "POST" }), { changes: ["webhook.changed"], success: "Retry sent" });
  const payload = d ? JSON.stringify(d.payload, null, 2) : "";
  const last = d?.attemptLog?.[d.attemptLog.length - 1];
  const real = { ...(last?.requestHeaders ? {} : pickHeaders(echo?.headers)), ...pickHeaders(d?.requestHeaders), ...pickHeaders(last?.requestHeaders) };
  const headers: Record<string, string> = d ? { "Content-Type": "application/json", "User-Agent": "JewelRoute-Webhooks/1.0", "X-JewelRoute-Event": d.eventType, "X-JewelRoute-Delivery": d.id, ...real } : {};
  const isReal = !!real["X-JewelRoute-Signature"];
  if (d && !isReal) { headers["X-JewelRoute-Timestamp"] = "<unix seconds, per attempt>"; headers["X-JewelRoute-Signature"] = "sha256=<HMAC-SHA256(secret, timestamp + \".\" + body)>"; }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[620px]">
        <SheetHeader className="sticky top-0 z-10 gap-1 border-b border-line bg-white px-5 py-4">
          <SheetTitle className={cn("text-[15px] font-medium text-ink", mono)}>{d?.eventType ?? "Delivery"}</SheetTitle>
          <SheetDescription className={cn("text-[12px] text-ink-3", mono)}>{id}</SheetDescription>
          {d && <div className="flex flex-wrap items-center gap-2 pt-1"><Dot tone={STATUS[d.status][0]}>{STATUS[d.status][1]}</Dot>{statusDetail(d) && <span className="text-[13px] text-ink-3">{statusDetail(d)}</span>}{(d.status === "FAILED" || d.status === "DEAD") && <Btn size="sm" variant="primary" icon={RotateCcwIcon} className="ml-auto" disabled={retry.isPending} onClick={() => retry.mutate(undefined)}>{retry.isPending ? "Retrying…" : "Retry now"}</Btn>}</div>}
        </SheetHeader>
        {q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !d ? <RowsSkeleton rows={6} /> : (
          <div className="divide-y divide-line">
            <dl className="px-5 py-3">
              <Property label="Event id"><code className={cn("text-[12.5px]", mono)}>{d.eventId}</code></Property>
              <Property label="Endpoint"><code className={cn("break-all text-[12.5px]", mono)}>{(d as Row).endpointUrl ?? d.url ?? d.endpointId}</code></Property>
              <Property label="Last response">{d.lastStatusCode != null ? <span className={cn("num font-medium", d.lastStatusCode < 300 ? "text-verified" : "text-danger")}>HTTP {d.lastStatusCode}</span> : d.lastError ?? undefined}</Property>
              <Property label="Latency">{d.lastLatencyMs != null ? <span className="num">{d.lastLatencyMs} ms</span> : undefined}</Property>
              <Property label="Attempts"><span className="num">{d.attempts} of 7</span></Property>
              {d.deliveredAt && <Property label="Delivered"><span className="num">{fmtDayTime(d.deliveredAt)}</span></Property>}
              {d.nextAttemptAt && d.status !== "SUCCEEDED" && <Property label="Next attempt"><span className="num">{fmtDayTime(d.nextAttemptAt)} ({relTime(d.nextAttemptAt)})</span></Property>}
              <Property label="Created"><span className="num">{fmtDayTime(d.createdAt)}</span></Property>
            </dl>
            <section className="px-5 py-4">
              <div className="mb-2 flex items-center gap-2"><h3 className="text-[14px] font-medium text-ink">Request headers</h3><span className="ml-auto text-[12.5px] text-ink-3">{isReal ? `Exactly as sent on attempt ${last?.attemptNo ?? last?.attempt ?? d.attempts}` : "Not attempted yet"}</span></div>
              <div className="overflow-hidden rounded-[10px] border border-line">
                {Object.entries(headers).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 border-b border-line px-3 py-1.5 text-[12px] last:border-b-0"><span className={cn("text-ink-3", mono)}>{k}</span><span className={cn("break-all text-ink", mono)}>{v}</span></div>
                ))}
              </div>
            </section>
            <section className="px-5 py-4">
              <div className="mb-2 flex items-center"><h3 className="text-[14px] font-medium text-ink">Payload</h3><span className="ml-auto"><CopyBtn text={payload} /></span></div>
              <Code className="max-h-[380px]">{payload}</Code>
            </section>
            <section className="px-5 py-4">
              <h3 className="mb-2 text-[14px] font-medium text-ink">Attempts</h3>
              {(d.attemptLog?.length ?? 0) === 0 ? <p className="text-[13px] text-ink-3">Not attempted yet.</p> : (
                <ol className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
                  {d.attemptLog.map((a, i) => {
                    const ok = a.statusCode != null && a.statusCode < 300;
                    const h = pickHeaders(a.requestHeaders);
                    return (
                      <li key={i} className="flex items-start gap-3 px-3 py-2.5 text-[13px]">
                        <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2">{a.attemptNo ?? a.attempt ?? i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("num font-medium", ok ? "text-verified" : "text-danger")}>{a.statusCode != null ? `HTTP ${a.statusCode}` : "No response"}</span>
                            {a.latencyMs != null && <span className="num text-ink-3">{a.latencyMs} ms</span>}
                            <span className="num text-ink-3">{fmtTime(attemptAt(a))}</span>
                          </div>
                          {a.error && a.error !== `HTTP ${a.statusCode}` && <div className="text-[12.5px] text-danger">{a.error}</div>}
                          {h["X-JewelRoute-Signature"] && <div className={cn("mt-1 truncate text-[11.5px] text-ink-3", mono)} title={h["X-JewelRoute-Signature"]}>t={h["X-JewelRoute-Timestamp"]} · {h["X-JewelRoute-Signature"]}</div>}
                          {a.responseBody && <div className={cn("mt-1 truncate text-[12px] text-ink-3", mono)}>{a.responseBody}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="mt-2 text-[12.5px] text-ink-3">One immediate attempt, then retries after 30 s, 2 min, 10 min, 30 min, 2 h and 6 h. After the seventh failure the delivery moves to the dead letter list; Retry sends one more attempt now.</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- receiver + verification ---------------- */
function Receiver({ endpointId }: { endpointId: string }) {
  const q = useReceived(endpointId);
  const rows = q.data ?? [];
  return (
    <div className="px-6 py-5">
      <p className="mb-3 max-w-2xl text-[13px] text-ink-2">Requests this endpoint delivered to the built-in receiver at <code className={mono}>/v1/dev/webhook-receiver/…</code>. Each one is checked against the endpoint&apos;s signing secret; a bad signature is rejected with 401 and listed here as such. Failed deliveries the receiver never accepted are not listed.</p>
      {q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.isLoading ? <RowsSkeleton rows={4} /> : rows.length === 0 ? <Empty icon={InboxIcon} title="Nothing received yet" hint="Send a test event to the built-in receiver." /> : (
        <ol className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
          {rows.slice(0, 25).map((r) => {
            const ok = r.signatureOk ?? r.signatureValid ?? r.verified;
            const type = r.eventType ?? r.type ?? (r.body as { type?: string } | undefined)?.type ?? "event";
            return (
              <li key={r.id} className="flex h-10 items-center gap-2.5 px-3.5 text-[13px]">
                {ok ? <ShieldCheckIcon className="size-4 shrink-0 text-verified" /> : <ShieldXIcon className="size-4 shrink-0 text-danger" />}
                <code className={cn("min-w-0 flex-1 truncate text-[12.5px] text-ink", mono)}>{type}</code>
                {r.eventId && <code className={cn("hidden truncate text-[12px] text-ink-3 md:block", mono)}>{r.eventId}</code>}
                <Chip tone={ok ? "green" : "red"}>{ok ? "Signature verified" : "Bad signature · rejected"}</Chip>
                <span className="w-20 shrink-0 text-right text-ink-3">{relTime(r.receivedAt ?? r.createdAt ?? "")}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const NODE_SNIPPET = `import crypto from "node:crypto";

// Use the raw request body, before any JSON parsing.
export function verify(rawBody, headers, secret) {
  const ts = headers["x-jewelroute-timestamp"];
  const sig = headers["x-jewelroute-signature"]; // "sha256=<hex>"
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(\`\${ts}.\${rawBody}\`)
    .digest("hex");
  return sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}`;

function Verify() {
  return (
    <div className="max-w-3xl px-6 py-5">
      <div className="mb-2 flex items-center"><h3 className="text-[14px] font-medium text-ink">Verify signatures (Node.js)</h3><span className="ml-auto"><CopyBtn text={NODE_SNIPPET} /></span></div>
      <Code>{NODE_SNIPPET}</Code>
      <p className="mt-2 text-[13px] text-ink-2">Signature = HMAC-SHA256 of <code className={mono}>{"${timestamp}.${rawBody}"}</code> with the full <code className={mono}>whsec_…</code> secret. Reject requests older than 5 minutes and deduplicate on the event <code className={mono}>id</code> — deliveries are at-least-once. <Link href="/developers#signatures" className="text-ink underline underline-offset-2">Python example and full reference</Link></p>
    </div>
  );
}

/* ---------------- page ---------------- */
export function IntegrationsPage() {
  const hydrated = useHydrated();
  return hydrated ? <IntegrationsBody /> : <RowsSkeleton />;
}

function IntegrationsBody() {
  const q = useWebhooks();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [created, setCreated] = React.useState<string | null>(null);
  const [delivery, setDelivery] = React.useState<string | null>(null);
  const tab = useTab("deliveries");
  const eps = q.data ?? [];
  const ep = eps.find((e) => e.id === selected) ?? eps.find((e) => e.active) ?? eps[0];
  const received = useReceived(ep?.id);
  const deliveries = useDeliveries(ep?.id);
  const loaded = deliveries.data?.pages.reduce((n, p) => n + p.items.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:overflow-hidden">
      <TitleBar icon={PlugIcon} iconClass={OBJECT_TINT.integrations} title="Integrations" info="Send check-ins, orders, memos and custody changes to your ERP, Tally connector or WhatsApp bot as they happen. Every request is signed with HMAC-SHA256 and retried with backoff.">
        <Btn variant="primary" icon={PlusIcon} onClick={() => setAdding(true)}>Add endpoint</Btn>
      </TitleBar>
      {q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.isLoading ? <RowsSkeleton /> : !ep ? (
        <Empty icon={RadioTowerIcon} title="No webhook endpoints yet" hint="Add an endpoint to start receiving signed events for visits, orders, memos and custody changes." action={<Btn icon={PlusIcon} onClick={() => setAdding(true)}>Add endpoint</Btn>} />
      ) : (
        <>
          <ViewBar right={<span className="hidden text-[13px] text-ink-2 md:inline">Webhooks · <span className="num">{eps.length}</span> endpoint{eps.length === 1 ? "" : "s"}</span>}>
            <ViewTabs value={ep.id} onChange={setSelected} items={eps.map((e) => ({ value: e.id, label: host(e.url).replace(/\/v1\/dev\/webhook-receiver\/.*/, " · built-in receiver").slice(0, 44), count: e.stats.failed24h || undefined }))} />
          </ViewBar>
          <EndpointHeader key={ep.id} ep={ep} onDeleted={() => setSelected(null)} />
          <RecordTabs tabs={[
            { value: "deliveries", label: "Deliveries", icon: SendIcon, count: loaded != null && !deliveries.hasNextPage ? loaded : undefined },
            { value: "receiver", label: "Test receiver", icon: InboxIcon, count: received.data?.length },
            { value: "verify", label: "Verify signatures", icon: ShieldCheckIcon },
          ]} />
          {tab === "deliveries" && <Deliveries endpointId={ep.id} onOpen={setDelivery} openId={delivery} />}
          {tab === "receiver" && <div className="min-h-0 flex-1 overflow-y-auto"><Receiver endpointId={ep.id} /></div>}
          {tab === "verify" && <div className="min-h-0 flex-1 overflow-y-auto"><Verify /></div>}
        </>
      )}
      <AddEndpoint open={adding} onClose={() => setAdding(false)} onCreated={(id, secret) => { setAdding(false); setSelected(id); setCreated(secret); }} />
      {created && <SecretOnce secret={created} title="Endpoint added" onClose={() => setCreated(null)} />}
      {delivery && <DeliverySheet id={delivery} onClose={() => setDelivery(null)} />}
    </div>
  );
}
