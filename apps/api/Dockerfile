# Non-Vercel hosting (Fly/Render/ECS/k8s). Build from the repo root:
#   docker build -f apps/api/Dockerfile -t jewelroute-api .
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @jewelroute/api... --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @jewelroute/api build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo
ENV NODE_ENV=production PORT=4000
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply migrations, then serve. Seed once: pnpm db:seed, or POST /v1/internal/seed with x-cron-secret
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
