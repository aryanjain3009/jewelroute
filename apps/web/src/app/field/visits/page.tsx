import type { Metadata } from "next";
import { VisitsView } from "@/components/field/visits-view";

export const metadata: Metadata = { title: "Visits" };
export default function VisitsPage() { return <VisitsView />; }
