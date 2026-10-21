"use client";
import { Suspense } from "react";
import { RowsSkeleton } from "@/components/app/chrome";
import { IntegrationsPage } from "@/components/admin-v2/sales/integrations";

export default function Integrations() {
  return <Suspense fallback={<RowsSkeleton />}><IntegrationsPage /></Suspense>;
}
