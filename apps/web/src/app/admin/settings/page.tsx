"use client";
/** Settings — Gold rate and Workspace. Shops, agents, catalog and integrations have their own pages. */
import * as React from "react";
import { useHydrated } from "@/components/admin-v2/sales/ui";
import Link from "next/link";
import { BuildingIcon, CodeXmlIcon, CoinsIcon, FlaskConicalIcon, HashIcon, MailIcon, Settings2Icon, ShieldIcon, UserIcon } from "lucide-react";
import { useMe } from "@/lib/session";
import { Avatar, Chip, RowsSkeleton, TitleBar } from "@/components/app/chrome";
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
              <span className="text-[13px] text-ink-3">{u.tenant.demoMode ? "Agents may use simulated GPS check-ins. They're recorded as SIMULATED and labelled everywhere — never as verified." : "Only real GPS check-ins inside the shop's geofence are accepted."} Read-only; set per workspace by JewelRoute.</span>
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

function SettingsBody() {
  const tab = useTab("gold-rate");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={Settings2Icon} iconClass={OBJECT_TINT.settings} title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RecordTabs tabs={[{ value: "gold-rate", label: "Gold rate", icon: CoinsIcon }, { value: "workspace", label: "Workspace", icon: BuildingIcon }]} />
        <div className="mx-auto max-w-[1100px]">
          {tab === "workspace" ? <Workspace /> : <GoldRateSettings />}
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
