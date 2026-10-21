"use client";
/** Record Activity tab: the record's own outbox events (API `activity`) on the Attio timeline. */
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ActivityItem } from "@/lib/types";
import { Timeline } from "@/components/app/timeline";
import { toTimeline } from "@/components/admin-v2/field/ui";

export function ActivityTimeline({ items, empty, selfId }: { items: ActivityItem[]; empty?: React.ReactNode; selfId?: string }) {
  const router = useRouter();
  // Clicking an event opens the record it is about — except this record itself.
  const rows = toTimeline(items, (href) => router.push(href)).map((t, i) => (items[i].entity.id === selfId ? { ...t, onClick: undefined } : t));
  return <Timeline items={rows} empty={empty} />;
}
