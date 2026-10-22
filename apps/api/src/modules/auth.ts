import { Body, Controller, Get, HttpCode, Injectable, Module, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { PrismaService, Tx } from '../prisma.service';
import { AuthUser, CurrentUser, Public, signAccessToken } from '../common/auth';
import { randomToken, sha256 } from '../common/crypto';
import { conflict, isUniqueViolation, notFound, unauthorized } from '../common/errors';
import { parse, requestIdOf } from '../common/http';
import { env, isProd } from '../env';

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const ACCESS_TTL_MS = 15 * 60 * 1000;
/** A rotated refresh token may be presented ONCE more within this window, from the same user agent (a second tab). */
export const REUSE_GRACE_MS = 30_000;
/** Device id cookie (self-ack evidence, audit review M3): random, httpOnly, survives logout; only its hash is stored. */
export const DEVICE_COOKIE = 'jr_dev';
const DEVICE_TTL_MS = 365 * 24 * 3600 * 1000;
const DEVICE_RE = /^[A-Za-z0-9_-]{32,64}$/;

/** A successor's plaintext is re-derivable from its parent id, so a grace reuse returns the SAME successor (no new session). */
const successorToken = (parentId: string) => `rt_${createHmac('sha256', env().JWT_REFRESH_SECRET).update(`successor:${parentId}`).digest('base64url')}`;
const ua200 = (ua?: string) => (ua ? ua.slice(0, 200) : null);

interface TokenRow {
  id: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  rotatedAt: Date | null;
  graceUsedAt: Date | null;
  successorId: string | null;
  userAgent: string | null;
  deviceHash: string | null;
}

const SignupBody = z.object({
  workspaceName: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  phone: z.string().trim().max(32).optional(),
});
const LoginBody = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), tenantSlug: z.string().max(64).optional() });

