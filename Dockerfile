# ZekerFlex Sovereign Box — production image.
# Multi-stage: install → build (standalone) → minimal runtime.
# Nothing in here migrates or seeds the database; that stays an explicit,
# documented step (see deploy/README.md).

# ---- deps --------------------------------------------------------------------
FROM node:26-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM node:26-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder values so any eager env access during `next build` (static page
# data collection) doesn't fail. NOT used at runtime — the runtime stage below
# is separate and receives the real environment from compose / Kubernetes.
ENV AUTH_SECRET=build_time_placeholder_value_min_32_chars_000
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
# `npm run build` runs `prisma generate && next build`
RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM node:26-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates wget && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# Next standalone server + static assets + public files.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Prisma: the query engine + generated client, and the migrations + CLI so an
# operator can run `docker compose exec app npx prisma migrate deploy`.
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma

# Local storage (uploads, mailbox, prefs, fiscal) — mount a volume over this.
RUN mkdir -p /app/storage && chown -R nextjs:nodejs /app/storage
VOLUME ["/app/storage"]

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
