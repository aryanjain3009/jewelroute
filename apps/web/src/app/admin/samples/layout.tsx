import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Samples · JewelRoute", template: "%s · JewelRoute" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
