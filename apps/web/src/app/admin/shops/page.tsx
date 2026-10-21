import { Suspense } from "react";
import { RowsSkeleton } from "@/components/app/chrome";
import { ShopsList } from "@/components/admin-v2/field/shops-list";

export const metadata = { title: "Shops" };

export default function ShopsPage() {
  return <Suspense fallback={<RowsSkeleton />}><ShopsList /></Suspense>;
}
