"use client";
/** Settings — Gold rate and Workspace. Shops, agents, catalog and integrations have their own pages. */
import * as React from "react";
import { useHydrated } from "@/components/admin-v2/sales/ui";
import Link from "next/link";
import { BuildingIcon, CodeXmlIcon, CoinsIcon, CreditCardIcon, FlaskConicalIcon, HashIcon, IndianRupeeIcon, MailIcon, Settings2Icon, ShieldCheckIcon, ShieldIcon, UserIcon } from "lucide-react";
import { formatINR, formatINRCompact } from "@jewelroute/shared";
import { api } from "@/lib/api";
import type { TenantSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSettings, useWrite } from "@/components/admin-v2/sales/data";
import { useMe } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/sync";
import { Avatar, Btn, Chip, RowsSkeleton, TitleBar } from "@/components/app/chrome";
import { MainSection, Property, RecordTabs, useTab } from "@/components/app/record";
import { OBJECT_TINT } from "@/components/app/shell";
import { GoldRateSettings } from "@/components/admin-v2/sales/gold-rate";

function Workspace() {
  const me = useMe();
  const u = me.data;
  if (!u) return <RowsSkeleton rows={5} />;
  return (
    <>
      <MainSection title="Workspace">
        <dl className="max-w-2xl">
          <Property icon={BuildingIcon} label="Name">{u.tenant.name}</Property>
          <Property icon={HashIcon} label="Slug"><span className="num">{u.tenant.slug}</span></Property>
          <Property icon={FlaskConicalIcon} label="Demo mode">
            <span className="flex flex-col gap-0.5">
              <span><Chip tone={u.tenant.demoMode ? "blue" : "grey"}>{u.tenant.demoMode ? "On" : "Off"}</Chip></span>
              <span className="text-[13px] text-ink-3">{u.tenant.demoMode ? "Agents may use simulated GPS check-ins. They're recorded as simulated and labelled everywhere — never as verified." : "Only real GPS check-ins inside the shop's geofence are accepted."} Read-only; set per workspace by JewelRoute.</span>
            </span>
          </Property>
          <Property icon={CodeXmlIcon} label="API">
            <span className="flex flex-col gap-0.5"><Link href="/developers" className="text-ink underline decoration-ink-3 underline-offset-4 hover:decoration-ink">API &amp; webhook docs</Link><span className="text-[13px] text-ink-3">REST endpoints, webhook payloads and signature verification.</span></span>
          </Property>
        </dl>
      </MainSection>
      <MainSection title="Signed in as">
        <dl className="max-w-2xl">
          <Property icon={UserIcon} label="Name"><span className="flex items-center gap-2"><Avatar name={u.name} />{u.name}</span></Property>
          <Property icon={MailIcon} label="Email">{u.email}</Property>
          <Property icon={ShieldIcon} label="Role">{u.role === "ADMIN" ? "Admin" : "Field agent"}</Property>
        </dl>
      </MainSection>
    </>
  );
}

/** "10,00,000" / "1000000.50" rupees → integer paise without floating point; "" → null (rule off). */
function parseRupees(v: string): number | null | "invalid" {
  const t = v.replace(/[,\s₹]/g, "");
  if (!t) return null;
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return "invalid";
  const paise = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return paise > 0 ? paise : "invalid";
}

function Approvals() {
  const settings = useSettings();
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState<string | null>(null);
  const cur = settings.data?.approvalThresholdPaise ?? null;
  const value = draft ?? (cur == null ? "" : formatINR(cur).replace("₹", ""));
  const parsed = parseRupees(value);
  const dirty = draft !== null && parsed !== "invalid" && parsed !== cur;
  const save = useWrite((v: number | null) => api<TenantSettings>("/admin/settings", { method: "PATCH", body: { approvalThresholdPaise: v } }), {
    changes: ["settings.saved"],
    success: (r) => (r.approvalThresholdPaise == null ? "Approval threshold turned off" : `Orders of ${formatINRCompact(r.approvalThresholdPaise)} or more now need approval`),
    // Show the server's saved value at once (it is the API response, not a guess), so the old value never flashes back.
    onSuccess: (r) => { qc.setQueryData(qk.settings, r); setDraft(null); },
  });
  if (!settings.data) return settings.error ? <div className="px-6 py-5 text-[13px] text-danger">Couldn&apos;t load settings.</div> : <RowsSkeleton rows={4} />;
  return (
    <>
      <MainSection title="Order approval">
        <p className="-mt-1 mb-4 max-w-2xl text-[13px] text-ink-2">
          Orders are confirmed the moment an agent places them. The server sends one to you for approval only when a rule trips, and records why on the order.
        </p>
        <dl className="max-w-2xl">
          <Property icon={CreditCardIcon} label="Credit limit rule">
            <span className="flex flex-col gap-0.5">
              <span>Always on</span>
              <span className="text-[13px] text-ink-3">Needs approval when outstanding + samples on memo + the new order would go over the shop&apos;s credit limit. Set limits on each shop record.</span>
            </span>
          </Property>
          <Property icon={IndianRupeeIcon} label="Approval threshold">
            <span className="flex flex-col gap-2">
              <span className="flex items-center gap-2">
                <label className={cn("flex h-8 w-48 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[14px] focus-within:ring-2 focus-within:ring-blue/15", parsed === "invalid" ? "border-danger" : "border-line-strong focus-within:border-blue")}>
                  <span className="text-ink-3">₹</span>
                  <input aria-label="Approval threshold in rupees" inputMode="decimal" value={value} onChange={(e) => setDraft(e.target.value)} placeholder="Off" className="num min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
                </label>
                <Btn variant={dirty ? "primary" : "default"} disabled={!dirty || save.isPending} onClick={() => parsed !== "invalid" && save.mutate(parsed)}>{save.isPending ? "Saving…" : "Save"}</Btn>
                {cur != null && <Btn variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>Turn off</Btn>}
              </span>
              <span className="text-[13px] text-ink-3">
                {parsed === "invalid" ? <span className="text-danger">Enter an amount in rupees, e.g. 10,00,000.</span>
                  : cur == null ? "Off — order size alone never needs approval."
                  : <>Orders of <span className="num font-medium text-ink">{formatINR(cur)}</span> ({formatINRCompact(cur)}) or more, incl. GST, need approval.</>}
              </span>
            </span>
          </Property>
        </dl>
      </MainSection>
    </>
  );
}

function SettingsBody() {
  const tab = useTab("gold-rate");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={Settings2Icon} iconClass={OBJECT_TINT.settings} title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RecordTabs tabs={[{ value: "gold-rate", label: "Gold rate", icon: CoinsIcon }, { value: "approvals", label: "Approvals", icon: ShieldCheckIcon }, { value: "workspace", label: "Workspace", icon: BuildingIcon }]} />
        <div className="max-w-[1120px] pb-10">
          {tab === "workspace" ? <Workspace /> : tab === "approvals" ? <Approvals /> : <GoldRateSettings />}
        </div>
      </div>
    </div>
  );
}

function SettingsInner() {
  const hydrated = useHydrated();
  return hydrated ? <SettingsBody /> : <RowsSkeleton />;
}

export default function SettingsPage() {
  return <React.Suspense fallback={<RowsSkeleton />}><SettingsInner /></React.Suspense>;
}
