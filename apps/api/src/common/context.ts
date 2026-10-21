import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth';
import { requestIdOf } from './http';

/** Everything a service needs about the caller. tenantId ALWAYS comes from the verified JWT. */
export interface ReqCtx {
  user: AuthUser;
  requestId: string;
  ip: string;
  idempotencyKey?: string;
  method: string;
  path: string;
  body: unknown;
}

export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): ReqCtx => {
  const req = ec.switchToHttp().getRequest<Request & { user: AuthUser }>();
  const key = req.headers['idempotency-key'];
  return {
    user: req.user,
    requestId: requestIdOf(req),
    ip: req.ip ?? '',
    idempotencyKey: typeof key === 'string' && key.trim() ? key.trim().slice(0, 200) : undefined,
    method: req.method,
    path: (req.originalUrl ?? req.url).split('?')[0],
    body: req.body,
  };
});
