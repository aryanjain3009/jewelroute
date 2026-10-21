import { HttpStatus } from '@nestjs/common';

/** Domain error rendered by the global filter as `{ ok:false, error:{code,message,details} }`. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(HttpStatus.CONFLICT, code, message, details);
export const badRequest = (code: string, message: string, details?: unknown) => new AppError(HttpStatus.BAD_REQUEST, code, message, details);
export const forbidden = (code: string, message: string) => new AppError(HttpStatus.FORBIDDEN, code, message);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
export const unauthorized = (code = 'UNAUTHENTICATED', message = 'Authentication required') => new AppError(HttpStatus.UNAUTHORIZED, code, message);

/** True for a Postgres unique violation, surfaced either by Prisma (P2002) or raw SQL (23505). */
export function isUniqueViolation(e: unknown, needle?: string): boolean {
  const err = e as { code?: string; meta?: { target?: unknown; code?: string; message?: string }; message?: string };
  const hit = err?.code === 'P2002' || err?.code === '23505' || (err?.code === 'P2010' && err?.meta?.code === '23505') || /23505|unique constraint/i.test(String(err?.message ?? ''));
  if (!hit) return false;
  if (!needle) return true;
  return JSON.stringify(err?.meta ?? '').includes(needle) || String(err?.message ?? '').includes(needle);
}
