import { Body, Controller, Get, HttpCode, Injectable, Module, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, Public, signAccessToken } from '../common/auth';
import { randomToken, sha256 } from '../common/crypto';
import { notFound, unauthorized } from '../common/errors';
import { parse } from '../common/http';
import { isProd } from '../env';

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const ACCESS_TTL_MS = 15 * 60 * 1000;

const LoginBody = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), tenantSlug: z.string().max(64).optional() });

// Constant-time-ish: compare against a dummy hash when the user does not exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function toUser(u: { id: string; name: string; email: string; role: string; phone: string | null; tenant: { id: string; slug: string; name: string; demoMode: boolean } }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone ?? undefined, tenant: { id: u.tenant.id, slug: u.tenant.slug, name: u.tenant.name, demoMode: u.tenant.demoMode } };
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(user: { id: string; tenantId: string; role: string; name: string; tenant: { slug: string } }, userAgent?: string) {
    const auth: AuthUser = { sub: user.id, tid: user.tenantId, tslug: user.tenant.slug, role: user.role as AuthUser['role'], name: user.name };
    const accessToken = signAccessToken(auth);
    const refreshToken = `rt_${randomToken(32)}`;
    await this.prisma.db.refreshToken.create({
      data: { tenantId: user.tenantId, userId: user.id, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), userAgent: userAgent?.slice(0, 200) },
    });
    return { accessToken, refreshToken };
  }

  async login(body: z.infer<typeof LoginBody>, userAgent?: string) {
    const users = await this.prisma.db.user.findMany({
      where: { email: body.email.toLowerCase(), active: true, ...(body.tenantSlug ? { tenant: { slug: body.tenantSlug } } : {}) },
      include: { tenant: true },
      take: 2,
    });
    const user = users.length === 1 ? users[0] : undefined;
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect');
    const tokens = await this.issue(user, userAgent);
    return { user: toUser(user), ...tokens };
  }

  /** Rotating refresh tokens; presenting an already-rotated token revokes the whole family (theft signal). */
  async refresh(token: string | undefined, userAgent?: string) {
    if (!token) throw unauthorized('NO_REFRESH_TOKEN', 'Refresh token missing');
    const row = await this.prisma.db.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.expiresAt < new Date()) throw unauthorized('INVALID_REFRESH_TOKEN', 'Session expired — please sign in again');
    if (row.revokedAt) {
      await this.prisma.db.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized('INVALID_REFRESH_TOKEN', 'Session expired — please sign in again');
    }
    const claimed = await this.prisma.db.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count !== 1) throw unauthorized('INVALID_REFRESH_TOKEN', 'Session expired — please sign in again');
    const user = await this.prisma.db.user.findFirst({ where: { id: row.userId, active: true }, include: { tenant: true } });
    if (!user) throw unauthorized('INVALID_REFRESH_TOKEN', 'Account disabled');
    return this.issue(user, userAgent);
  }

  async logout(token: string | undefined) {
    if (token) await this.prisma.db.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async me(u: AuthUser) {
    const user = await this.prisma.db.user.findFirst({ where: { id: u.sub, tenantId: u.tid }, include: { tenant: true } });
    if (!user) throw notFound('User');
    return toUser(user);
  }
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
    const r = await this.auth.login(parse(LoginBody, body), req.headers['user-agent']);
    setCookies(res, r);
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

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