// Constant-time-ish: compare against a dummy hash when the user does not exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function toUser(u: { id: string; name: string; email: string; role: string; phone: string | null; tenant: { id: string; slug: string; name: string; demoMode: boolean } }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone ?? undefined, tenant: { id: u.tenant.id, slug: u.tenant.slug, name: u.tenant.name, demoMode: u.tenant.demoMode } };
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private access(user: { id: string; tenantId: string; role: string; name: string; tenant: { slug: string } }) {
    return signAccessToken({ sub: user.id, tid: user.tenantId, tslug: user.tenant.slug, role: user.role as AuthUser['role'], name: user.name });
  }

  async issue(user: { id: string; tenantId: string; role: string; name: string; tenant: { slug: string } }, userAgent?: string, deviceHash?: string | null) {
    const refreshToken = `rt_${randomToken(32)}`;
    await this.prisma.db.refreshToken.create({
      data: { tenantId: user.tenantId, userId: user.id, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), userAgent: ua200(userAgent), deviceHash: deviceHash ?? null },
    });
    return { accessToken: this.access(user), refreshToken };
  }

  /** Login keeps a known device id (valid jr_dev cookie) or mints one; the session row stores only its hash. */
  async login(body: z.infer<typeof LoginBody>, userAgent?: string, deviceCookie?: string) {
    const users = await this.prisma.db.user.findMany({
      where: { email: body.email.toLowerCase(), active: true, ...(body.tenantSlug ? { tenant: { slug: body.tenantSlug } } : {}) },
      include: { tenant: true },
      take: 2,
    });
    const user = users.length === 1 ? users[0] : undefined;
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect');
    const device = deviceCookie && DEVICE_RE.test(deviceCookie) ? deviceCookie : randomToken(32);
    const tokens = await this.issue(user, userAgent, sha256(device));
    return { user: toUser(user), ...tokens, device };
  }

  /**
   * Self-serve workspace: a new tenant (real, not demo) and its owner (ADMIN), signed in. Emails sign in to
   * exactly one workspace (login has no workspace field), so the email check and the inserts run under an
   * advisory lock on the email — concurrent signups with one address serialise and only the first wins.
   */
  async signup(body: z.infer<typeof SignupBody>, meta: { userAgent?: string; deviceCookie?: string; ip: string; requestId: string }) {
    const email = body.email.toLowerCase();
    for (let attempt = 0; ; attempt++) {
      try {
        const user = await this.prisma.tx(async (tx) => {
          await lockEmail(tx, email);
          if (await tx.user.findFirst({ where: { email }, select: { id: true } })) throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
          const tenant = await tx.tenant.create({ data: { slug: await freeSlug(tx, body.workspaceName), name: body.workspaceName, demoMode: false } });
          const u = await tx.user.create({
            data: { tenantId: tenant.id, email, name: body.name, phone: body.phone || null, role: 'ADMIN', passwordHash: await bcrypt.hash(body.password, 10) },
            include: { tenant: true },
          });
          await tx.auditLog.create({ data: { tenantId: tenant.id, actorId: u.id, action: 'tenant.signup', entityType: 'Tenant', entityId: tenant.id, after: { name: tenant.name, slug: tenant.slug, owner: email }, requestId: meta.requestId || null, ip: meta.ip || null } });
          return u;
        });
        const device = meta.deviceCookie && DEVICE_RE.test(meta.deviceCookie) ? meta.deviceCookie : randomToken(32);
        return { user: toUser(user), ...(await this.issue(user, meta.userAgent, sha256(device))), device };
      } catch (e) {
        // Two signups picked the same free slug at once: the loser takes the next one.
        if (attempt < 3 && isUniqueViolation(e, 'slug')) continue;
        throw e;
      }
    }
  }

  /**
   * Rotating refresh tokens (audit review M1). Under a per-user advisory lock (serialises with family revocation)
   * and the token row FOR UPDATE:
   *  - live token → rotate into a successor whose plaintext is re-derivable from this row;
   *  - rotated < REUSE_GRACE_MS ago, grace unused, same user agent, successor still live → spend the ONE grace
   *    reuse and return the SAME successor (a second tab; no new session is minted);
   *  - anything else (2nd reuse, other user agent, after the window, logged-out token) → theft: revoke every
   *    live token of the user (committed), then 401.
   */
  async refresh(token: string | undefined, userAgent?: string) {
    if (!token) throw unauthorized('NO_REFRESH_TOKEN', 'Refresh token missing');
    const tokenHash = sha256(token);
    const peek = await this.prisma.db.refreshToken.findUnique({ where: { tokenHash }, select: { userId: true } });
    if (!peek) throw unauthorized('INVALID_REFRESH_TOKEN', 'Session expired — please sign in again');
    const out = await this.prisma.tx(async (tx) => {
      await lockFamily(tx, peek.userId);
      const [row] = await tx.$queryRaw<TokenRow[]>`
        SELECT id, "userId", "tenantId", "expiresAt", "revokedAt", "rotatedAt", "graceUsedAt", "successorId", "userAgent", "deviceHash"
        FROM "RefreshToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
      const now = new Date();
      if (!row || row.expiresAt < now) return { fail: 'expired' as const };
      const user = await tx.user.findFirst({ where: { id: row.userId, active: true }, include: { tenant: true } });
      if (!user) return { fail: 'disabled' as const };
      if (!row.revokedAt) {
        const plain = successorToken(row.id);
        const s = await tx.refreshToken.create({
          data: { tenantId: row.tenantId, userId: row.userId, tokenHash: sha256(plain), expiresAt: new Date(now.getTime() + REFRESH_TTL_MS), userAgent: ua200(userAgent), deviceHash: row.deviceHash },
        });
        await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: now, rotatedAt: now, successorId: s.id } });
        return { accessToken: this.access(user), refreshToken: plain };
      }
      const inWindow = !!row.rotatedAt && now.getTime() - row.rotatedAt.getTime() < REUSE_GRACE_MS;
      if (inWindow && !row.graceUsedAt && row.successorId && row.userAgent === ua200(userAgent)) {
        const succ = await tx.refreshToken.findUnique({ where: { id: row.successorId }, select: { revokedAt: true, expiresAt: true, userId: true } });
        if (succ && succ.userId === row.userId && !succ.revokedAt && succ.expiresAt > now) {
          await tx.refreshToken.update({ where: { id: row.id }, data: { graceUsedAt: now } });
          return { accessToken: this.access(user), refreshToken: successorToken(row.id) };
        }
      }
      await tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: now } });
      return { fail: 'reuse' as const };
    });
    if ('fail' in out) throw unauthorized('INVALID_REFRESH_TOKEN', out.fail === 'disabled' ? 'Account disabled' : 'Session expired — please sign in again');
    return out;
  }

  /** Logout ends this session only (review m8): the presented token. Other devices keep their sessions. */
  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.db.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** "Sign out everywhere": every live refresh token of the user, under the family lock. */
  async logoutAll(u: AuthUser) {
    await this.prisma.tx(async (tx) => {
      await lockFamily(tx, u.sub);
      await tx.refreshToken.updateMany({ where: { userId: u.sub, tenantId: u.tid, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }

  async me(u: AuthUser) {
    const user = await this.prisma.db.user.findFirst({ where: { id: u.sub, tenantId: u.tid }, include: { tenant: true } });
    if (!user) throw notFound('User');
    return toUser(user);
  }
}

/** Serialises "is this email free?" with the insert that takes it (signup, agent create). */
export async function lockEmail(tx: Tx, email: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`email:${email.toLowerCase()}`}::text))`;
}

/** "Aurum Jewels" → aurum-jewels, or aurum-jewels-2 … when taken. */
async function freeSlug(tx: Tx, name: string) {
  const base = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'workspace';
  const candidates = [base, ...Array.from({ length: 19 }, (_, i) => `${base}-${i + 2}`)];
  const taken = new Set((await tx.tenant.findMany({ where: { slug: { in: candidates } }, select: { slug: true } })).map((t) => t.slug));
  return candidates.find((c) => !taken.has(c)) ?? `${base}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

/** Per-user lock shared by rotation, grace reuse, family revocation, logout-all and deactivation. */
export async function lockFamily(tx: Tx, userId: string) {
  // $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw cannot deserialize.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rt:${userId}`}::text))`;
}

function setCookies(res: Response, t: { accessToken: string; refreshToken: string }) {
  const base = { httpOnly: true, secure: isProd(), sameSite: 'lax' as const, path: '/' };
  res.cookie('jr_at', t.accessToken, { ...base, maxAge: ACCESS_TTL_MS });
  res.cookie('jr_rt', t.refreshToken, { ...base, maxAge: REFRESH_TTL_MS });
}
const cookieOf = (req: Request, name: string) => (req as Request & { cookies?: Record<string, string> }).cookies?.[name];

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Email + password login; sets jr_at / jr_rt httpOnly cookies' })
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(parse(LoginBody, body), req.headers['user-agent'], cookieOf(req, DEVICE_COOKIE));
    setCookies(res, r);
    res.cookie(DEVICE_COOKIE, r.device, { httpOnly: true, secure: isProd(), sameSite: 'lax', path: '/', maxAge: DEVICE_TTL_MS });
    return { user: r.user, accessToken: r.accessToken, refreshToken: r.refreshToken };
  }

  @Public()
  // ponytail: per-IP cap only; email verification / captcha is the upgrade when signup is public.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('signup')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a workspace and its owner; signs the owner in (same cookies as login)' })
  async signup(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.signup(parse(SignupBody, body), { userAgent: req.headers['user-agent'], deviceCookie: cookieOf(req, DEVICE_COOKIE), ip: req.ip ?? '', requestId: requestIdOf(req) });
    setCookies(res, r);
    res.cookie(DEVICE_COOKIE, r.device, { httpOnly: true, secure: isProd(), sameSite: 'lax', path: '/', maxAge: DEVICE_TTL_MS });
    return { user: r.user, accessToken: r.accessToken, refreshToken: r.refreshToken };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token (cookie jr_rt or body.refreshToken)' })
  async refresh(@Body() body: { refreshToken?: string } | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.refresh(cookieOf(req, 'jr_rt') ?? body?.refreshToken, req.headers['user-agent']);
    setCookies(res, t);
    return { accessToken: t.accessToken, refreshToken: t.refreshToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: { refreshToken?: string } | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(cookieOf(req, 'jr_rt') ?? body?.refreshToken);
    const base = { httpOnly: true, secure: isProd(), sameSite: 'lax' as const, path: '/' };
    res.clearCookie('jr_at', base);
    res.clearCookie('jr_rt', base);
    return {};
  }

  /** Sign out on every device: revokes all of the caller's refresh tokens. Needs a session. */
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(u);
    const base = { httpOnly: true, secure: isProd(), sameSite: 'lax' as const, path: '/' };
    res.clearCookie('jr_at', base);
    res.clearCookie('jr_rt', base);
    return {};
  }

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
