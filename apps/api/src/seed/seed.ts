/* JewelRoute demo seed — idempotent: wipes tenant `aurum` and recreates it.
 * Used by `prisma/seed.ts` (CLI) and `POST /v1/internal/seed` (Vercel, where port 5432 is unreachable from CI).
 * Needs APP_ENCRYPTION_KEY (same as the API, to encrypt the webhook secret) and API_PUBLIC_URL.
 */
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import { addDays, creditPosition, istDate, orderTotals, priceDesign, WEBHOOK_EVENT_TYPES, distanceM } from '@jewelroute/shared';
import { eventRefs } from '../core/event-refs';
import { Prisma, PrismaClient, Purity } from '../../generated/prisma';
import DESIGN_IMAGES from './design-images.json';

const SLUG = 'aurum';

export interface SeedOptions {
  apiPublicUrl: string;
  encryptionKeyB64: string;
}
export interface SeedSummary {
  tenant: string;
  ms: number;
  shops: number;
  designs: number;
  pieces: number;
  visits: number;
  orders: number;
  memos: number;
  rahulBag: number;
  rates: Record<string, number>;
  webhookEndpoint: string;
}

function encryptSecret(plain: string, keyB64: string) {
  const key = Buffer.from(keyB64 ?? '', 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes base64');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

const PLACEHOLDER = ['/catalog/1758995116383-f51775896add.jpg', '/catalog/1611107683227-e9060eccd846.jpg'];
const IMAGES: Record<string, string[]> = DESIGN_IMAGES as Record<string, string[]>;
let imgCursor: Record<string, number> = {};
function imagesFor(category: string, n = 2): string[] {
  const list = IMAGES[category]?.length ? IMAGES[category] : PLACEHOLDER;
  const out: string[] = [];
  for (let i = 0; i < Math.min(n, list.length); i++) {
    const c = imgCursor[category] ?? 0;
    out.push(list[c % list.length]);
    imgCursor[category] = c + 1;
  }
  return out;
}
const PROOF_IMAGES = IMAGES._proof?.length ? IMAGES._proof : PLACEHOLDER;

// ---------- time helpers (IST business days) ----------
let TODAY = istDate();
const dateOf = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
/** Instant for an IST wall-clock time on a business day, never in the future. */
const at = (ymd: string, hhmm: string) => {
  const t = new Date(`${ymd}T${hhmm}:00+05:30`);
  return t > new Date() ? new Date(Date.now() - 60_000) : t;
};
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000);
const fakeSha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Point `m` metres north-east of a coordinate (for realistic check-in offsets). */
const offset = (lat: number, lng: number, m: number) => ({ lat: lat + m / 111_320 / Math.SQRT2, lng: lng + m / (111_320 * Math.cos((lat * Math.PI) / 180)) / Math.SQRT2 });

async function wipe(prisma: PrismaClient) {
  const t = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!t) return;
  const tenantId = t.id;
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('jewelroute.allow_purge', 'on', true)`;
      await tx.webhookAttempt.deleteMany({ where: { delivery: { tenantId } } });
      await tx.webhookDelivery.deleteMany({ where: { tenantId } });
      await tx.receivedWebhook.deleteMany({ where: { tenantId } });
      await tx.outboxEvent.deleteMany({ where: { tenantId } });
      await tx.webhookEndpoint.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.idempotencyKey.deleteMany({ where: { tenantId } });
      await tx.storedFile.deleteMany({ where: { tenantId } });
      await tx.docSequence.deleteMany({ where: { tenantId } });
      await tx.memoExtension.deleteMany({ where: { tenantId } });
      await tx.memoItem.deleteMany({ where: { tenantId } });
      await tx.orderItem.deleteMany({ where: { tenantId } });
      await tx.order.deleteMany({ where: { tenantId } });
      await tx.memo.deleteMany({ where: { tenantId } });
      await tx.custodyEvent.deleteMany({ where: { tenantId } });
      await tx.visitProof.deleteMany({ where: { tenantId } });
      await tx.visitNote.deleteMany({ where: { tenantId } });
      await tx.visit.deleteMany({ where: { tenantId } });
      await tx.samplePiece.deleteMany({ where: { tenantId } });
      await tx.jewelryDesign.deleteMany({ where: { tenantId } });
      await tx.goldRate.deleteMany({ where: { tenantId } });
      await tx.shop.deleteMany({ where: { tenantId } });
      await tx.refreshToken.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    },
    { timeout: 60_000 },
  );
}

const SHOPS = [
  { code: 'DL-KB-001', name: 'Sharma Jewellers', ownerName: 'Rakesh Sharma', phone: '+91 98110 21456', address: '2654, Bank Street, Karol Bagh', area: 'Karol Bagh', lat: 28.6519, lng: 77.1907, creditLimitPaise: 2_500_000_00, openingOutstandingPaise: 80_000_000 },
  { code: 'DL-CC-002', name: 'Mehta Jewellers', ownerName: 'Suresh Mehta', phone: '+91 98100 33412', address: '1185, Dariba Kalan, Chandni Chowk', area: 'Chandni Chowk', lat: 28.6556, lng: 77.2316, creditLimitPaise: 4_000_000_00, openingOutstandingPaise: 120_000_000 },
  { code: 'DL-LN-003', name: 'Royal Gems', ownerName: 'Imran Qureshi', phone: '+91 98731 55120', address: 'G-14, Central Market, Lajpat Nagar II', area: 'Lajpat Nagar', lat: 28.5677, lng: 77.2433, creditLimitPaise: 1_800_000_00, openingOutstandingPaise: 20_000_000 },
  { code: 'DL-SX-004', name: 'Kapoor & Sons', ownerName: 'Vikram Kapoor', phone: '+91 98990 47781', address: 'E-12, South Extension Part II', area: 'South Extension', lat: 28.5684, lng: 77.2196, creditLimitPaise: 3_000_000_00, openingOutstandingPaise: 90_000_000 },
  { code: 'DL-RG-005', name: 'Gupta Gold House', ownerName: 'Anil Gupta', phone: '+91 98111 90034', address: 'J-2/14, Main Market, Rajouri Garden', area: 'Rajouri Garden', lat: 28.6448, lng: 77.1222, creditLimitPaise: 2_000_000_00, openingOutstandingPaise: 55_000_000 },
  { code: 'DL-CP-006', name: 'Malhotra Diamonds', ownerName: 'Neha Malhotra', phone: '+91 98186 11209', address: 'N-21, Inner Circle, Connaught Place', area: 'Connaught Place', lat: 28.6315, lng: 77.2167, creditLimitPaise: 5_000_000_00, openingOutstandingPaise: 180_000_000 },
  { code: 'DL-KN-007', name: 'Jain Ornaments', ownerName: 'Mahavir Jain', phone: '+91 98913 70452', address: '22-A, Kamla Nagar Market', area: 'Kamla Nagar', lat: 28.6814, lng: 77.2046, creditLimitPaise: 1_500_000_00, openingOutstandingPaise: 135_000_000 },
  { code: 'DL-JP-008', name: 'Bansal Jewellers', ownerName: 'Pooja Bansal', phone: '+91 98104 66231', address: 'C-1/17, District Centre, Janakpuri', area: 'Janakpuri', lat: 28.6289, lng: 77.0806, creditLimitPaise: 1_200_000_00, openingOutstandingPaise: 30_000_000 },
  { code: 'DL-GK-009', name: 'Sethi Jewellers', ownerName: 'Harpreet Sethi', phone: '+91 98715 28890', address: 'M-31, M-Block Market, Greater Kailash I', area: 'Greater Kailash', lat: 28.549, lng: 77.234, creditLimitPaise: 2_200_000_00, openingOutstandingPaise: 40_000_000 },
  { code: 'DL-PP-010', name: 'Batra Gold & Diamonds', ownerName: 'Rohit Batra', phone: '+91 98112 80917', address: 'Kohat Enclave Market, Pitampura', area: 'Pitampura', lat: 28.699, lng: 77.138, creditLimitPaise: 1_600_000_00, openingOutstandingPaise: 0 },
];

type D = { sku: string; name: string; category: string; collection: string; purity: Purity; gross: number; net: number; mType: 'PER_GRAM' | 'PERCENT'; mVal: number; stone: number; other?: { label: string; valuePaise: number }[]; desc: string; pieces: number };
const DESIGNS: D[] = [
  { sku: 'AJ-BNG-2201', name: 'Rajwada Kada', category: 'Bangles', collection: 'Rajwada', purity: 'K22', gross: 32_400, net: 31_800, mType: 'PER_GRAM', mVal: 650_00, stone: 0, desc: 'Hand-chased broad kada with temple motifs.', pieces: 4 },
  { sku: 'AJ-BNG-2202', name: 'Noor Filigree Bangle Pair', category: 'Bangles', collection: 'Noor', purity: 'K22', gross: 24_600, net: 24_100, mType: 'PER_GRAM', mVal: 720_00, stone: 0, desc: 'Pair of fine filigree bangles, Kolkata work.', pieces: 3 },
  { sku: 'AJ-BNG-1803', name: 'Everyday Luxe Slim Bangle', category: 'Bangles', collection: 'Everyday Luxe', purity: 'K18', gross: 9_800, net: 9_500, mType: 'PERCENT', mVal: 1200, stone: 1_850_00, desc: 'Slim 18K bangle with a line of CZ.', pieces: 3 },
  { sku: 'AJ-NCK-2211', name: 'Heritage Temple Necklace', category: 'Necklaces', collection: 'Heritage', purity: 'K22', gross: 48_500, net: 46_200, mType: 'PER_GRAM', mVal: 800_00, stone: 12_500_00, desc: 'Lakshmi coin temple necklace with ruby drops.', pieces: 3 },
  { sku: 'AJ-NCK-2212', name: 'Noor Kundan Choker', category: 'Necklaces', collection: 'Noor', purity: 'K22', gross: 38_200, net: 33_400, mType: 'PER_GRAM', mVal: 950_00, stone: 28_000_00, other: [{ label: 'Meenakari', valuePaise: 4_500_00 }], desc: 'Kundan choker with meenakari reverse.', pieces: 2 },
  { sku: 'AJ-NCK-1813', name: 'Everyday Luxe Chain', category: 'Necklaces', collection: 'Everyday Luxe', purity: 'K18', gross: 12_400, net: 12_400, mType: 'PERCENT', mVal: 1000, stone: 0, desc: 'Box chain, 20 inch.', pieces: 3 },
  { sku: 'AJ-RNG-2221', name: 'Rajwada Signet Ring', category: 'Rings', collection: 'Rajwada', purity: 'K22', gross: 8_600, net: 8_400, mType: 'PER_GRAM', mVal: 600_00, stone: 0, desc: "Men's signet with engraved crest.", pieces: 4 },
  { sku: 'AJ-RNG-1822', name: 'Everyday Luxe Solitaire', category: 'Rings', collection: 'Everyday Luxe', purity: 'K18', gross: 4_200, net: 3_900, mType: 'PERCENT', mVal: 1500, stone: 38_000_00, desc: '0.30 ct lab-grown solitaire, IGI certified.', pieces: 3 },
  { sku: 'AJ-RNG-2223', name: 'Noor Polki Cocktail Ring', category: 'Rings', collection: 'Noor', purity: 'K22', gross: 9_900, net: 8_700, mType: 'PER_GRAM', mVal: 900_00, stone: 9_500_00, desc: 'Uncut polki cocktail ring.', pieces: 2 },
  { sku: 'AJ-EAR-2231', name: 'Heritage Jhumka', category: 'Earrings', collection: 'Heritage', purity: 'K22', gross: 14_800, net: 14_200, mType: 'PER_GRAM', mVal: 750_00, stone: 1_200_00, desc: 'Classic bell jhumkas with pearl hangings.', pieces: 4 },
  { sku: 'AJ-EAR-1832', name: 'Everyday Luxe Huggies', category: 'Earrings', collection: 'Everyday Luxe', purity: 'K18', gross: 3_600, net: 3_500, mType: 'PERCENT', mVal: 1400, stone: 2_400_00, desc: 'Pavé huggie hoops.', pieces: 3 },
  { sku: 'AJ-EAR-2233', name: 'Rajwada Chandbali', category: 'Earrings', collection: 'Rajwada', purity: 'K22', gross: 18_900, net: 17_600, mType: 'PER_GRAM', mVal: 850_00, stone: 6_800_00, desc: 'Crescent chandbalis with emerald beads.', pieces: 2 },
  { sku: 'AJ-PND-2241', name: 'Heritage Ganesha Pendant', category: 'Pendants', collection: 'Heritage', purity: 'K22', gross: 6_200, net: 6_100, mType: 'PER_GRAM', mVal: 550_00, stone: 0, desc: 'Repoussé Ganesha pendant.', pieces: 3 },
  { sku: 'AJ-PND-1842', name: 'Noor Evil-Eye Pendant', category: 'Pendants', collection: 'Noor', purity: 'K18', gross: 2_900, net: 2_700, mType: 'PERCENT', mVal: 1600, stone: 1_600_00, desc: 'Enamel evil-eye with diamond halo.', pieces: 3 },
  { sku: 'AJ-BRD-2251', name: 'Rajwada Bridal Set', category: 'Bridal Sets', collection: 'Rajwada', purity: 'K22', gross: 142_000, net: 128_500, mType: 'PER_GRAM', mVal: 1100_00, stone: 65_000_00, other: [{ label: 'Maang tikka', valuePaise: 18_000_00 }], desc: 'Necklace, earrings and maang tikka — Rajasthani bridal.', pieces: 2 },
  { sku: 'AJ-BRD-2252', name: 'Heritage Polki Bridal Set', category: 'Bridal Sets', collection: 'Heritage', purity: 'K22', gross: 118_000, net: 101_200, mType: 'PER_GRAM', mVal: 1250_00, stone: 145_000_00, desc: 'Polki and kundan rani-haar set.', pieces: 2 },
];

// Base rates (paise/gram), Oct 2026 India: 24K ≈ ₹11,500; 22K = 0.916×; 18K = 0.75×.
const BASE: Record<'K24' | 'K22' | 'K18', number> = { K24: 11_500_00, K22: 10_540_00, K18: 8_630_00 };
// Day -9 … day 0 multipliers (gentle drift ending at the base rate).
const DRIFT = [0.982, 0.986, 0.984, 0.99, 0.993, 0.989, 0.994, 0.997, 0.995, 1.0];
const round = (p: number) => Math.round(p / 500) * 500; // nearest ₹5
const APPROVAL_THRESHOLD = 10_00_000_00; // ₹10L in paise

export async function runSeed(prisma: PrismaClient, opts: SeedOptions): Promise<SeedSummary> {
  const t0 = Date.now();
  TODAY = istDate();
  imgCursor = {};
  const API_PUBLIC_URL = opts.apiPublicUrl.replace(/\/$/, '');
  await wipe(prisma);
  // v3: orders at or above ₹10,00,000 need a manager's approval (ORDER_THRESHOLD).
  const tenant = await prisma.tenant.create({ data: { slug: SLUG, name: 'Aurum Jewels', demoMode: true, approvalThresholdPaise: BigInt(APPROVAL_THRESHOLD) } });
  const tenantId = tenant.id;

  const mkUser = async (name: string, email: string, password: string, role: 'ADMIN' | 'FIELD_AGENT', phone: string, homeArea?: string) =>
    prisma.user.create({ data: { tenantId, name, email, role, phone, homeArea, passwordHash: await bcrypt.hash(password, 10) } });
  const [admin, rahul, arjun, kavya] = await Promise.all([
    mkUser('Priya Mehta', 'admin@aurum.test', 'Aurum@2026', 'ADMIN', '+91 98100 00001'),
    mkUser('Rahul Verma', 'rahul@aurum.test', 'Rahul@2026', 'FIELD_AGENT', '+91 98100 11122', 'West Delhi'),
    mkUser('Arjun Singh', 'arjun@aurum.test', 'Arjun@2026', 'FIELD_AGENT', '+91 98100 33344', 'South Delhi'),
    mkUser('Kavya Nair', 'kavya@aurum.test', 'Kavya@2026', 'FIELD_AGENT', '+91 98100 55566', 'North Delhi'),
  ]);

  // Territory owner per shop (v2 `Shop.assignedAgentId`).
  const OWNER: Record<string, string> = {
    'Sharma Jewellers': rahul.id, 'Mehta Jewellers': rahul.id, 'Gupta Gold House': rahul.id, 'Bansal Jewellers': rahul.id, 'Malhotra Diamonds': rahul.id,
    'Royal Gems': arjun.id, 'Kapoor & Sons': arjun.id, 'Sethi Jewellers': arjun.id,
    'Jain Ornaments': kavya.id, 'Batra Gold & Diamonds': kavya.id,
  };
  const shopsCreatedAt = at(addDays(TODAY, -120), '11:00');
  const shops = await prisma.shop.createManyAndReturn({ data: SHOPS.map((s) => ({ ...s, tenantId, city: 'New Delhi', geofenceRadiusM: 100, creditLimitPaise: BigInt(s.creditLimitPaise), openingOutstandingPaise: BigInt(s.openingOutstandingPaise), assignedAgentId: OWNER[s.name] ?? null, createdAt: shopsCreatedAt })) });
  const shop = (name: string) => shops.find((s) => s.name === name)!;

  // ---- gold rates: 10 days of history, 10:00 IST each day ----
  const rateRows: { purity: Purity; ymd: string; id: string; rate: number; at: Date }[] = [];
  for (let i = 0; i < 10; i++) {
    const ymd = addDays(TODAY, i - 9);
    // Before 10:00 IST `at` clamps today's row to "now", after the morning's orders (≤95 min ago) — so the
    // rate an order was priced from would look set after it was booked. Keep today's row 2 h back instead.
    const when = i === 9 ? new Date(Math.min(at(ymd, '10:00').getTime(), Date.now() - 2 * 3600_000)) : at(ymd, '10:00');
    for (const pu of ['K24', 'K22', 'K18'] as const) rateRows.push({ purity: pu, ymd, id: `gr_${ulid()}`, rate: round(BASE[pu] * DRIFT[i]), at: when });
  }
  await prisma.goldRate.createMany({ data: rateRows.map((r) => ({ id: r.id, tenantId, purity: r.purity, ratePaisePerGram: BigInt(r.rate), effectiveFrom: r.at, createdAt: r.at, createdById: admin.id, source: 'MANUAL' })) });
  const rateOn = (pu: Purity, ymd: string) => rateRows.filter((r) => r.purity === pu && r.ymd <= ymd).pop()!;
  const todayRates = Object.fromEntries((['K24', 'K22', 'K18'] as const).map((p) => [p, rateOn(p, TODAY).rate])) as Record<string, number>;

  // ---- designs + pieces ----
  let tag = 120;
  const designRows = await prisma.jewelryDesign.createManyAndReturn({
    data: DESIGNS.map((d, i) => ({
      tenantId,
      sku: d.sku,
      name: d.name,
      category: d.category,
      collection: d.collection,
      purity: d.purity,
      grossWeightMg: d.gross,
      netWeightMg: d.net,
      makingChargeType: d.mType,
      makingChargeValue: BigInt(d.mVal),
      stoneValuePaise: BigInt(d.stone),
      otherComponents: d.other ?? [],
      imageUrls: imagesFor(d.category, d.category === 'Bridal Sets' || d.category === 'Necklaces' ? 2 : 1 + (i % 2)),
      description: d.desc,
      createdAt: at(addDays(TODAY, -30), '11:00'),
    })),
  });
  const designs = DESIGNS.map((def) => ({ ...designRows.find((r) => r.sku === def.sku)!, def }));
  const intakeAt = at(addDays(TODAY, -14), '11:00');
  const pieceData: Prisma.SamplePieceCreateManyInput[] = [];
  for (const d of designs) {
    for (let k = 0; k < d.def.pieces; k++) {
      tag++;
      const jitter = (k - 1) * Math.round(d.def.net * 0.004);
      pieceData.push({ id: `pc_${ulid()}`, tenantId, designId: d.id, tagCode: `AJ-S-${String(tag).padStart(6, '0')}`, grossWeightMg: d.def.gross + jitter, netWeightMg: d.def.net + jitter, custodianType: 'VAULT', custodySeq: 1, createdAt: intakeAt });
    }
  }
  const pieces = await prisma.samplePiece.createManyAndReturn({ data: pieceData });
  pieces.sort((a, b) => a.tagCode.localeCompare(b.tagCode));
  await prisma.custodyEvent.createMany({ data: pieces.map((p) => ({ tenantId, pieceId: p.id, seq: 1, toType: 'VAULT' as const, reason: 'INTAKE' as const, actorId: admin.id, occurredAt: intakeAt })) });
  await prisma.docSequence.create({ data: { tenantId, kind: 'TAG', year: 0, next: tag + 1 } });
  const designOf = (p: { designId: string }) => designs.find((d) => d.id === p.designId)!;
  const pieceValue = (p: { designId: string; netWeightMg: number }, ymd = TODAY) => {
    const d = designOf(p);
    return priceDesign({ netWeightMg: p.netWeightMg, ratePaisePerGram: rateOn(d.purity, ymd).rate, makingChargeType: d.makingChargeType, makingChargeValue: Number(d.makingChargeValue), stoneValuePaise: Number(d.stoneValuePaise), otherComponents: d.def.other }).unitPricePaise;
  };

  // ---- outbox helper: history is feed-visible but already fanned out (won't fire webhooks) ----
  const feed = async (type: string, aggregateType: string, aggregateId: string, createdAt: Date, actorId: string | null, data: Record<string, unknown>, id = `evt_${ulid(createdAt.getTime())}`) => {
    // Same refs helper as OutboxService.emit — seeded history is filterable exactly like live events.
    await prisma.outboxEvent.create({ data: { id, tenantId, type, aggregateType, aggregateId, actorId, createdAt, fannedOutAt: createdAt, payload: { id, type, tenantId: SLUG, createdAt: createdAt.toISOString(), data } as Prisma.InputJsonValue, ...eventRefs(aggregateType, aggregateId, data) } });
  };
  const ref = (u: { id: string; name: string }) => ({ id: u.id, name: u.name });

  // ---- custody: issue bags ----
  const custodySeq = new Map(pieces.map((p) => [p.id, 1]));
  const move = async (ps: Prisma.SamplePieceGetPayload<object>[], from: { type: 'VAULT' | 'AGENT' | 'SHOP'; agentId?: string; shopId?: string }, to: { type: 'VAULT' | 'AGENT' | 'SHOP' | 'SOLD'; agentId?: string; shopId?: string }, reason: 'ISSUE_TO_AGENT' | 'MEMO_HANDOVER' | 'MEMO_RETURN', when: Date, actor: { id: string; name: string }, memo?: { id: string; number: string; visitId?: string }, fromLabel = '', toLabel = '') => {
    for (const p of ps) custodySeq.set(p.id, custodySeq.get(p.id)! + 1);
    const eventId = `evt_${ulid(when.getTime())}`;
    await prisma.samplePiece.updateMany({ where: { id: { in: ps.map((p) => p.id) } }, data: { custodianType: to.type, custodianAgentId: to.agentId ?? null, custodianShopId: to.shopId ?? null, custodySeq: { increment: 1 } } });
    await prisma.custodyEvent.createMany({ data: ps.map((p) => ({ tenantId, pieceId: p.id, seq: custodySeq.get(p.id)!, fromType: from.type, fromAgentId: from.agentId, fromShopId: from.shopId, toType: to.type, toAgentId: to.agentId, toShopId: to.shopId, reason, memoId: memo?.id, visitId: memo?.visitId, actorId: actor.id, outboxEventId: eventId, occurredAt: when })) });
    await feed('sample.custody_changed', 'SamplePiece', ps[0].id, when, actor.id, { pieces: ps.map((p) => ({ id: p.id, tagCode: p.tagCode, seq: custodySeq.get(p.id) })), pieceCount: ps.length, from, to, fromLabel, toLabel, reason, memoId: memo?.id, memoNumber: memo?.number, visitId: memo?.visitId, actor: ref(actor) }, eventId);
  };
  // Distribute: Rahul 12 pieces, Arjun 7, Kavya 6 (first piece of most designs to Rahul so his bag covers the catalog).
  const byDesign = designs.map((d) => pieces.filter((p) => p.designId === d.id));
  // …plus AJ-S-000123 (the 3rd Rajwada Kada — a 22K Rajwada bangle), the sample of the brief's end-to-end scenario.
  const rahulBag = [...byDesign.flatMap((ps, i) => (i < 12 ? [ps[0]] : [])), pieces.find((p) => p.tagCode === 'AJ-S-000123')!];
  const arjunBag = byDesign.flatMap((ps, i) => (ps[1] && i % 2 === 0 ? [ps[1]] : [])).slice(0, 7);
  const kavyaBag = byDesign.flatMap((ps, i) => (ps[1] && i % 2 === 1 ? [ps[1]] : [])).slice(0, 6);
  const issueAt = at(addDays(TODAY, -12), '10:30');
  await move(rahulBag, { type: 'VAULT' }, { type: 'AGENT', agentId: rahul.id }, 'ISSUE_TO_AGENT', issueAt, admin, undefined, 'Vault', rahul.name);
  await move(arjunBag, { type: 'VAULT' }, { type: 'AGENT', agentId: arjun.id }, 'ISSUE_TO_AGENT', issueAt, admin, undefined, 'Vault', arjun.name);
  await move(kavyaBag, { type: 'VAULT' }, { type: 'AGENT', agentId: kavya.id }, 'ISSUE_TO_AGENT', issueAt, admin, undefined, 'Vault', kavya.name);

  // ---- visits ----
  let proofN = 0;
  const SLOTS = ['10:30', '12:00', '14:30', '16:30', '17:30'];
  const visit = async (agent: { id: string; name: string }, s: Prisma.ShopGetPayload<object>, ymd: string, sequence: number, state: 'PLANNED' | 'CHECKED_IN' | 'ACTIVE' | 'COMPLETED' | 'MISSED', times?: { in: Date; out?: Date; offM?: number; verification?: 'VERIFIED' | 'LOW_ACCURACY' | 'SIMULATED' }) => {
    const v = await prisma.visit.create({ data: { tenantId, agentId: agent.id, shopId: s.id, plannedDate: dateOf(ymd), plannedTime: SLOTS[sequence - 1] ?? null, sequence, status: 'PLANNED', assignedById: admin.id, createdAt: at(addDays(ymd, -1), '18:00') } });
    if (state === 'PLANNED' || state === 'MISSED' || !times) {
      if (state === 'MISSED') await prisma.visit.update({ where: { id: v.id }, data: { status: 'MISSED' } });
      return v;
    }
    const pt = offset(s.lat, s.lng, times.offM ?? 22);
    const dist = distanceM(pt.lat, pt.lng, s.lat, s.lng);
    const verification = times.verification ?? 'VERIFIED';
    await prisma.visit.update({ where: { id: v.id }, data: { status: state, checkInAt: times.in, checkInLat: pt.lat, checkInLng: pt.lng, checkInAccuracyM: verification === 'LOW_ACCURACY' ? 90 : verification === 'SIMULATED' ? null : 14, checkInDistanceM: dist, verification } });
    await feed('visit.checked_in', 'Visit', v.id, times.in, agent.id, { visitId: v.id, agent: ref(agent), shop: ref(s), checkInAt: times.in.toISOString(), lat: pt.lat, lng: pt.lng, distanceM: Math.round(dist), radiusM: 100, verification });
    if (state === 'CHECKED_IN') return v;
    const proofAt = new Date(times.in.getTime() + 3 * 60_000);
    const url = PROOF_IMAGES[proofN++ % PROOF_IMAGES.length];
    const proof = await prisma.visitProof.create({
      data: { tenantId, visitId: v.id, agentId: agent.id, shopId: s.id, objectKey: `tenants/${SLUG}/visits/${v.id}/${ulid()}.jpg`, url, contentType: 'image/jpeg', sizeBytes: 412_388 + proofN * 1013, checksumSha256: fakeSha(v.id), capturedAt: proofAt, uploadedAt: proofAt, captureLat: pt.lat, captureLng: pt.lng, checkInLat: pt.lat, checkInLng: pt.lng, distanceM: 0 },
    });
    await prisma.visit.update({ where: { id: v.id }, data: { startedAt: proofAt } });
    await feed('visit.proof_uploaded', 'Visit', v.id, proofAt, agent.id, { visitId: v.id, proofId: proof.id, agent: ref(agent), shop: ref(s), url });
    if (state === 'COMPLETED' && times.out) {
      await prisma.visit.update({ where: { id: v.id }, data: { completedAt: times.out, completedLat: pt.lat, completedLng: pt.lng, summary: 'Showed new Noor and Rajwada pieces; owner keen on bridal for the wedding season.' } });
      await feed('visit.completed', 'Visit', v.id, times.out, agent.id, { visitId: v.id, agent: ref(agent), shop: ref(s), completedAt: times.out.toISOString(), proofCount: 1 });
    }
    return v;
  };

  // ---- orders: status decided by the v3 credit rule (shared creditPosition), exactly like POST /orders ----
  // Exposure state the rule needs, kept as the seed writes history in time order.
  const unsettled = new Map<string, number>(); // shopId → Σ live (CONFIRMED/APPROVED, unsettled) orders
  const memoOut = new Map<string, number>(); // shopId → Σ OUT memo item value
  let ordN = 0;
  type Outcome = { expect: 'CONFIRMED' | 'PENDING_APPROVAL'; decide?: 'APPROVED' | 'REJECTED'; settleAt?: Date; reason?: string };
  const order = async (agent: { id: string; name: string }, s: Prisma.ShopGetPayload<object>, visitId: string, ymd: string, when: Date, lines: [string, number][], out: Outcome) => {
    const year = Number(ymd.slice(0, 4));
    const number = `ORD-${year}-${String(++ordN + 30).padStart(5, '0')}`;
    const priced = lines.map(([sku, qty]) => {
      const d = designs.find((x) => x.sku === sku)!;
      const r = rateOn(d.purity, ymd);
      const p = priceDesign({ netWeightMg: d.netWeightMg, ratePaisePerGram: r.rate, makingChargeType: d.makingChargeType, makingChargeValue: Number(d.makingChargeValue), stoneValuePaise: Number(d.stoneValuePaise), otherComponents: d.def.other });
      return { d, r, p, qty };
    });
    const t = orderTotals(priced.map((x) => x.p.unitPricePaise * x.qty));
    const position = creditPosition({
      creditLimitPaise: Number(s.creditLimitPaise),
      openingOutstandingPaise: Number(s.openingOutstandingPaise),
      unsettledOrdersPaise: unsettled.get(s.id) ?? 0,
      memoExposurePaise: memoOut.get(s.id) ?? 0,
      approvalThresholdPaise: APPROVAL_THRESHOLD,
      orderAmountPaise: t.totalPaise,
    });
    const initial = position.requiresApproval ? 'PENDING_APPROVAL' : 'CONFIRMED';
    // Guard the story: if prices or balances drift, fail the seed instead of silently changing the demo.
    if (initial !== out.expect) throw new Error(`seed: ${number} at ${s.name} would be ${initial} (${position.reasons.join(',') || 'no rule'}), expected ${out.expect}`);
    const status = out.decide ?? initial;
    const decidedAt = out.decide ? new Date(when.getTime() + 2 * 3600_000 > Date.now() ? Date.now() - 30_000 : when.getTime() + 2 * 3600_000) : null;
    const purities = [...new Set(priced.map((x) => x.d.purity))];
    const o = await prisma.order.create({
      data: {
        tenantId,
        number,
        shopId: s.id,
        agentId: agent.id,
        visitId,
        status,
        approvalRequired: position.requiresApproval,
        approvalReasons: position.reasons,
        creditSnapshot: { shopId: s.id, ...position, asOf: when.toISOString() } as unknown as Prisma.InputJsonValue,
        settledAt: out.settleAt ?? null,
        clientOpId: `seed-${ulid()}`,
        subtotalPaise: BigInt(t.subtotalPaise),
        gstPaise: BigInt(t.gstPaise),
        totalPaise: BigInt(t.totalPaise),
        goldRateSnapshot: purities.map((pu) => ({ purity: pu, goldRateId: rateOn(pu, ymd).id, ratePaisePerGram: rateOn(pu, ymd).rate, effectiveFrom: rateOn(pu, ymd).at.toISOString() })),
        decidedById: out.decide ? admin.id : null,
        decidedAt,
        rejectionReason: out.decide === 'REJECTED' ? (out.reason ?? 'Over the credit limit this month') : null,
        createdAt: when,
        items: {
          create: priced.map(({ d, r, p, qty }) => ({
            tenantId,
            designId: d.id,
            sku: d.sku,
            name: d.name,
            purity: d.purity,
            quantity: qty,
            netWeightMg: d.netWeightMg,
            goldRateId: r.id,
            ratePaisePerGram: BigInt(r.rate),
            goldValuePaise: BigInt(p.goldValuePaise),
            makingPaise: BigInt(p.makingPaise),
            stonePaise: BigInt(p.stonePaise),
            otherPaise: BigInt(p.otherPaise),
            unitPricePaise: BigInt(p.unitPricePaise),
            lineTotalPaise: BigInt(p.unitPricePaise * qty),
          })),
        },
      },
    });
    if ((status === 'CONFIRMED' || status === 'APPROVED') && !out.settleAt) unsettled.set(s.id, (unsettled.get(s.id) ?? 0) + t.totalPaise);
    const base = { orderId: o.id, number, agent: ref(agent), shop: ref(s), visitId, totalPaise: t.totalPaise };
    await prisma.auditLog.create({ data: { tenantId, actorId: agent.id, action: 'order.create', entityType: 'Order', entityId: o.id, after: { number, status: initial, approvalReasons: position.reasons, visitId, totalPaise: t.totalPaise }, createdAt: when } });
    await feed('order.created', 'Order', o.id, when, agent.id, { ...base, status: initial, approval: { required: position.requiresApproval, reasons: position.reasons } });
    await feed(initial === 'CONFIRMED' ? 'order.confirmed' : 'order.pending_approval', 'Order', o.id, new Date(when.getTime() + 1), agent.id, { ...base, status: initial, reasons: position.reasons, credit: position });
    if (out.decide) {
      await prisma.auditLog.create({ data: { tenantId, actorId: admin.id, action: out.decide === 'APPROVED' ? 'order.approve' : 'order.reject', entityType: 'Order', entityId: o.id, before: { status: initial }, after: { status: out.decide, reason: out.decide === 'REJECTED' ? o.rejectionReason : undefined }, createdAt: decidedAt! } });
      await feed(out.decide === 'APPROVED' ? 'order.approved' : 'order.rejected', 'Order', o.id, decidedAt!, admin.id, { ...base, agentRef: ref(agent), actor: ref(admin), status: out.decide, reasons: position.reasons, rejectionReason: o.rejectionReason ?? undefined });
    }
    if (out.settleAt) {
      await prisma.auditLog.create({ data: { tenantId, actorId: admin.id, action: 'order.settle', entityType: 'Order', entityId: o.id, before: { status, settledAt: null }, after: { status, settledAt: out.settleAt.toISOString(), totalPaise: t.totalPaise }, createdAt: out.settleAt } });
      await feed('order.settled', 'Order', o.id, out.settleAt, admin.id, { ...base, status, settledAt: out.settleAt.toISOString(), actor: ref(admin) });
    }
    return o;
  };

  // ---- memos ----
  let memoN = 0;
  const memo = async (agent: { id: string; name: string }, s: Prisma.ShopGetPayload<object>, visitId: string, ymd: string, when: Date, ps: Prisma.SamplePieceGetPayload<object>[], dueYmd: string) => {
    const number = `MEMO-${ymd.slice(0, 4)}-${String(++memoN + 10).padStart(5, '0')}`;
    const values = ps.map((p) => pieceValue(p, ymd));
    const total = values.reduce((a, b) => a + b, 0);
    const m = await prisma.memo.create({
      data: { tenantId, number, shopId: s.id, agentId: agent.id, visitId, clientOpId: `seed-${ulid()}`, dueDate: dateOf(dueYmd), totalValuePaise: BigInt(total), ackStatus: 'ACKNOWLEDGED', ackAt: new Date(when.getTime() + 4 * 60_000), ackMethod: 'QR_CONFIRM', createdAt: when },
    });
    await prisma.memoItem.createMany({ data: ps.map((p, i) => ({ tenantId, memoId: m.id, pieceId: p.id, valuePaise: BigInt(values[i]), status: 'OUT' as const, createdAt: when })) });
    await move(ps, { type: 'AGENT', agentId: agent.id }, { type: 'SHOP', shopId: s.id }, 'MEMO_HANDOVER', when, agent, { id: m.id, number, visitId }, agent.name, s.name);
    memoOut.set(s.id, (memoOut.get(s.id) ?? 0) + total);
    const pieceRefs = ps.map((p) => ({ id: p.id, tagCode: p.tagCode }));
    await feed('memo.created', 'Memo', m.id, when, agent.id, { memoId: m.id, number, visitId, agent: ref(agent), shop: ref(s), dueDate: dueYmd, pieceCount: ps.length, totalValuePaise: total, pieces: pieceRefs });
    await feed('memo.acknowledged', 'Memo', m.id, m.ackAt!, null, { memoId: m.id, number, method: 'QR_CONFIRM', ackAt: m.ackAt!.toISOString(), by: 'retailer', visitId, agent: ref(agent), shop: ref(s), pieceCount: ps.length, totalValuePaise: total, pieces: pieceRefs });
    await prisma.auditLog.create({ data: { tenantId, actorId: agent.id, action: 'memo.create', entityType: 'Memo', entityId: m.id, after: { number, shopId: s.id, visitId, dueDate: dueYmd, pieceIds: ps.map((p) => p.id), totalValuePaise: total }, createdAt: when } });
    return m;
  };

  // History (past 9 days): Rahul / Arjun / Kavya visits with proofs, orders and two open memos.
  const d9 = addDays(TODAY, -9);
  const d6 = addDays(TODAY, -6);
  const d4 = addDays(TODAY, -4);
  const d1 = addDays(TODAY, -1);
  const v1 = await visit(rahul, shop('Mehta Jewellers'), d9, 1, 'COMPLETED', { in: at(d9, '11:05'), out: at(d9, '12:10') });
  // ≥ ₹10L → pending (ORDER_THRESHOLD) → Priya approved it; paid 3 days later.
  await order(rahul, shop('Mehta Jewellers'), v1.id, d9, at(d9, '11:40'), [['AJ-BNG-2201', 2], ['AJ-EAR-2231', 3]], { expect: 'PENDING_APPROVAL', decide: 'APPROVED', settleAt: at(addDays(TODAY, -6), '16:00') });
  // OVERDUE memo at Mehta (due 2 days ago)
  await memo(rahul, shop('Mehta Jewellers'), v1.id, d9, at(d9, '11:55'), [rahulBag[3], rahulBag[9]], addDays(TODAY, -2));

  const v2 = await visit(arjun, shop('Royal Gems'), d6, 1, 'COMPLETED', { in: at(d6, '12:20'), out: at(d6, '13:05') });
  await order(arjun, shop('Royal Gems'), v2.id, d6, at(d6, '12:50'), [['AJ-NCK-1813', 4], ['AJ-RNG-1822', 2]], { expect: 'CONFIRMED', settleAt: at(addDays(TODAY, -2), '15:30') });
  const v3 = await visit(kavya, shop('Jain Ornaments'), d4, 1, 'COMPLETED', { in: at(d4, '15:10'), out: at(d4, '15:55'), offM: 61, verification: 'LOW_ACCURACY' });
  // Jain is near its limit (₹13.5L of ₹15L outstanding) → CREDIT_LIMIT → rejected.
  await order(kavya, shop('Jain Ornaments'), v3.id, d4, at(d4, '15:40'), [['AJ-PND-2241', 6]], { expect: 'PENDING_APPROVAL', decide: 'REJECTED', reason: 'Over the credit limit this month — clear the old balance first' });
  const v4 = await visit(arjun, shop('Kapoor & Sons'), d1, 1, 'COMPLETED', { in: at(d1, '11:30'), out: at(d1, '12:25') });
  // DUE_SOON memo at Kapoor & Sons (due tomorrow)
  await memo(arjun, shop('Kapoor & Sons'), v4.id, d1, at(d1, '12:05'), [arjunBag[0], arjunBag[2]], addDays(TODAY, 1));
  const v5 = await visit(rahul, shop('Gupta Gold House'), d1, 1, 'COMPLETED', { in: at(d1, '11:15'), out: at(d1, '12:00') });
  await order(rahul, shop('Gupta Gold House'), v5.id, d1, at(d1, '11:45'), [['AJ-RNG-2221', 5], ['AJ-BNG-2202', 1]], { expect: 'CONFIRMED' });
  const v6 = await visit(rahul, shop('Bansal Jewellers'), d1, 2, 'COMPLETED', { in: at(d1, '14:20'), out: at(d1, '15:05') });
  await order(rahul, shop('Bansal Jewellers'), v6.id, d1, at(d1, '14:50'), [['AJ-EAR-1832', 6], ['AJ-PND-1842', 4]], { expect: 'CONFIRMED' });
  await visit(kavya, shop('Batra Gold & Diamonds'), d1, 1, 'MISSED');

  // Today: Rahul has 4 PLANNED visits, Sharma Jewellers first.
  await visit(rahul, shop('Sharma Jewellers'), TODAY, 1, 'PLANNED');
  await visit(rahul, shop('Gupta Gold House'), TODAY, 2, 'PLANNED');
  await visit(rahul, shop('Bansal Jewellers'), TODAY, 3, 'PLANNED');
  await visit(rahul, shop('Malhotra Diamonds'), TODAY, 4, 'PLANNED');
  // Arjun: a normal order confirmed directly at Sethi; now at Royal Gems with a bridal set above the
  // ₹10L approval threshold (ORDER_THRESHOLD only — Royal Gems has room on its limit).
  const a1 = await visit(arjun, shop('Sethi Jewellers'), TODAY, 1, 'COMPLETED', { in: minsAgo(95), out: minsAgo(50) });
  await order(arjun, shop('Sethi Jewellers'), a1.id, TODAY, minsAgo(70), [['AJ-NCK-2211', 1], ['AJ-RNG-2223', 2]], { expect: 'CONFIRMED' });
  const a2 = await visit(arjun, shop('Royal Gems'), TODAY, 2, 'ACTIVE', { in: minsAgo(30), offM: 18 });
  await order(arjun, shop('Royal Gems'), a2.id, TODAY, minsAgo(18), [['AJ-BRD-2252', 1]], { expect: 'PENDING_APPROVAL' });
  await visit(arjun, shop('Kapoor & Sons'), TODAY, 3, 'PLANNED');
  // Kavya: one in progress (proof uploaded), two planned.
  // Simulated GPS (demo mode) at the shop's own coordinates — shows the PROOF_SIMULATED state end to end.
  const k1 = await visit(kavya, shop('Jain Ornaments'), TODAY, 1, 'ACTIVE', { in: minsAgo(25), offM: 0, verification: 'SIMULATED' });
  // Jain is still near its limit: a modest pendant order trips CREDIT_LIMIT (not the threshold).
  await order(kavya, shop('Jain Ornaments'), k1.id, TODAY, minsAgo(15), [['AJ-PND-2241', 4]], { expect: 'PENDING_APPROVAL' });
  await visit(kavya, shop('Batra Gold & Diamonds'), TODAY, 2, 'PLANNED');
  await visit(kavya, shop('Mehta Jewellers'), TODAY, 3, 'PLANNED');

  await prisma.docSequence.createMany({
    data: [
      { tenantId, kind: 'ORD', year: Number(TODAY.slice(0, 4)), next: ordN + 31 },
      { tenantId, kind: 'MEMO', year: Number(TODAY.slice(0, 4)), next: memoN + 11 },
    ],
  });

  // Gold-rate audit trail for the history.
  await prisma.auditLog.createMany({ data: rateRows.filter((x) => x.purity === 'K22').map((r) => ({ tenantId, actorId: admin.id, action: 'gold_rate.set', entityType: 'GoldRate', entityId: r.id, after: { purity: 'K22', ratePaisePerGram: r.rate }, createdAt: r.at })) });

  // ---- webhook endpoint → built-in demo receiver ----
  const token = `demo-${randomBytes(6).toString('hex')}`;
  const secret = `whsec_${randomBytes(32).toString('base64url')}`;
  const ep = await prisma.webhookEndpoint.create({
    data: { tenantId, url: `${API_PUBLIC_URL}/v1/dev/webhook-receiver/${token}`, description: 'Built-in demo receiver (verifies signatures)', events: [...WEBHOOK_EVENT_TYPES], secretEncrypted: encryptSecret(secret, opts.encryptionKeyB64), secretLast4: secret.slice(-4) },
  });
  await prisma.auditLog.create({ data: { tenantId, actorId: admin.id, action: 'webhook.create', entityType: 'WebhookEndpoint', entityId: ep.id, after: { url: ep.url, events: ep.events } } });

  const [visitCount, orderCount, memoCount] = await Promise.all([prisma.visit.count({ where: { tenantId } }), prisma.order.count({ where: { tenantId } }), prisma.memo.count({ where: { tenantId } })]);
  return {
    tenant: SLUG,
    ms: Date.now() - t0,
    shops: shops.length,
    designs: designs.length,
    pieces: pieces.length,
    visits: visitCount,
    orders: orderCount,
    memos: memoCount,
    rahulBag: rahulBag.length - 2,
    rates: todayRates,
    webhookEndpoint: ep.url,
  };
}
