import type { Metadata } from "next";
import { Suspense } from "react";
import { SaleView } from "@/components/field/sale/sale-view";

export const metadata: Metadata = { title: "Catalog" };
export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><SaleView visitId={id} /></Suspense>;
}
