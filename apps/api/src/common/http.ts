import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { map, Observable } from 'rxjs';
import { z, ZodError, ZodType } from 'zod';
import { AppError, badRequest } from './errors';

/** Parse + validate a request part with zod; throws 400 VALIDATION_FAILED. */
export function parse<T extends ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value ?? {});
  if (!r.success) {
    throw badRequest('VALIDATION_FAILED', 'Request validation failed', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const id = z.string().min(1).max(64);

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

export function requestIdOf(req: Request): string {
  return String((req as Request & { id?: string }).id ?? req.headers['x-request-id'] ?? '');
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors');
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    let status = 500;
    let code = 'INTERNAL';
    let message = 'Something went wrong';
    let details: unknown;
    const e = exception as { code?: string; meta?: unknown; message?: string };
    if (exception instanceof AppError) {
      ({ status, code, message, details } = exception);
    } else if (exception instanceof ThrottlerException) {
      status = 429;
      code = 'RATE_LIMITED';
      message = 'Too many requests — slow down';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? 'HTTP_ERROR';
      const r = exception.getResponse();
      message = typeof r === 'string' ? r : ((r as { message?: string | string[] }).message?.toString() ?? exception.message);
    } else if (exception instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_FAILED';
      message = 'Request validation failed';
      details = exception.issues;
    } else if (e?.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Resource not found';
    } else if (e?.code === 'P2034' || /could not serialize|deadlock detected/i.test(String(e?.message))) {
      status = 409;
      code = 'CONCURRENT_UPDATE';
      message = 'A concurrent change was detected — please retry';
    } else if ((exception as { type?: string })?.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Payload too large';
    } else if ((exception as { type?: string })?.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Malformed JSON body';
    }
    if (status >= 500) this.log.error({ err: exception, path: req.url }, String(e?.message ?? exception));
    const requestId = requestIdOf(req);
    if (!res.headersSent) {
      res.status(status).json({ ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) }, requestId });
    }
  }
}

/** Wraps every successful response as `{ ok: true, data }` (raw handlers can opt out by writing to res directly). */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => ({ ok: true, data: data ?? {} })));
  }
}

/** BigInt → number (paise/mg values are far below 2^53). Safety net; mappers already convert explicitly. */
export function installBigIntJson() {
  (BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
    return Number(this);
  };
}
