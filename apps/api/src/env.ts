import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
  APP_SECRET: z.string().min(16),
  CRON_SECRET: z.string().min(8),
  APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  /** Built-in demo webhook receiver: 'true' | 'false'; unset → on outside production, demo-mode tenants only in production. */
  ENABLE_DEMO_RECEIVER: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
  /** Proxy hops trusted for req.ip (X-Forwarded-For). Unset → 1 on Vercel, 0 elsewhere. Never trust more hops than you have. */
  TRUST_PROXY: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).max(10).optional()),
  /** 'true' lets webhook endpoints target private/loopback addresses — local development and tests only; ignored in production except for demo-mode tenants. */
  WEBHOOK_ALLOW_PRIVATE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
// Prisma's schema references DATABASE_URL_DIRECT (directUrl, used by migrate). Never let a missing
// direct URL break the runtime client.
if (process.env.DATABASE_URL && !process.env.DATABASE_URL_DIRECT) process.env.DATABASE_URL_DIRECT = process.env.DATABASE_URL;
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = { ...parsed.data, APP_PUBLIC_URL: parsed.data.APP_PUBLIC_URL.replace(/\/$/, ''), API_PUBLIC_URL: parsed.data.API_PUBLIC_URL.replace(/\/$/, '') };
  return cached;
}
export const isProd = () => env().NODE_ENV === 'production';
