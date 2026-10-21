import 'reflect-metadata';
import { CallHandler, ExecutionContext, Global, Injectable, INestApplication, Module, NestInterceptor } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import helmet from 'helmet';
import { Logger, LoggerModule } from 'nestjs-pino';
import { Observable, tap } from 'rxjs';
import { ulid } from 'ulid';
import { AuthGuard } from './common/auth';
import { throttleTracker, trustProxyHops } from './common/client-ip';
import { redactUrl } from './common/redact';
import { AllExceptionsFilter, EnvelopeInterceptor, installBigIntJson } from './common/http';
import { ActivityService } from './core/activity';
import { AuditService } from './core/audit';
import { CreditService } from './core/credit';
import { CustodyService } from './core/custody';
import { IdempotencyService } from './core/idempotency';
import { OutboxService } from './core/outbox';
import { RatesService } from './core/rates';
import { ViewsService } from './core/views';
import { env } from './env';
import { AdminModule } from './modules/admin';
import { AuthModule } from './modules/auth';
import { MemosModule } from './modules/memos';
import { OrdersModule } from './modules/orders';
import { UploadsModule } from './modules/uploads';
import { VisitsModule } from './modules/visits';
import { PrismaModule } from './prisma.service';
import { Dispatcher } from './webhooks/dispatcher';
import { WebhooksModule } from './webhooks/webhooks.module';

installBigIntJson();

@Global()
@Module({
  providers: [RatesService, OutboxService, AuditService, IdempotencyService, ViewsService, CustodyService, Dispatcher, CreditService, ActivityService],
  exports: [RatesService, OutboxService, AuditService, IdempotencyService, ViewsService, CustodyService, Dispatcher, CreditService, ActivityService],
})
class CoreModule {}

/** After every successful mutating request (i.e. after its transaction committed) drain the outbox. */
@Injectable()
class PostCommitDispatchInterceptor implements NestInterceptor {
  constructor(private readonly dispatcher: Dispatcher) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const mutating = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    const skip = req.path.includes('/dev/webhook-receiver') || req.path.includes('/internal/dispatch') || req.path.includes('/auth/');
    return next.handle().pipe(
      tap(() => {
        if (mutating && !skip) this.dispatcher.kick(`${req.method} ${req.path}`);
      }),
    );
  }
}

/**
 * Track by the proxy-resolved client IP (`req.ip`, see `trust proxy` below); login is tracked per IP+email so
 * users behind one NAT / the web proxy don't lock each other out while brute force on one account is capped.
 * Never the raw X-Forwarded-For header: a client can put anything in it.
 */
@Injectable()
class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> { // eslint-disable-line @typescript-eslint/no-explicit-any
    return throttleTracker(req);
  }
}

const REQ_ID = /^[A-Za-z0-9._-]{6,100}$/;

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id = typeof incoming === 'string' && REQ_ID.test(incoming) ? incoming : `req_${ulid()}`;
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'req.headers["x-cron-secret"]'], censor: '[redacted]' },
        customProps: (req) => ({ userId: (req as Request & { user?: { sub: string } }).user?.sub, tenantId: (req as Request & { user?: { tid: string } }).user?.tid }),
        serializers: { req: (r: { id: string; method: string; url: string }) => ({ id: r.id, method: r.method, url: redactUrl(r.url) }), res: (r: { statusCode: number }) => ({ statusCode: r.statusCode }) },
        autoLogging: { ignore: (req) => req.url === '/v1/health' },
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 1200 }]),
    PrismaModule,
    CoreModule,
    WebhooksModule,
    AuthModule,
    VisitsModule,
    UploadsModule,
    OrdersModule,
    MemosModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PostCommitDispatchInterceptor },
  ],
})
export class AppModule {}

export async function createApp(): Promise<INestApplication> {
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', trustProxyHops(e));
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '1mb' });
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  const origins = e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['x-request-id'],
  });
  const doc = new DocumentBuilder()
    .setTitle('JewelRoute API')
    .setDescription('Jewelry Field Sales OS — see docs/CONTRACT.md. Envelope: {ok:true,data} / {ok:false,error:{code,message,details},requestId}. Money = paise, weight = mg.')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('jr_at')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, doc), {
    jsonDocumentUrl: 'docs-json',
    customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css',
    customJs: ['https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js', 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js'],
  });
  await app.init();
  return app;
}
