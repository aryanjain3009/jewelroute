/* Hot-path EXPLAIN (BACKLOG #20). Local scratch databases only — never a shared or hosted one.
 *
 *   # 1. a volume tenant (direct inserts that satisfy every CHECK/trigger; rows look like the API's)
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/jewelroute_explain \
 *     pnpm --filter @jewelroute/api exec tsx scripts/explain-hot.ts seed vol-large 50 500 2000
 *   # 2. boot dist/main.js on that DB with auto_explain on, call the four admin hot paths, and print per
 *   #    request: statement count, summed statement time and the slowest plans (EXPLAIN ANALYZE, BUFFERS)
 *   DATABASE_URL=… pnpm --filter @jewelroute/api exec tsx scripts/explain-hot.ts measure vol-large /opt/homebrew/var/log/postgresql@16.log
 *
 * `measure` sets auto_explain for that database only (ALTER DATABASE … SET, superuser) and resets it at the end.
 * Statements are attributed to a request by server-log offset and by the API's backend pids. */
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import { addDays, creditPosition, istDate, orderTotals, priceDesign } from '@jewelroute/shared';
import { Prisma, PrismaClient, Purity } from '../generated/prisma';
import { eventRefs } from '../src/core/event-refs';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(DB_URL)) throw new Error('DATABASE_URL must be a local database');
const PASSWORD = 'Explain@2026';
const DAY = 86_400_000;

