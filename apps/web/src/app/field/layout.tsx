import type { Metadata } from "next";
import { FieldShell } from "@/components/field/shell";

export const metadata: Metadata = { title: { default: "Field", template: "%s · JewelRoute" } };

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <FieldShell>{children}</FieldShell>;
}
