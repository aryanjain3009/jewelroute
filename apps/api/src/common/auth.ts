import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { env } from '../env';
import { AppError, unauthorized } from './errors';

export type Role = 'FIELD_AGENT' | 'ADMIN';
export interface AuthUser {
  sub: string; // user id
  tid: string; // tenant id
  tslug: string; // tenant slug
  role: Role;
  name?: string;
}

export const IS_PUBLIC = 'jr:public';
export const PERMS = 'jr:perms';
/** Route needs no authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Permission model: routes declare permissions; roles map to permission sets.
 * Adding a role (e.g. REGIONAL_MANAGER, AUDITOR) = one entry here, no controller changes.
 */
export type Permission = 'field' | 'admin' | 'admin.read';
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  FIELD_AGENT: ['field'],
  ADMIN: ['admin', 'admin.read', 'field'], // admin may read field resources
};
export const Requires = (...perms: Permission[]) => SetMetadata(PERMS, perms);
/** Convenience: `@Roles('ADMIN')` → requires the `admin` permission. */
export const Roles = (...roles: Role[]) => Requires(...(roles.includes('ADMIN') && !roles.includes('FIELD_AGENT') ? (['admin'] as Permission[]) : (['field'] as Permission[])));

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

export function signAccessToken(u: AuthUser) {
  return jwt.sign({ tid: u.tid, tslug: u.tslug, role: u.role, name: u.name }, env().JWT_ACCESS_SECRET, { subject: u.sub, expiresIn: '15m', issuer: 'jewelroute' });
}

export function verifyAccessToken(token: string): AuthUser {
  try {
    const p = jwt.verify(token, env().JWT_ACCESS_SECRET, { issuer: 'jewelroute' }) as jwt.JwtPayload;
    return { sub: String(p.sub), tid: p.tid, tslug: p.tslug, role: p.role, name: p.name };
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw new AppError(401, 'TOKEN_EXPIRED', 'Access token expired');
    throw unauthorized('INVALID_TOKEN', 'Invalid access token');
  }
}

export function tokenFromRequest(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7).trim();
  return (req as Request & { cookies?: Record<string, string> }).cookies?.jr_at;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const token = tokenFromRequest(req);
    if (!token) throw unauthorized();
    req.user = verifyAccessToken(token);
    const perms = this.reflector.getAllAndOverride<Permission[]>(PERMS, targets);
    if (perms?.length) {
      const have = ROLE_PERMISSIONS[req.user.role] ?? [];
      if (!perms.some((p) => have.includes(p))) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
    }
    return true;
  }
}
