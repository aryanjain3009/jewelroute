import { Suspense } from "react";
import { RowsSkeleton } from "@/components/app/chrome";
import { HomeView } from "@/components/admin-v2/field/home";

export const metadata = { title: "Home" };

export default function AdminHome() {
  return <Suspense fallback={<RowsSkeleton />}><HomeView /></Suspense>;
}
