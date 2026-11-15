# ZekerFlex WhatsApp-brug (zie README.md). Klein, alleen Node + Baileys.
# Sinds 15 nov ook je eigen WhatsApp live in Admin → WhatsApp (koppelcode en gesprekken).
# Bouwstap met git: Baileys haalt libsignal rechtstreeks van GitHub (git+https), en het slanke image heeft geen git.
FROM node:24-bookworm-slim AS bouw
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /brug
COPY package.json ./
# Geen lockbestand in de repo (los pakketje, vaste versies in package.json).
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:24-bookworm-slim
WORKDIR /brug
ENV NODE_ENV=production
COPY --from=bouw /brug/node_modules ./node_modules
COPY package.json brug.mjs inhoud.mjs ./
RUN mkdir -p /data/auth && chown -R node:node /data /brug
USER node
EXPOSE 3900
CMD ["node", "brug.mjs"]
