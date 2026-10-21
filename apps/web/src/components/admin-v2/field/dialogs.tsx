"use client";
/** Writes owned by the Field surfaces: assign a visit, create/edit a shop, change a shop's agent,
 *  remove a planned visit. Every success calls useSync() so Home, Shops, records and Agents refetch. */
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPinIcon } from "lucide-react";
import { addDays, istDate } from "@jewelroute/shared";
import { api, ApiError } from "@/lib/api";
import { qk, useSync } from "@/lib/sync";
import { cn } from "@/lib/utils";
import type { Shop } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Btn } from "@/components/app/chrome";
import { JrMap } from "@/components/admin/map-lazy";
import { useAgentOptions, useVisitRows } from "./data";
import { StatusDot, VISIT_STATUS, istDay } from "./ui";

export const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong. Try again.");

/* ---------------- form atoms (Attio modal: 13px labels, 32px inputs) ---------------- */
export function FormField({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-[12.5px] text-ink-3">{hint}</span>}
    </label>
  );
}
const inputCls = "h-8 w-full rounded-lg border border-line-strong bg-white px-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-blue focus:ring-2 focus:ring-blue/15";
export const TextInput = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(inputCls, p.className)} />;
export function SelectInput({ value, onChange, children, className, ...rest }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & { onChange: (v: string) => void }) {
  return <select {...rest} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22M4 6l4 4 4-4%22 fill=%22none%22 stroke=%22%239b9ca0%22 stroke-width=%221.6%22/></svg>')] bg-[length:14px] bg-[right_8px_center] bg-no-repeat pr-7", className)}>{children}</select>;
}

