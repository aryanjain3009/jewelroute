import type { Metadata } from "next";
import { VisitView } from "@/components/field/visit-view";

export const metadata: Metadata = { title: "Visit" };
export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VisitView id={id} />;
}
