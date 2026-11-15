# ZekerFlex WhatsApp-brug (zie README.md). Klein, alleen Node + Baileys.
# Sinds 15 nov ook je eigen WhatsApp live in Admin → WhatsApp (koppelcode en gesprekken).
FROM node:24-bookworm-slim
WORKDIR /brug
ENV NODE_ENV=production
COPY package.json ./
# Geen lockbestand in de repo (los pakketje, vaste versies in package.json).
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY brug.mjs inhoud.mjs ./
RUN mkdir -p /data/auth && chown -R node:node /data /brug
USER node
EXPOSE 3900
CMD ["node", "brug.mjs"]
