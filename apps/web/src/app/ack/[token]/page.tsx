import type { Metadata } from "next";
import { AckView } from "@/components/field/ack-view";

export const metadata: Metadata = { title: "Confirm samples received", robots: { index: false, follow: false } };
export default async function AckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AckView token={token} />;
}
