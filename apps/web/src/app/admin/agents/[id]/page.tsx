import { Suspense } from "react";
import { AgentRecord } from "@/components/admin-v2/field/agent-record";
import { RecordSkeleton } from "@/components/admin-v2/field/ui";

export const metadata = { title: "Agent" };

export default async function AgentRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<RecordSkeleton />}><AgentRecord id={id} /></Suspense>;
}
