"use client";
/** Arrival-photo pipeline, split into resumable steps so a retry never re-encodes or duplicates:
 *  prepare (downscale + SHA-256, once) → upload bytes (progress) → attach to the visit (Idempotency-Key).
 *  The prepared JPEG, its checksum and the key are kept in sessionStorage, so even after a reload the
 *  retry sends the same bytes with the same key; the API also dedupes the same checksum per visit. */
import { put } from "@vercel/blob/client";
import { api, ApiError, newOpKey } from "@/lib/api";
import type { Proof, VisitSummary } from "@/lib/types";
import { session } from "./guard";

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export type UploadStage = "preparing" | "uploading" | "attaching";
export interface PendingProof {
  visitId: string;
  dataUrl: string;            // the prepared JPEG (what we upload, byte-for-byte)
  checksumSha256: string;
  sizeBytes: number;
  capturedAt: string;
  key: string;                // Idempotency-Key for POST /visits/:id/proofs
  fix?: { lat: number; lng: number; accuracyM: number } | null;
  uploaded?: { url: string; objectKey: string }; // bytes already stored; resume at attach
}

const storeKey = (visitId: string) => `jr:proof:${visitId}`;
export const pendingProof = {
  load: (visitId: string) => session.get<PendingProof>(storeKey(visitId)),
  save: (p: PendingProof) => session.set(storeKey(p.visitId), p),
  clear: (visitId: string) => session.del(storeKey(visitId)),
};

/** Downscale to max 1600px on the long edge, re-encode as JPEG. Strips EXIF as a side effect (the server never trusts it). */
async function toJpeg(file: Blob): Promise<Blob> {
  let source: CanvasImageSource; let w: number; let h: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    source = bmp; w = bmp.width; h = bmp.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("This file isn't a photo we can read. Try a JPG or PNG.")); i.src = url; });
      source = img; w = img.naturalWidth; h = img.naturalHeight;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process this photo.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't compress the photo."))), "image/jpeg", QUALITY));
}

async function sha256Hex(blob: Blob) {
  const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const dataUrlToBlob = async (u: string) => (await fetch(u)).blob();

export async function prepareProof(visitId: string, file: Blob, fix: PendingProof["fix"]): Promise<PendingProof> {
  const jpeg = await toJpeg(file);
  const p: PendingProof = {
    visitId, dataUrl: await blobToDataUrl(jpeg), checksumSha256: await sha256Hex(jpeg), sizeBytes: jpeg.size,
    capturedAt: new Date().toISOString(), key: newOpKey(), fix: fix ?? null,
  };
  pendingProof.save(p);
  return p;
}

type TokenRes = { mode: "blob" | "direct"; clientToken?: string; pathname: string; uploadUrl?: string };

/** XHR so we get real upload progress. One silent session refresh on 401. */
function xhrPost<T>(url: string, body: FormData, onProgress: (f: number) => void, retried = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.withCredentials = true;
    x.timeout = 90_000;
    x.setRequestHeader("Accept", "application/json");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON envelope
      let j: any = null; try { j = JSON.parse(x.responseText); } catch { /* not JSON */ }
      if (x.status === 401 && !retried) {
        api("/auth/me").then(() => xhrPost<T>(url, body, onProgress, true)).then(resolve, reject);
        return;
      }
      if (x.status >= 200 && x.status < 300 && j?.ok !== false) resolve((j?.data ?? j) as T);
      else reject(new ApiError(x.status, j?.error?.code ?? `HTTP_${x.status}`, j?.error?.message ?? "The photo didn't upload.", j?.error?.details, j?.requestId));
    };
    x.onerror = () => reject(new Error("network: the photo didn't upload"));
    x.ontimeout = () => reject(new Error("network: the upload timed out"));
    x.send(body);
  });
}

export async function uploadProofBytes(p: PendingProof, onProgress: (f: number) => void): Promise<PendingProof> {
  if (p.uploaded) return p;
  const jpeg = await dataUrlToBlob(p.dataUrl);
  const tok = await api<TokenRes>("/uploads/proof-token", { body: { visitId: p.visitId, contentType: "image/jpeg", sizeBytes: p.sizeBytes } });
  let uploaded: PendingProof["uploaded"];
  if (tok.mode === "blob" && tok.clientToken) {
    const r = await put(tok.pathname, jpeg, { access: "public", token: tok.clientToken, contentType: "image/jpeg", onUploadProgress: (e) => onProgress(e.percentage / 100) });
    uploaded = { url: r.url, objectKey: r.pathname };
  } else {
    const fd = new FormData();
    fd.append("file", new File([jpeg], "proof.jpg", { type: "image/jpeg" }));
    fd.append("pathname", tok.pathname);
    const r = await xhrPost<{ url: string; objectKey: string }>(tok.uploadUrl ?? "/api/v1/uploads/direct", fd, onProgress);
    uploaded = { url: r.url, objectKey: r.objectKey };
  }
  const next = { ...p, uploaded };
  pendingProof.save(next);
  return next;
}

export function attachProof(p: PendingProof) {
  if (!p.uploaded) throw new Error("Upload the photo first.");
  return api<{ proof: Proof; visit: VisitSummary }>(`/visits/${p.visitId}/proofs`, {
    idempotencyKey: p.key,
    body: {
      objectKey: p.uploaded.objectKey, url: p.uploaded.url, contentType: "image/jpeg", sizeBytes: p.sizeBytes,
      checksumSha256: p.checksumSha256, capturedAt: p.capturedAt,
      ...(p.fix ? { captureLat: p.fix.lat, captureLng: p.fix.lng } : {}),
    },
  });
}
