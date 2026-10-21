import { Suspense } from "react";
import { VisitRecord } from "@/components/admin-v2/field/visit-record";
import { RecordSkeleton } from "@/components/admin-v2/field/ui";

export const metadata = { title: "Visit" };

export default async function VisitRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<RecordSkeleton />}><VisitRecord id={id} /></Suspense>;
}