/* ---------------- Assign visit ---------------- */
type ShopOpt = Pick<Shop, "id" | "name" | "area">;
export function AssignVisitDialog({ open, onOpenChange, shopId: initialShop, agentId: initialAgent }: { open: boolean; onOpenChange: (o: boolean) => void; shopId?: string; agentId?: string }) {
  const sync = useSync();
  const shops = useQuery({ queryKey: [...qk.shops, "options"], queryFn: () => api<ShopOpt[]>("/admin/shops"), enabled: open, staleTime: 60_000 });
  const agents = useAgentOptions();
  const today = istDate();
  const [shopId, setShopId] = React.useState(initialShop ?? "");
  const [agentId, setAgentId] = React.useState(initialAgent ?? "");
  const [date, setDate] = React.useState(today);
  React.useEffect(() => { if (open) { setShopId(initialShop ?? ""); setAgentId(initialAgent ?? ""); setDate(today); } }, [open, initialShop, initialAgent, today]);
  const plan = useVisitRows({ date, agentId: agentId || undefined }, { enabled: open && !!agentId, refetch: 0 });
  const shop = shops.data?.find((s) => s.id === shopId);
  const agent = agents.data?.find((a) => a.id === agentId);
  const already = !!plan.data?.some((v) => v.shop.id === shopId);
  const m = useMutation({
    mutationFn: () => api("/admin/assignments", { body: { agentId, shopId, date } }),
    onSuccess: () => {
      sync("visit.assigned");
      toast.success(`${shop?.name ?? "Shop"} added to ${agent?.name.split(" ")[0] ?? "the agent"}'s route for ${date === today ? "today" : istDay(date)}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const route = [...(plan.data ?? [])].sort((a, b) => a.sequence - b.sequence);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-xl p-0 sm:max-w-[500px]">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="text-[15px] font-semibold">Assign visit</DialogTitle>
          <DialogDescription className="text-[13px]">The shop appears on the agent&apos;s route as soon as you save.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3.5 px-5 pb-5">
          <FormField label="Shop">
            <SelectInput value={shopId} onChange={setShopId} disabled={!!initialShop && !!shop}>
              <option value="" disabled>Choose a shop</option>
              {(shops.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.area}</option>)}
            </SelectInput>
          </FormField>
          <div className="grid grid-cols-[1fr_150px] gap-3">
            <FormField label="Agent">
              <SelectInput value={agentId} onChange={setAgentId}>
                <option value="" disabled>Choose an agent</option>
                {(agents.data ?? []).filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </SelectInput>
            </FormField>
            <FormField label="Date">
              <TextInput type="date" value={date} min={today} max={addDays(today, 60)} onChange={(e) => setDate(e.target.value)} className="num" />
            </FormField>
          </div>
          {agent && (
            <div className="rounded-[10px] border border-line">
              <div className="border-b border-line px-3 py-2 text-[13px] text-ink-2">{agent.name.split(" ")[0]}&apos;s route · {date === today ? "today" : istDay(date)}</div>
              <ol className="divide-y divide-line text-[13px]">
                {plan.isLoading && <li className="px-3 py-2 text-ink-3">Loading route…</li>}
                {route.map((v) => (
                  <li key={v.id} className="flex h-9 items-center gap-2 px-3">
                    <span className="num w-4 text-ink-3">{v.sequence}</span><span className="truncate text-ink">{v.shop.name}</span>
                    <span className="ml-auto"><StatusDot map={VISIT_STATUS} value={v.status} className="text-[13px]" /></span>
                  </li>
                ))}
                {shop && !already && !plan.isLoading && (
                  <li className="flex h-9 items-center gap-2 bg-selected px-3"><span className="num w-4 text-ink-3">{route.length + 1}</span><span className="font-medium text-ink">{shop.name}</span><span className="ml-auto text-ink-3">New</span></li>
                )}
                {!plan.isLoading && !route.length && !shop && <li className="px-3 py-2 text-ink-3">No visits planned yet.</li>}
              </ol>
            </div>
          )}
          {already && <p className="text-[13px] text-warn">{shop?.name} is already on this route for that day.</p>}
        </div>
        <DialogFooter className="mx-0 mb-0 border-t border-line bg-white px-5 py-3">
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn variant="primary" icon={MapPinIcon} disabled={!shopId || !agentId || already || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Assigning…" : "Assign visit"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Remove a planned visit ---------------- */
export function useUnassign() {
  const sync = useSync();
  return useMutation({
    mutationFn: (visitId: string) => api(`/admin/assignments/${visitId}`, { method: "DELETE" }),
    onSuccess: () => { sync("visit.assigned"); toast.success("Visit removed from the route"); },
    onError: (e) => toast.error(errMsg(e)),
  });
}

/* ---------------- Assigned agent (PATCH shop) ---------------- */
export function useSetShopAgent(shopId: string) {
  const sync = useSync();
  return useMutation({
    mutationFn: (assignedAgentId: string | null) => api(`/admin/shops/${shopId}`, { method: "PATCH", body: { assignedAgentId } }),
    onSuccess: () => { sync("shop.saved", "agent.saved"); toast.success("Assigned agent updated"); },
    onError: (e) => toast.error(errMsg(e)),
  });
}

/* ---------------- Create / edit shop ---------------- */
type Form = { code: string; name: string; ownerName: string; phone: string; address: string; area: string; city: string; lat: string; lng: string; geofenceRadiusM: string; creditLimit: string };
const blank: Form = { code: "", name: "", ownerName: "", phone: "", address: "", area: "", city: "New Delhi", lat: "", lng: "", geofenceRadiusM: "100", creditLimit: "" };
const toForm = (s: Shop): Form => ({ code: s.code, name: s.name, ownerName: s.ownerName ?? "", phone: s.phone ?? "", address: s.address, area: s.area, city: s.city, lat: String(s.lat), lng: String(s.lng), geofenceRadiusM: String(s.geofenceRadiusM), creditLimit: String(s.creditLimitPaise / 100) });
/** Rupees (as typed, integer or 2 dp) → paise without float maths. */
function rupeesToPaise(s: string): number | null {
  const t = s.replace(/[,₹\s]/g, "");
  if (!t) return 0;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

export function ShopSheet({ open, onOpenChange, shop, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; shop?: Shop | null; onSaved?: (id: string) => void }) {
  const sync = useSync();
  const [f, setF] = React.useState<Form>(shop ? toForm(shop) : blank);
  React.useEffect(() => { if (open) setF(shop ? toForm(shop) : blank); }, [open, shop]);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const lat = Number(f.lat), lng = Number(f.lng), radius = Number(f.geofenceRadiusM);
  const geoOk = f.lat.trim() !== "" && f.lng.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const credit = rupeesToPaise(f.creditLimit);
  const radiusOk = Number.isInteger(radius) && radius >= 20 && radius <= 1000;
  const valid = !!(f.name.trim() && f.code.trim() && f.area.trim() && f.address.trim() && geoOk && radiusOk && credit !== null);
  const body = { code: f.code.trim(), name: f.name.trim(), ownerName: f.ownerName.trim() || undefined, phone: f.phone.trim() || undefined, address: f.address.trim(), area: f.area.trim(), city: f.city.trim(), lat, lng, geofenceRadiusM: radius, creditLimitPaise: credit ?? 0 };
  const m = useMutation({
    mutationFn: () => (shop ? api<{ shop?: Shop } & Partial<Shop>>(`/admin/shops/${shop.id}`, { method: "PATCH", body }) : api<{ shop?: Shop } & Partial<Shop>>("/admin/shops", { body })),
    onSuccess: (r) => {
      sync("shop.saved");
      toast.success(shop ? `${f.name} saved` : `${f.name} added`);
      onOpenChange(false);
      const id = r?.shop?.id ?? r?.id;
      if (id) onSaved?.(id);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  // Debounce the map so typing coordinates doesn't rebuild it per keystroke.
  const [mapAt, setMapAt] = React.useState<{ lat: number; lng: number } | null>(null);
  React.useEffect(() => { const t = setTimeout(() => setMapAt(geoOk ? { lat, lng } : null), 400); return () => clearTimeout(t); }, [geoOk, lat, lng]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="border-b border-line px-5 pb-4 pt-5">
          <SheetTitle className="text-[15px] font-semibold">{shop ? `Edit ${shop.name}` : "New shop"}</SheetTitle>
          <SheetDescription className="text-[13px]">Agents can only check in inside the geofence.</SheetDescription>
        </SheetHeader>
        <form id="shop-form" className="grid grid-cols-2 gap-3.5 px-5 py-5" onSubmit={(e) => { e.preventDefault(); if (valid) m.mutate(); }}>
          <FormField label="Shop name" className="col-span-2"><TextInput value={f.name} onChange={set("name")} placeholder="Sharma Jewellers" autoFocus /></FormField>
          <FormField label="Code"><TextInput value={f.code} onChange={set("code")} placeholder="DL-KB-001" className="num" /></FormField>
          <FormField label="Owner"><TextInput value={f.ownerName} onChange={set("ownerName")} placeholder="Rakesh Sharma" /></FormField>
          <FormField label="Phone"><TextInput value={f.phone} onChange={set("phone")} placeholder="+91 98110 00000" className="num" /></FormField>
          <FormField label="Credit limit (₹)" hint={credit === null ? "Use digits, up to 2 decimals." : undefined}><TextInput inputMode="decimal" value={f.creditLimit} onChange={set("creditLimit")} placeholder="15,00,000" className="num" /></FormField>
          <FormField label="Address" className="col-span-2"><TextInput value={f.address} onChange={set("address")} placeholder="2611 Bank Street, Karol Bagh" /></FormField>
          <FormField label="Area"><TextInput value={f.area} onChange={set("area")} placeholder="Karol Bagh" /></FormField>
          <FormField label="City"><TextInput value={f.city} onChange={set("city")} /></FormField>
          <FormField label="Latitude"><TextInput inputMode="decimal" value={f.lat} onChange={set("lat")} placeholder="28.65190" className="num" /></FormField>
          <FormField label="Longitude"><TextInput inputMode="decimal" value={f.lng} onChange={set("lng")} placeholder="77.19090" className="num" /></FormField>
          <FormField label="Geofence radius (m)" hint="20–1000 m. GPS accuracy adds up to 50 m of slack." className="col-span-2"><TextInput inputMode="numeric" value={f.geofenceRadiusM} onChange={set("geofenceRadiusM")} className="num w-32" /></FormField>
          <div className="col-span-2 h-[220px] overflow-hidden rounded-[10px] border border-line">
            {mapAt ? <JrMap key={`${mapAt.lat.toFixed(4)},${mapAt.lng.toFixed(4)}`} initialZoom={16} markers={[{ id: "s", lat: mapAt.lat, lng: mapAt.lng, tone: "next", label: f.name || "Shop" }]} fence={{ lat: mapAt.lat, lng: mapAt.lng, radiusM: radiusOk ? radius : 100 }} />
              : <div className="grid h-full place-items-center text-[13px] text-ink-3">Enter coordinates to preview the geofence</div>}
          </div>
        </form>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white px-5 py-3">
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="shop-form" disabled={!valid || m.isPending}>{m.isPending ? "Saving…" : shop ? "Save shop" : "Create shop"}</Btn>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- Add agent / activate–deactivate ---------------- */
export function AddAgentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void }) {
  const sync = useSync();
  const [f, setF] = React.useState({ name: "", email: "", phone: "", homeArea: "", password: "" });
  React.useEffect(() => { if (open) setF({ name: "", email: "", phone: "", homeArea: "", password: "" }); }, [open]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const valid = f.name.trim() && /^\S+@\S+\.\S+$/.test(f.email.trim()) && f.password.length >= 8;
  const m = useMutation({
    mutationFn: () => api<{ agent: { id: string; name: string } }>("/admin/agents", {
      body: { name: f.name.trim(), email: f.email.trim(), password: f.password, phone: f.phone.trim() || undefined, homeArea: f.homeArea.trim() || undefined },
    }),
    onSuccess: (r) => { sync("agent.saved"); toast.success(`${r.agent.name} can now sign in to the field app`); onOpenChange(false); onCreated?.(r.agent.id); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-xl p-0 sm:max-w-[480px]">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="text-[15px] font-semibold">Add agent</DialogTitle>
          <DialogDescription className="text-[13px]">They sign in to the field app with this email and the temporary password. Share it with them directly.</DialogDescription>
        </DialogHeader>
        <form id="add-agent" className="flex flex-col gap-3.5 px-5 pb-5" onSubmit={(e) => { e.preventDefault(); if (valid && !m.isPending) m.mutate(); }}>
          <FormField label="Full name"><TextInput autoFocus value={f.name} onChange={set("name")} placeholder="Neha Kapoor" maxLength={200} /></FormField>
          <FormField label="Work email"><TextInput type="email" value={f.email} onChange={set("email")} placeholder="neha@aurum.in" maxLength={200} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Phone"><TextInput type="tel" value={f.phone} onChange={set("phone")} placeholder="+91 98100 00000" maxLength={32} className="num" /></FormField>
            <FormField label="Home area"><TextInput value={f.homeArea} onChange={set("homeArea")} placeholder="Karol Bagh" maxLength={100} /></FormField>
          </div>
          <FormField label="Temporary password" hint="At least 8 characters."><TextInput type="text" autoComplete="off" value={f.password} onChange={set("password")} className="num" /></FormField>
        </form>
        <DialogFooter className="mx-0 mb-0 border-t border-line bg-white px-5 py-3">
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="add-agent" disabled={!valid || m.isPending}>{m.isPending ? "Adding…" : "Add agent"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** PATCH active. Deactivating keeps every visit, memo and order; the agent can no longer sign in or be assigned. */
export function useSetAgentActive(agentId: string) {
  const sync = useSync();
  return useMutation({
    mutationFn: (active: boolean) => api<{ agent: { name: string; active: boolean } }>(`/admin/agents/${agentId}`, { method: "PATCH", body: { active } }),
    onSuccess: (r) => { sync("agent.saved"); toast.success(r.agent.active ? `${r.agent.name} is active again` : `${r.agent.name} is deactivated`); },
    onError: (e) => toast.error(errMsg(e)),
  });
}

export function AgentActiveDialog({ open, onOpenChange, agent }: { open: boolean; onOpenChange: (o: boolean) => void; agent: { id: string; name: string; active: boolean } }) {
  const m = useSetAgentActive(agent.id);
  const deactivating = agent.active;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-xl p-0 sm:max-w-[460px]">
        <DialogHeader className="px-5 pb-5 pt-5">
          <DialogTitle className="text-[15px] font-semibold">{deactivating ? `Deactivate ${agent.name}?` : `Reactivate ${agent.name}?`}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {deactivating
              ? "They can't sign in or be assigned visits. Their visits, orders, memos and audit history stay on record. Return the samples in their bag to the vault first."
              : "They can sign in to the field app again and be assigned visits."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mx-0 mb-0 border-t border-line bg-white px-5 py-3">
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn variant={deactivating ? "danger" : "primary"} disabled={m.isPending} onClick={() => m.mutate(!agent.active, { onSuccess: () => onOpenChange(false) })}>
            {m.isPending ? "Saving…" : deactivating ? "Deactivate agent" : "Reactivate agent"}
          </Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
