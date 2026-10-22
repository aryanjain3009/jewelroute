import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '../generated/prisma';

export type Tx = Prisma.TransactionClient;

/** Long enough for row-lock waits under contention; short enough to fail fast on Vercel (30s max). */
export const TX_OPTS = { maxWait: 10_000, timeout: 20_000 } as const;

let shared: PrismaClient | undefined;
/** One client per process (serverless instances reuse it across invocations). */
export function prismaClient(): PrismaClient {
  if (!shared) shared = new PrismaClient({ log: ['warn', 'error'] });
  return shared;
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly db: PrismaClient = prismaClient();
  /** Columns are UTC TIMESTAMP(3). Raw SQL takes now() AT TIME ZONE 'UTC', but column DEFAULT CURRENT_TIMESTAMP
   *  still follows the session zone, so a non-UTC database is reported loudly at boot. */
  async onModuleInit() {
    const [{ tz }] = await this.db.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
    if (!['UTC', 'Etc/UTC', 'GMT'].includes(tz)) new Logger('Prisma').error(`Database session TimeZone is ${tz}, not UTC: column defaults (CURRENT_TIMESTAMP) will be off by the zone offset. Run: ALTER DATABASE <db> SET timezone TO 'UTC'`);
  }
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.$transaction(fn, TX_OPTS);
  }
  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