// ---------------------------------------------------------------------------------------------- seed
async function seed(slug: string, shopCount: number, orderCount: number, eventTarget: number) {
  const db = new PrismaClient();
  const t0 = Date.now();
  const tenant = await db.tenant.create({ data: { slug, name: `Volume ${slug}`, demoMode: false } });
  const tenantId = tenant.id;
  const hash = await bcrypt.hash(PASSWORD, 4);
  const admin = await db.user.create({ data: { tenantId, email: `admin@${slug}.test`, name: 'Volume Admin', role: 'ADMIN', passwordHash: hash } });
  const agents = await db.user.createManyAndReturn({ data: Array.from({ length: 5 }, (_, i) => ({ tenantId, email: `agent${i}@${slug}.test`, name: `Agent ${i}`, role: 'FIELD_AGENT' as const, passwordHash: hash })) });
  const rates = await db.goldRate.createManyAndReturn({
    data: [
      { tenantId, purity: 'K22' as Purity, ratePaisePerGram: 10_500_00n, effectiveFrom: new Date(Date.now() - 40 * DAY), createdById: admin.id },
      { tenantId, purity: 'K18' as Purity, ratePaisePerGram: 8_600_00n, effectiveFrom: new Date(Date.now() - 40 * DAY), createdById: admin.id },
    ],
  });
  const rate = (p: Purity) => rates.find((r) => r.purity === p)!;
  const designs = await db.jewelryDesign.createManyAndReturn({
    data: Array.from({ length: 8 }, (_, i) => ({ tenantId, sku: `V-${i}`, name: `Volume design ${i}`, category: ['Rings', 'Chains', 'Bangles', 'Earrings'][i % 4], collection: 'Core', purity: (i % 2 ? 'K18' : 'K22') as Purity, grossWeightMg: 8_000 + i * 900, netWeightMg: 7_200 + i * 800, makingChargeType: 'PER_GRAM' as const, makingChargeValue: 650_00n, stoneValuePaise: BigInt(i * 1_000_00) })),
  });
  const price = (d: (typeof designs)[number]) => priceDesign({ netWeightMg: d.netWeightMg, ratePaisePerGram: Number(rate(d.purity).ratePaisePerGram), makingChargeType: d.makingChargeType, makingChargeValue: Number(d.makingChargeValue), stoneValuePaise: Number(d.stoneValuePaise) });
  const shops = await db.shop.createManyAndReturn({
    data: Array.from({ length: shopCount }, (_, i) => ({ tenantId, code: `VS-${String(i + 1).padStart(4, '0')}`, name: `Volume Shop ${i + 1}`, address: `${i + 1} Volume Road`, area: `Area ${i % 7}`, city: 'Bengaluru', lat: 12.9 + i / 1000, lng: 77.6, creditLimitPaise: BigInt(i % 3 ? 50_00_000_00 : 0), openingOutstandingPaise: BigInt((i % 4) * 1_00_000_00), assignedAgentId: agents[i % agents.length].id })),
  });
  const ref = (x: { id: string; name: string }) => ({ id: x.id, name: x.name });
  const events: Prisma.OutboxEventCreateManyInput[] = [];
  const feed = (type: string, aggregateType: string, aggregateId: string, at: Date, actorId: string | null, data: Record<string, unknown>, id = `evt_${ulid(at.getTime())}`) => {
    events.push({ id, tenantId, type, aggregateType, aggregateId, actorId, createdAt: at, fannedOutAt: at, payload: { id, type, tenantId: slug, createdAt: at.toISOString(), data } as Prisma.InputJsonValue, ...eventRefs(aggregateType, aggregateId, data) });
    return id;
  };

  // Visits: completed in the past (5 orders each), plus today's plan.
  const today = istDate();
  const pastVisits = Math.ceil(orderCount / 5);
  const visitRows = Array.from({ length: pastVisits }, (_, i) => {
    const s = shops[i % shops.length];
    const a = agents.find((x) => x.id === s.assignedAgentId)!;
    const day = addDays(today, -1 - Math.floor(i / shops.length) - ((i % shops.length) % 30)); // unique per (shop, day)
    const inAt = new Date(`${day}T05:00:00.000Z`);
    return { tenantId, shopId: s.id, agentId: a.id, plannedDate: new Date(`${day}T00:00:00.000Z`), status: 'COMPLETED' as const, assignedById: admin.id, checkInAt: inAt, checkInLat: s.lat, checkInLng: s.lng, checkInAccuracyM: 5, checkInDistanceM: 3, verification: 'VERIFIED' as const, startedAt: inAt, completedAt: new Date(inAt.getTime() + 3_600_000) };
  });
  const todays = shops.slice(0, Math.min(shops.length, 20)).map((s, i) => ({ tenantId, shopId: s.id, agentId: s.assignedAgentId!, plannedDate: new Date(`${today}T00:00:00.000Z`), status: 'PLANNED' as const, sequence: i + 1, assignedById: admin.id }));
  const visits = await db.visit.createManyAndReturn({ data: [...visitRows, ...todays] });
  for (const v of visits.filter((x) => x.status === 'COMPLETED')) {
    const s = shops.find((x) => x.id === v.shopId)!;
    const a = agents.find((x) => x.id === v.agentId)!;
    feed('visit.checked_in', 'Visit', v.id, v.checkInAt!, a.id, { visitId: v.id, agent: ref(a), shop: ref(s), checkInAt: v.checkInAt!.toISOString(), verification: 'VERIFIED' });
    feed('visit.proof_uploaded', 'Visit', v.id, new Date(v.checkInAt!.getTime() + 60_000), a.id, { visitId: v.id, agent: ref(a), shop: ref(s) });
    feed('visit.completed', 'Visit', v.id, v.completedAt!, a.id, { visitId: v.id, agent: ref(a), shop: ref(s), completedAt: v.completedAt!.toISOString(), proofCount: 1 });
  }

  // Orders: mostly confirmed; some pending / approved / rejected / cancelled; a third of the live ones settled.
  const done = visits.filter((v) => v.status === 'COMPLETED');
  const orderRows: Prisma.OrderCreateManyInput[] = [];
  const itemRows: Prisma.OrderItemCreateManyInput[] = [];
  for (let i = 0; i < orderCount; i++) {
    const v = done[Math.floor(i / 5)];
    const s = shops.find((x) => x.id === v.shopId)!;
    const lines = Array.from({ length: 1 + (i % 3) }, (_, k) => ({ d: designs[(i + k) % designs.length], q: 1 + ((i + k) % 2) }));
    const priced = lines.map((l) => ({ ...l, p: price(l.d) }));
    const t = orderTotals(priced.map((x) => x.p.unitPricePaise * x.q));
    const status = (['CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'PENDING_APPROVAL', 'APPROVED', i % 2 ? 'REJECTED' : 'CANCELLED'] as const)[i % 10];
    const pending = status !== 'CONFIRMED' && status !== 'CANCELLED';
    const at = new Date(v.checkInAt!.getTime() + (i % 5) * 300_000);
    const id = `ord_${ulid(at.getTime())}`;
    const position = creditPosition({ creditLimitPaise: Number(s.creditLimitPaise), openingOutstandingPaise: Number(s.openingOutstandingPaise), unsettledOrdersPaise: 0, memoExposurePaise: 0, approvalThresholdPaise: pending ? 1 : null, orderAmountPaise: t.totalPaise });
    orderRows.push({
      id, tenantId, number: `ORD-2026-${String(i + 1).padStart(5, '0')}`, shopId: s.id, agentId: v.agentId, visitId: v.id, status, clientOpId: ulid(), subtotalPaise: BigInt(t.subtotalPaise), gstPaise: BigInt(t.gstPaise), totalPaise: BigInt(t.totalPaise),
      goldRateSnapshot: [...new Set(lines.map((l) => l.d.purity))].map((p) => ({ purity: p, goldRateId: rate(p).id, ratePaisePerGram: Number(rate(p).ratePaisePerGram), effectiveFrom: rate(p).effectiveFrom.toISOString() })),
      approvalRequired: pending, approvalReasons: pending ? ['ORDER_THRESHOLD'] : [], creditSnapshot: position as unknown as Prisma.InputJsonValue,
      decidedById: ['APPROVED', 'REJECTED'].includes(status) ? admin.id : null, decidedAt: ['APPROVED', 'REJECTED'].includes(status) ? new Date(at.getTime() + DAY / 2) : null,
      settledAt: (status === 'CONFIRMED' || status === 'APPROVED') && i % 3 === 0 ? new Date(at.getTime() + DAY) : null, cancelledAt: status === 'CANCELLED' ? new Date(at.getTime() + 600_000) : null, createdAt: at,
    });
    for (const x of priced) itemRows.push({ tenantId, orderId: id, designId: x.d.id, sku: x.d.sku, name: x.d.name, purity: x.d.purity, quantity: x.q, netWeightMg: x.d.netWeightMg, goldRateId: rate(x.d.purity).id, ratePaisePerGram: rate(x.d.purity).ratePaisePerGram, goldValuePaise: BigInt(x.p.goldValuePaise), makingPaise: BigInt(x.p.makingPaise), stonePaise: BigInt(x.p.stonePaise), otherPaise: 0n, unitPricePaise: BigInt(x.p.unitPricePaise), lineTotalPaise: BigInt(x.p.unitPricePaise * x.q) });
    const a = agents.find((x) => x.id === v.agentId)!;
    const base = { orderId: id, number: orderRows[i].number, status, agent: ref(a), shop: ref(s), visitId: v.id, totalPaise: t.totalPaise };
    feed('order.created', 'Order', id, at, a.id, { ...base, approval: { required: pending, reasons: pending ? ['ORDER_THRESHOLD'] : [] } });
    feed(pending ? 'order.pending_approval' : 'order.confirmed', 'Order', id, new Date(at.getTime() + 1), a.id, { ...base, reasons: pending ? ['ORDER_THRESHOLD'] : [] });
    if (status === 'APPROVED' || status === 'REJECTED') feed(`order.${status.toLowerCase()}`, 'Order', id, new Date(at.getTime() + DAY / 2), admin.id, { ...base, actor: ref(admin) });
    if (status === 'CANCELLED') feed('order.cancelled', 'Order', id, new Date(at.getTime() + 600_000), admin.id, { ...base, actor: ref(admin) });
  }
  await db.order.createMany({ data: orderRows });
  await db.orderItem.createMany({ data: itemRows });

  // Pieces: 4 per shop. Two of them on a memo at the shop (OUT), one with the shop's agent, one in the vault.
  const pieceRows: Prisma.SamplePieceCreateManyInput[] = [];
  const custody: Prisma.CustodyEventCreateManyInput[] = [];
  const memoRows: Prisma.MemoCreateManyInput[] = [];
  const memoItems: Prisma.MemoItemCreateManyInput[] = [];
  let tag = 0;
  for (const [i, s] of shops.entries()) {
    const a = agents.find((x) => x.id === s.assignedAgentId)!;
    const v = done.find((x) => x.shopId === s.id);
    const at = v ? new Date(v.completedAt!.getTime() - 600_000) : new Date(Date.now() - 2 * DAY);
    const memoId = `memo_${ulid(at.getTime())}`;
    const ps = Array.from({ length: 4 }, (_, k) => {
      const d = designs[(i + k) % designs.length];
      return { id: `pc_${ulid()}`, d, state: k < 2 ? 'SHOP' : k === 2 ? 'AGENT' : 'VAULT' };
    });
    const intakeAt = new Date(at.getTime() - 20 * DAY);
    const issueEvt = `evt_${ulid(intakeAt.getTime() + DAY)}`;
    const memoEvt = `evt_${ulid(at.getTime() + 1)}`;
    for (const p of ps) {
      const seq = p.state === 'SHOP' ? 3 : p.state === 'AGENT' ? 2 : 1;
      pieceRows.push({ id: p.id, tenantId, designId: p.d.id, tagCode: `VT-${slug}-${String(++tag).padStart(5, '0')}`, grossWeightMg: p.d.grossWeightMg, netWeightMg: p.d.netWeightMg, custodianType: p.state as 'SHOP' | 'AGENT' | 'VAULT', custodianAgentId: p.state === 'AGENT' ? a.id : null, custodianShopId: p.state === 'SHOP' ? s.id : null, custodySeq: seq });
      custody.push({ tenantId, pieceId: p.id, seq: 1, toType: 'VAULT', reason: 'INTAKE', actorId: admin.id, occurredAt: intakeAt });
      if (seq >= 2) custody.push({ tenantId, pieceId: p.id, seq: 2, fromType: 'VAULT', toType: 'AGENT', toAgentId: a.id, reason: 'ISSUE_TO_AGENT', actorId: admin.id, outboxEventId: issueEvt, occurredAt: new Date(intakeAt.getTime() + DAY) });
      if (seq >= 3) custody.push({ tenantId, pieceId: p.id, seq: 3, fromType: 'AGENT', fromAgentId: a.id, toType: 'SHOP', toShopId: s.id, reason: 'MEMO_HANDOVER', memoId, visitId: v?.id, actorId: a.id, outboxEventId: memoEvt, occurredAt: at });
    }
    const moved = ps.filter((p) => p.state !== 'VAULT');
    feed('sample.custody_changed', 'SamplePiece', moved[0].id, new Date(intakeAt.getTime() + DAY), admin.id, { pieces: moved.map((p) => ({ id: p.id, seq: 2 })), pieceCount: moved.length, from: { type: 'VAULT' }, to: { type: 'AGENT', agentId: a.id }, fromLabel: 'Vault', toLabel: a.name, reason: 'ISSUE_TO_AGENT', actor: ref(admin) }, issueEvt);
    const onMemo = ps.filter((p) => p.state === 'SHOP');
    const values = onMemo.map((p) => price(p.d).unitPricePaise);
    memoRows.push({ id: memoId, tenantId, number: `MEMO-2026-${String(i + 1).padStart(5, '0')}`, shopId: s.id, agentId: a.id, visitId: v?.id, clientOpId: ulid(), dueDate: new Date(`${addDays(today, (i % 5) - 2)}T00:00:00.000Z`), totalValuePaise: BigInt(values.reduce((x, y) => x + y, 0)), createdAt: at });
    onMemo.forEach((p, k) => memoItems.push({ tenantId, memoId, pieceId: p.id, valuePaise: BigInt(values[k]), status: 'OUT', createdAt: at }));
    feed('sample.custody_changed', 'SamplePiece', onMemo[0].id, at, a.id, { pieces: onMemo.map((p) => ({ id: p.id, seq: 3 })), pieceCount: onMemo.length, from: { type: 'AGENT', agentId: a.id }, to: { type: 'SHOP', shopId: s.id }, fromLabel: a.name, toLabel: s.name, reason: 'MEMO_HANDOVER', memoId, visitId: v?.id, actor: ref(a) }, memoEvt);
    feed('memo.created', 'Memo', memoId, new Date(at.getTime() + 2), a.id, { memoId, number: memoRows[i].number, visitId: v?.id, agent: ref(a), shop: ref(s), pieceCount: onMemo.length, totalValuePaise: values.reduce((x, y) => x + y, 0), pieces: onMemo.map((p) => ({ id: p.id })) });
  }
  await db.samplePiece.createMany({ data: pieceRows });
  await db.custodyEvent.createMany({ data: custody });
  await db.memo.createMany({ data: memoRows });
  await db.memoItem.createMany({ data: memoItems });

  // Top up with arrival photos (real visits take several) until the tenant has `eventTarget` events.
  for (let i = 0; events.length < eventTarget; i++) {
    const v = done[i % done.length];
    const a = agents.find((x) => x.id === v.agentId)!;
    const s = shops.find((x) => x.id === v.shopId)!;
    feed('visit.proof_uploaded', 'Visit', v.id, new Date(v.checkInAt!.getTime() + 120_000 + i), a.id, { visitId: v.id, agent: ref(a), shop: ref(s) });
  }
  for (let i = 0; i < events.length; i += 1000) await db.outboxEvent.createMany({ data: events.slice(i, i + 1000) });
  await db.$executeRaw`ANALYZE`;
  console.log(JSON.stringify({ slug, tenantId, shops: shops.length, visits: visits.length, orders: orderRows.length, orderItems: itemRows.length, memos: memoRows.length, pieces: pieceRows.length, custodyEvents: custody.length, outboxEvents: events.length, ms: Date.now() - t0, login: `admin@${slug}.test / ${PASSWORD}` }));
  await db.$disconnect();
}

// ------------------------------------------------------------------------------------------- measure
const ROUTES = ['/v1/admin/home', '/v1/admin/shops', '/v1/admin/orders', '/v1/admin/activity'];
const PORT = Number(process.env.EXPLAIN_PORT ?? 4308);
const psql = (sql: string) => execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-Atqc', sql], { encoding: 'utf8' }).trim();
const dbName = new URL(DB_URL).pathname.slice(1);
if (!/^jewelroute_explain\w*$/.test(dbName)) throw new Error('measure runs only against a jewelroute_explain* scratch database');

interface Stmt {
  pid: number;
  ms: number;
  text: string;
  plan: string;
}
function readFrom(file: string, offset: number) {
  const size = statSync(file).size;
  const buf = Buffer.alloc(size - offset);
  const fd = openSync(file, 'r');
  readSync(fd, buf, 0, buf.length, offset);
  closeSync(fd);
  return buf.toString('utf8');
}
/** auto_explain entries ("duration: X ms  plan:" + tab-indented continuation lines) of the given backends. */
function parsePlans(text: string, pids: Set<number>): Stmt[] {
  const out: Stmt[] = [];
  let cur: { pid: number; lines: string[] } | undefined;
  const head = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+ \S+ \[(\d+)\] \w+:\s+(.*)$/;
  const flush = () => {
    if (!cur || !pids.has(cur.pid)) return;
    const first = cur.lines[0];
    const m = /^duration: ([\d.]+) ms\s+plan:/.exec(first);
    if (!m) return;
    const body = cur.lines.slice(1).map((l) => l.replace(/^\t/, ''));
    const qt = body.findIndex((l) => l.startsWith('Query Text:'));
    const planStart = body.findIndex((l, i) => i > qt && /^(\S.*\(cost=|Query Parameters:)/.test(l));
    const qText = body.slice(qt, planStart < 0 ? undefined : planStart).join(' ').replace(/^Query Text:\s*/, '').replace(/\s+/g, ' ');
    out.push({ pid: cur.pid, ms: Number(m[1]), text: qText, plan: body.slice(planStart < 0 ? body.length : planStart).join('\n') });
  };
  for (const line of text.split('\n')) {
    const h = head.exec(line);
    if (h) {
      flush();
      cur = { pid: Number(h[1]), lines: [h[2]] };
    } else if (cur) cur.lines.push(line);
  }
  flush();
  return out;
}

async function measure(slug: string, logFile: string) {
  // EXPLAIN_NO_SEQSCAN=1: a Seq Scan that survives `enable_seqscan = off` has no index to use at all.
  const settings = ["session_preload_libraries = 'auto_explain'", 'auto_explain.log_min_duration = 0', 'auto_explain.log_analyze = on', 'auto_explain.log_buffers = on', 'auto_explain.log_timing = on', 'auto_explain.log_parameter_max_length = 200', ...(process.env.EXPLAIN_NO_SEQSCAN ? ['enable_seqscan = off'] : [])];
  for (const s of settings) psql(`ALTER DATABASE ${dbName} SET ${s}`);
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(PORT),
    DATABASE_URL: `${DB_URL}${DB_URL.includes('?') ? '&' : '?'}connection_limit=4`,
    DATABASE_URL_DIRECT: DB_URL,
    LOG_LEVEL: 'warn',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'explain-access-secret-0123456789',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'explain-refresh-secret-0123456789',
    APP_SECRET: process.env.APP_SECRET ?? 'explain-app-secret-0123456789',
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY ?? Buffer.alloc(32, 9).toString('base64'),
    CRON_SECRET: process.env.CRON_SECRET ?? 'explain-cron-secret',
    API_PUBLIC_URL: `http://127.0.0.1:${PORT}`,
  };
  const server = spawn(process.execPath, ['dist/main.js'], { cwd: join(__dirname, '..'), env, stdio: ['ignore', 'ignore', 'inherit'] });
  const base = `http://127.0.0.1:${PORT}`;
  const results: unknown[] = [];
  try {
    for (let i = 0; i < 100; i++) {
      if (await fetch(`${base}/v1/health`).then((r) => r.ok).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    const login = await fetch(`${base}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `admin@${slug}.test`, password: PASSWORD }) }).then((r) => r.json());
    const token = (login as { data?: { accessToken?: string } }).data?.accessToken;
    if (!token) throw new Error(`login failed: ${JSON.stringify(login)}`);
    const get = (path: string) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
    // Warm up (Prisma, and the dashboard's opportunistic dispatch kick — at most one per 10 s), then measure inside that window.
    for (const r of ROUTES) await get(r);
    await new Promise((r) => setTimeout(r, 1500));
    for (const route of ROUTES) {
      const before = statSync(logFile).size;
      const t = Date.now();
      const res = await get(route);
      const bytes = (await res.arrayBuffer()).byteLength;
      const wall = Date.now() - t;
      await new Promise((r) => setTimeout(r, 400)); // let the server flush its log lines
      const pids = new Set(psql(`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`).split('\n').filter(Boolean).map(Number));
      const stmts = parsePlans(readFrom(logFile, before), pids);
      const top = [...stmts].sort((a, b) => b.ms - a.ms).slice(0, 3);
      results.push({ route, status: res.status, wallMs: wall, bytes, statements: stmts.length, sqlMs: Number(stmts.reduce((a, s) => a + s.ms, 0).toFixed(2)), seqScans: [...new Set(stmts.flatMap((s) => [...s.plan.matchAll(/Seq Scan on "?(\w+)"?/g)].map((m) => m[1])))], all: stmts.map((s) => `${s.ms.toFixed(3)} ms · ${(/FROM\s+"?(?:public"?\.)?"?(\w+)/i.exec(s.text) ?? [])[1] ?? '?'} · ${(/\b(Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan)\b/.exec(s.plan) ?? [])[1] ?? ''}`), top: top.map((s) => ({ ms: s.ms, text: s.text.slice(0, 600), plan: s.plan.split('\n').slice(0, 40).join('\n') })) });
    }
  } finally {
    server.kill('SIGTERM');
    for (const s of settings) psql(`ALTER DATABASE ${dbName} RESET ${s.split(' =')[0]}`);
  }
  console.log(JSON.stringify({ slug, results }, null, 1));
}

const [cmd, ...args] = process.argv.slice(2);
const run = cmd === 'seed' ? seed(args[0], Number(args[1]), Number(args[2]), Number(args[3])) : cmd === 'measure' ? measure(args[0], args[1]) : Promise.reject(new Error('usage: explain-hot.ts seed <slug> <shops> <orders> <events> | measure <slug> <postgres log file>'));
run.catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
