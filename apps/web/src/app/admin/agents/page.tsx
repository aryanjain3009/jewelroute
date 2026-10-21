import { Suspense } from "react";
import { RowsSkeleton } from "@/components/app/chrome";
import { AgentsList } from "@/components/admin-v2/field/agents-list";

export const metadata = { title: "Agents" };

export default function AgentsPage() {
  return <Suspense fallback={<RowsSkeleton />}><AgentsList /></Suspense>;
}
