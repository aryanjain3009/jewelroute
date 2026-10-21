"use client";
/** Vault ↔ agent moves (POST /admin/pieces/issue, /admin/pieces/return-to-vault). The server re-checks
 *  every piece's current custodian inside the move; we only show what it answered. */
import * as React from "react";
import { formatGrams, formatINR } from "@jewelroute/shared";
import { api } from "@/lib/api";
import type { Piece } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, Btn } from "@/components/app/chrome";
import { useAgents, useWrite } from "./data";
import { Modal, Thumb } from "./ui";

function PieceList({ pieces }: { pieces: Piece[] }) {
  const total = pieces.reduce((a, p) => a + p.valuePaise, 0);
  return (
    <div className="overflow-hidden rounded-[10px] border border-line text-[13px]">
      <ul className="max-h-44 divide-y divide-line overflow-y-auto">
        {pieces.map((p) => (
          <li key={p.id} className="flex h-9 items-center gap-2 px-3">
            <Thumb src={p.imageUrl} alt={p.name} size={20} />
            <span className="num font-medium text-ink">{p.tagCode}</span>
            <span className="truncate text-ink-2">{p.name}</span>
            <span className="num ml-auto shrink-0 text-ink-3">{formatGrams(p.netWeightMg)}</span>
          </li>
        ))}
      </ul>
      <div className="flex h-9 items-center justify-between border-t border-line bg-sunken px-3"><span className="text-ink-2">{pieces.length} piece{pieces.length === 1 ? "" : "s"}</span><span className="num font-medium text-gold-ink">{formatINR(total)} today</span></div>
    </div>
  );
}

export function IssueDialog({ pieces, open, onOpenChange, onDone }: { pieces: Piece[]; open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void }) {
  const agents = useAgents();
  const [agentId, setAgentId] = React.useState("");
  React.useEffect(() => { if (open) setAgentId(""); }, [open]);
  const agent = agents.data?.find((a) => a.id === agentId);
  const issue = useWrite(() => api("/admin/pieces/issue", { body: { pieceIds: pieces.map((p) => p.id), agentId } }), {
    changes: ["piece.moved"], success: `${pieces.length} piece${pieces.length === 1 ? "" : "s"} issued to ${agent?.name ?? "agent"}`,
    onSuccess: () => { onOpenChange(false); onDone?.(); },
  });
  const active = (agents.data ?? []).filter((a) => a.active);
  return (
    <Modal
      open={open} onOpenChange={onOpenChange} width={500}
      title={`Issue ${pieces.length} piece${pieces.length === 1 ? "" : "s"} to an agent`}
      description="Custody moves from the vault to the agent's field bag and is written to each piece's ledger."
      footer={<><Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn><Btn variant="primary" disabled={!agentId || issue.isPending} onClick={() => issue.mutate(undefined)}>{issue.isPending ? "Issuing…" : agent ? `Issue to ${agent.name.split(" ")[0]}` : "Issue"}</Btn></>}
    >
      <PieceList pieces={pieces} />
      <p className="mb-1.5 mt-4 text-[13px] font-medium text-ink">Agent</p>
      {agents.isLoading ? <div className="h-24 animate-pulse rounded-[10px] bg-hover" /> : (
        <div role="radiogroup" aria-label="Agent" className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
          {active.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={agentId === a.id} onClick={() => setAgentId(a.id)}
              className={cn("flex h-10 w-full items-center gap-2.5 px-3 text-left text-[14px] transition-colors", agentId === a.id ? "bg-selected" : "hover:bg-hover")}>
              <span className={cn("grid size-4 place-items-center rounded-full border", agentId === a.id ? "border-blue bg-blue" : "border-line-strong")}>{agentId === a.id && <span className="size-1.5 rounded-full bg-white" />}</span>
              <Avatar name={a.name} />
              <span className="font-medium text-ink">{a.name}</span>
              <span className="num ml-auto text-[13px] text-ink-3">{a.bag.count} in bag · {formatINR(a.bag.valuePaise)}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function ReturnDialog({ pieces, open, onOpenChange, onDone }: { pieces: Piece[]; open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void }) {
  const holders = [...new Set(pieces.map((p) => p.custodian.agentName ?? "agent"))];
  const ret = useWrite(() => api("/admin/pieces/return-to-vault", { body: { pieceIds: pieces.map((p) => p.id) } }), {
    changes: ["piece.moved"], success: `${pieces.length} piece${pieces.length === 1 ? "" : "s"} back in the vault`,
    onSuccess: () => { onOpenChange(false); onDone?.(); },
  });
  return (
    <Modal
      open={open} onOpenChange={onOpenChange}
      title={`Return ${pieces.length} piece${pieces.length === 1 ? "" : "s"} to the vault?`}
      description={<>Confirm you have the pieces in hand. Custody moves from {holders.join(", ")} to the vault.</>}
      footer={<><Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn><Btn variant="primary" disabled={ret.isPending} onClick={() => ret.mutate(undefined)}>{ret.isPending ? "Returning…" : "Return to vault"}</Btn></>}
    >
      <PieceList pieces={pieces} />
    </Modal>
  );
}
