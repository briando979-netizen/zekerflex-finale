# ZekerFlex Sovereign Box — production image.
# Multi-stage: install → build (standalone) → minimal runtime.
# Nothing in here migrates or seeds the database; that stays an explicit,
# documented step (see deploy/README.md).

# ---- deps --------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# onnxruntime-node (gezichtscontrole, lib/kyc/gezicht) haalt bij het installeren op Linux standaard ook het
# GPU-pakket op (honderden MB, de build liep daarop vast); wij rekenen op de processor en slaan dat over.
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Meer geheugen voor de bouw alleen (de runtime hieronder is een eigen fase): op
# 4 nov liep de typecontrole van `next build` drie keer vol op de standaard ~2 GB
# ("JavaScript heap out of memory"). De VPS heeft 8 GB; de app zelf gebruikt ~300 MB.
ENV NODE_OPTIONS=--max-old-space-size=4096
# Placeholder values so any eager env access during `next build` (static page
# data collection) doesn't fail. NOT used at runtime — the runtime stage below
# is separate and receives the real environment from compose / Kubernetes.
ENV AUTH_SECRET=build_time_placeholder_value_min_32_chars_000
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
# Vaste sleutel voor server-acties, uit .env.production via de compose-build-args.
# Zonder vaste sleutel maakt `next build` in Docker er elke build een nieuwe, en dan
# krijgt elke server-actie bij elke uitrol een andere naam: wie op dat moment een
# formulier openheeft (inloggen, dienst plaatsen, uren) loopt vast
# (lib/ops/stale-deployment.ts). Leeg = een willekeurige sleutel, zoals vroeger.
# Next schrijft hem toch in het serveractie-manifest; dit ARG geldt alleen in deze bouwfase.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=""
# `npm run build` runs `prisma generate && next build`
RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM node:24-bookworm-slim AS runner
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
# Recreate the CLI symlink: `COPY` dereferences .bin/prisma into a real file,
# which makes the CLI look for its wasm (prisma_schema_build_bg.wasm) next to
# .bin/ instead of in prisma/build/. A symlink keeps __dirname at the package
# so `npx prisma migrate deploy` works in this runtime image.
RUN mkdir -p ./node_modules/.bin && ln -sf ../prisma/build/index.js ./node_modules/.bin/prisma
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
# Welke commit dit image is (git archive vult hem in, zie .gitattributes); de app
# toont hem in Admin → ZekerFlex AI → Live zetten (lib/bouwer/versie.ts).
COPY --from=build --chown=nextjs:nodejs /app/lib/bouwer/VERSIE.txt ./VERSIE

# Local storage (uploads, mailbox, prefs, fiscal) — mount a volume over this.
RUN mkdir -p /app/storage && chown -R nextjs:nodejs /app/storage
VOLUME ["/app/storage"]
# Back-ups van beheerde klantsites (lib/website/site-backup.ts): eigen volume,
# bewust niet onder /app/storage (dat gaat elke nacht mee in onze eigen back-up).
RUN mkdir -p /app/site-backups && chown -R nextjs:nodejs /app/site-backups
VOLUME ["/app/site-backups"]
# Cache van next/image (omgezette foto's): als volume overleeft hij een deploy, anders
# moet na elke update elke foto opnieuw worden omgezet, allemaal tegelijk.
RUN mkdir -p /app/.next/cache/images && chown -R nextjs:nodejs /app/.next/cache
VOLUME ["/app/.next/cache"]

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
