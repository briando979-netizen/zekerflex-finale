# Klein en niet als root. Bouwen: docker build -t talkaroo .
FROM node:22-alpine AS afhankelijkheden
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=afhankelijkheden /app/node_modules ./node_modules
COPY package.json server.js games.js ./
COPY src ./src
COPY public ./public
# De map voor meldingen en blokkades is van de gewone gebruiker "node"; de code zelf blijft alleen-lezen.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
# De container meldt zichzelf ziek als /health niet meer antwoordt.
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Rechtstreeks node (geen npm): zo komt SIGTERM bij de server aan en sluit hij netjes af.
CMD ["node", "server.js"]
