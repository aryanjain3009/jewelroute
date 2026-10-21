"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, Check, ImageUp, Loader2, MapPin, RotateCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { VerificationPill } from "@/components/jr/status";
import { ApiError } from "@/lib/api";
import type { Proof, Verification } from "@/lib/types";
import { useSync } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { errorMessage } from "./queries";
import { fmtDay, fmtDistance, fmtTime, mediaUrl } from "./format";
import { attachProof, pendingProof, prepareProof, uploadProofBytes, type PendingProof, type UploadStage } from "./proof-upload";
import { useFieldGeo } from "./use-field-geo";
import { useGuard } from "./guard";
import { BottomBar, BottomSpacer } from "./top-bar";

type Status = { k: "idle" } | { k: "working"; stage: UploadStage; pct: number } | { k: "failed"; message: string };

/** Required arrival photo: take or pick, see it, watch it upload, retry the same bytes on failure. */
export function ProofCapture({ visitId, existingChecksums }: { visitId: string; existingChecksums: string[] }) {
  const sync = useSync();
  const geo = useFieldGeo(true);
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingProof | null>(null);
  const [status, setStatus] = useState<Status>({ k: "idle" });
  const [run, busy] = useGuard();

  // A photo that was prepared before a reload but never attached comes back as "failed — retry".
  useEffect(() => {
    const p = pendingProof.load(visitId);
    if (!p) return;
    if (existingChecksums.includes(p.checksumSha256)) { pendingProof.clear(visitId); return; }
    setPending(p);
    setStatus({ k: "failed", message: "This photo wasn't attached before the page reloaded." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  async function send(p: PendingProof) {
    let cur = p;
    try {
      setStatus({ k: "working", stage: "uploading", pct: cur.uploaded ? 100 : 0 });
      cur = await uploadProofBytes(cur, (f) => setStatus({ k: "working", stage: "uploading", pct: Math.round(f * 100) }));
      setPending(cur);
      setStatus({ k: "working", stage: "attaching", pct: 100 });
      await attachProof(cur);
      pendingProof.clear(visitId);
      sync("visit.proof_uploaded");
      toast.success("Arrival photo attached");
    } catch (e) {
      // The stored object was rejected: drop it so the retry re-uploads the same bytes.
      if (e instanceof ApiError && ["INVALID_OBJECT_KEY", "OBJECT_NOT_FOUND", "CHECKSUM_MISMATCH", "INVALID_URL"].includes(e.code)) {
        cur = { ...cur, uploaded: undefined }; pendingProof.save(cur); setPending(cur);
      }
      if (e instanceof ApiError && e.code === "VISIT_NOT_OPEN") { pendingProof.clear(visitId); sync("visit.proof_uploaded"); }
      setStatus({ k: "failed", message: errorMessage(e, "The photo didn't upload.") });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Choose a photo (JPG, PNG or HEIC)."); return; }
    await run(async () => {
      setStatus({ k: "working", stage: "preparing", pct: 0 });
      let p: PendingProof;
      try {
        const fix = geo.fix ? { lat: geo.fix.lat, lng: geo.fix.lng, accuracyM: Math.round(geo.fix.accuracyM) } : null;
        p = await prepareProof(visitId, f, fix);
      } catch (err) { setStatus({ k: "failed", message: errorMessage(err, "Couldn't read this photo.") }); return; }
      setPending(p);
      await send(p);
    });
  }

  const retry = () => { if (pending) void run(() => send(pending)); };
  const working = status.k === "working";

  return (
    <section aria-label="Arrival photo">
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} data-testid="proof-camera" tabIndex={-1} />
      <input ref={pick} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="proof-file" tabIndex={-1} />

      {!pending ? (
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center">
          <Camera className="mx-auto size-6 text-ink-3" strokeWidth={1.6} />
          <p className="mt-2 text-[15px] font-medium text-ink">Take or upload the arrival photo</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-2">Shop front or counter. It is stamped with the time and your position, and shown to your manager.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="relative bg-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.dataUrl} alt="Arrival photo" className="aspect-[4/3] w-full object-cover" />
            {working && <div className="absolute inset-0 bg-paper/30" />}
          </div>
          {status.k === "failed" && <p role="alert" className="border-b border-line bg-danger-soft px-4 py-2.5 text-[13px] text-danger">{status.message} Your photo is kept; Retry sends the same file.</p>}
          <dl className="divide-y divide-line text-[14px]">
            <Row label="Taken"><span className="num">{fmtTime(pending.capturedAt)}</span></Row>
            <Row label="Position">{pending.fix ? <span className="num">Attached, ±{pending.fix.accuracyM} m</span> : <span className="text-ink-3">No GPS fix, time only</span>}</Row>
            <Row label="Upload">
              {status.k === "working" ? (
                <span className="flex items-center gap-2" aria-live="polite">
                  <span className="relative h-1 w-20 overflow-hidden rounded-full bg-sunken"><span className="absolute inset-y-0 left-0 bg-ink transition-[width]" style={{ width: `${status.stage === "preparing" ? 8 : status.pct}%` }} /></span>
                  <span className="num text-ink-2">{status.stage === "preparing" ? "Compressing" : status.stage === "uploading" ? `${status.pct}%` : "Attaching"}</span>
                </span>
              ) : status.k === "failed" ? (
                <span className="flex items-center gap-1.5 text-danger"><AlertCircle className="size-4" />Failed</span>
              ) : <span className="text-ink-3">Waiting</span>}
            </Row>
          </dl>
        </div>
      )}

      <BottomSpacer h={status.k === "failed" ? 170 : 120} />
      <BottomBar>
        {status.k === "failed" && pending ? (
          <div className="grid gap-2">
            <Button className="h-12 text-[15px]" disabled={busy} onClick={retry}><RotateCw />Retry upload</Button>
            <Button variant="ghost" className="h-10 text-[14px] text-ink-2" disabled={busy} onClick={() => pick.current?.click()}>Use a different photo</Button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button className="h-12 text-[15px]" disabled={busy || working} onClick={() => cam.current?.click()}>
              {working ? <Loader2 className="animate-spin" /> : <Camera />}{working ? "Uploading photo" : "Take arrival photo"}
            </Button>
            <Button variant="outline" className="h-12 px-4 text-[15px]" disabled={busy || working} onClick={() => pick.current?.click()} aria-label="Upload a photo"><ImageUp />Upload</Button>
          </div>
        )}
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-ink-3">
          <MapPin className="size-3.5" />{geo.fix ? <>Position attached to the photo <span className="num">(±{Math.round(geo.fix.accuracyM)} m)</span></> : "Position is attached when available"}
        </p>
      </BottomBar>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex min-h-11 items-center justify-between gap-3 px-4"><dt className="text-ink-2">{label}</dt><dd className="text-ink">{children}</dd></div>;
}

/** Compact proof line for the workspace; tap opens the full evidence. */
export function ProofSummary({ proof, shopName, verification, checkInDistanceM }: { proof: Proof; shopName: string; verification?: Verification; checkInDistanceM?: number }) {
  const [open, setOpen] = useState(false);
  const at = proof.capturedAt ?? proof.uploadedAt;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(proof.url)} alt="" className="size-14 shrink-0 rounded-lg bg-sunken object-cover" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-medium text-ink"><Check className="size-4 text-verified" strokeWidth={2.5} />Arrival photo</span>
          <span className="mt-0.5 block text-[13px] text-ink-2"><span className="num">{fmtTime(at)}</span>{verification === "SIMULATED" ? ", simulated arrival" : checkInDistanceM !== undefined ? <>, GPS verified <span className="num">{fmtDistance(checkInDistanceM)}</span></> : null}</span>
          <span className="mt-0.5 block text-[12px] text-ink-3">Uploaded, SHA-256 <span className="num">{proof.checksumSha256.slice(0, 8)}</span></span>
        </span>
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto max-w-[520px] data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
          <DrawerTitle className="sr-only">Arrival photo at {shopName}</DrawerTitle>
          <div className="overflow-y-auto px-4 pb-6 pt-3"><ProofCard proof={proof} shopName={shopName} verification={verification} checkInDistanceM={checkInDistanceM} /></div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** The uploaded proof as evidence: photo, time, shop, verification, checksum. */
export function ProofCard({ proof, shopName, verification, checkInDistanceM, className }: {
  proof: Proof; shopName: string; verification?: Verification; checkInDistanceM?: number; className?: string;
}) {
  const at = proof.capturedAt ?? proof.uploadedAt;
  return (
    <figure className={cn("overflow-hidden rounded-xl border border-line", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(proof.url)} alt={`Arrival photo at ${shopName}`} className="aspect-[4/3] w-full bg-sunken object-cover" loading="lazy" />
      <figcaption className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-ink">{shopName}</p>
            <p className="num mt-0.5 text-[13px] text-ink-2">{fmtTime(at)}, {fmtDay(at)}</p>
          </div>
          {verification && <VerificationPill v={verification} />}
        </div>
        <ul className="space-y-1.5 text-[13px] text-ink-2">
          {verification === "SIMULATED" ? (
            <li className="flex items-center gap-2"><MapPin className="size-3.5 text-info" />Arrival simulated for the demo, not a real GPS fix</li>
          ) : checkInDistanceM !== undefined ? (
            <li className="flex items-center gap-2"><MapPin className="size-3.5 text-verified" />Checked in <span className="num">{fmtDistance(checkInDistanceM)}</span> from the shop</li>
          ) : null}
          {proof.distanceM !== undefined && proof.distanceM !== null && (
            <li className="flex items-center gap-2"><Camera className="size-3.5 text-ink-3" />Taken <span className="num">{fmtDistance(proof.distanceM)}</span> from the check-in point</li>
          )}
          <li className="flex items-center gap-2" title={proof.checksumSha256}>
            <ShieldCheck className="size-3.5 text-ink-3" />SHA-256 <span className="num text-[12px] text-ink-3">{proof.checksumSha256.slice(0, 8)}…{proof.checksumSha256.slice(-6)}</span>
          </li>
        </ul>
      </figcaption>
    </figure>
  );
}
