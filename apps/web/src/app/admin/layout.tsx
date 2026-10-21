import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";

export const metadata: Metadata = { title: { default: "JewelRoute", template: "%s · JewelRoute" } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>{children}</AppShell>
  );
}
