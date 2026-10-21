import { Suspense } from "react";
import { ShopRecord } from "@/components/admin-v2/field/shop-record";
import { RecordSkeleton } from "@/components/admin-v2/field/ui";

export const metadata = { title: "Shop" };

export default async function ShopRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<RecordSkeleton />}><ShopRecord id={id} /></Suspense>;
}
