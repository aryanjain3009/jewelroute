"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { formatGrams, formatINRCompact } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { api, ApiError } from "@/lib/api";
import type { Memo } from "@/lib/types";
import { useSync } from "@/lib/sync";
import { Thumb } from "../bits";
import { fmtTime, fmtWeekday, plural } from "../format";
import { errorMessage, useVisit } from "../queries";
import { useGuard } from "../guard";
import type { AckLink } from "../types";

/** Retailer acknowledgement (QR to their own phone, or the 6-digit code read back), then the custody
 *  confirmation. Custody already moved when the memo was created; this records the retailer's receipt.
 *  Polls the visit every 3 s until the server says ACKNOWLEDGED. */
export function MemoAck({ visitId, memo: initial, ack, embedded, onLeave }: { visitId: string; memo: Memo; ack: AckLink; embedded?: boolean; onLeave?: () => void }) {
  const sync = useSync();
  const [memo, setMemo] = useState(initial);
  const [code, setCode] = useState("");
  const [run, verifying] = useGuard();
  const acked = memo.ackStatus === "ACKNOWLEDGED";
  const v = useVisit(visitId, { refetchInterval: acked ? false : 3000 });

  useEffect(() => {
    const m = v.data?.memosCreated.find((x) => x.id === memo.id);
    if (!m) return;
    if (m.ackStatus === "ACKNOWLEDGED" && !acked) sync("memo.acknowledged");
    setMemo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.data]);

  const verify = (c: string) => run(async () => {
    try {
      const res = await api<{ memo: Memo }>(`/memos/${memo.id}/ack/verify`, { body: { code: c } });
      setMemo(res.memo); sync("memo.acknowledged");
    } catch (e) {
      setCode("");
      if (e instanceof ApiError && e.code === "ACK_LOCKED") toast.error("Too many wrong codes. Ask the retailer to tap Confirm receipt on their phone.");
      else if (e instanceof ApiError && e.status < 500) toast.error("That code doesn't match. Ask the retailer to read it again.");
      else toast.error(errorMessage(e));
    }
  });

  const pieces = memo.items.filter((i) => i.status === "OUT");
  const custody = (
    <div className="mt-5 w-full rounded-xl border border-line text-left">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-[15px] text-ink"><span className="num font-semibold">{plural(pieces.length || memo.items.length, "piece")}</span> · <span className="num font-semibold text-gold-ink">{formatINRCompact(memo.totalValuePaise)}</span> now with {memo.shop.name}</p>
      </div>
      <ul>
        {(pieces.length ? pieces : memo.items).map((i) => (
          <li key={i.id} className="flex items-center gap-2.5 border-b border-line px-4 py-2 text-[13px] last:border-b-0">
            <Thumb src={i.piece.imageUrl} size={28} className="rounded-md" />
            <span className="num font-medium text-ink">{i.piece.tagCode}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{i.piece.name}</span>
            <span className="num text-ink-3">{formatGrams(i.piece.netWeightMg)}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3"><span className="num">{memo.number}</span>, due back {fmtWeekday(memo.dueDate)}</p>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-4 text-center">
      {acked ? (
        <>
          <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 20 }}
            className="grid size-14 place-items-center rounded-full bg-verified text-white"><Check className="size-7" strokeWidth={2.5} /></motion.span>
          <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.01em] text-ink">Custody confirmed</h2>
          <p className="mt-1 text-[14px] text-ink-2">{memo.shop.name} acknowledged at <span className="num">{fmtTime(memo.ackAt)}</span>, {memo.ackMethod === "OTP" ? "code verified by you" : "confirmed on their phone"}.</p>
          {custody}
        </>
      ) : (
        <>
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Ask the retailer to scan and confirm</h2>
          <p className="mt-1 text-[14px] text-ink-2">They see the exact pieces on their phone and tap Confirm receipt.</p>
          <div className="mt-5 rounded-xl border border-line bg-white p-4">
            <QRCodeSVG value={ack.url} size={200} level="M" fgColor="#1c1d1f" bgColor="#ffffff" marginSize={0} title="Memo acknowledgement link" />
          </div>
          <p className="mt-3 flex items-center justify-center gap-2 text-[13px] text-ink-3" aria-live="polite"><Loader2 className="size-3.5 animate-spin" />Waiting for the retailer</p>
          <div className="mt-1 flex items-center justify-center gap-1">
            <Button variant="ghost" size="sm" className="h-9 text-ink-2" onClick={() => navigator.clipboard?.writeText(ack.url).then(() => toast.success("Link copied"), () => {})}><Copy />Copy link</Button>
            <Button variant="ghost" size="sm" className="h-9 text-ink-2" asChild><a href={ack.url} target="_blank" rel="noreferrer"><ExternalLink />Retailer page</a></Button>
          </div>
          <div className="mt-5 flex w-full items-center gap-3"><span className="h-px flex-1 bg-line" /><span className="text-[13px] text-ink-3">or type the code they read out</span><span className="h-px flex-1 bg-line" /></div>
          <div className="mt-3 flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={verify} disabled={verifying} inputMode="numeric" pattern="^[0-9]*$" aria-label="Retailer code">
              <InputOTPGroup className="gap-1.5">
                {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="num h-12 w-11 rounded-lg border border-line-strong text-[18px] font-semibold first:rounded-lg last:rounded-lg" />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          {verifying && <p className="mt-2 text-[13px] text-ink-3">Checking code</p>}
          {custody}
        </>
      )}
      {!embedded && (
        <div className="mt-6 grid w-full gap-2">
          <Button asChild className="h-12 text-[15px]" variant={acked ? "default" : "outline"}>
            <Link href={`/field/visits/${visitId}`} onClick={onLeave}>{acked ? "Back to visit" : "Skip for now, back to visit"}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
