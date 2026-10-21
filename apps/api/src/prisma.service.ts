import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
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
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient = prismaClient();
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
