# FlikFlak — korte-video app (eigen app van de eigenaar), gehost binnen ZekerFlex.
# Eigen kleine container: alleen express + multer + ws, geen database van de app,
# een eigen geïsoleerd netwerk (zie docker-compose.vps.yml). De video's en de
# gegevens staan op het volume flikflak-data (/data), zodat ze een uitrol overleven.
FROM node:20.18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.js ./
COPY public ./public
COPY seed ./seed
COPY entrypoint.sh ./entrypoint.sh
# /data wordt een leeg volume; Docker neemt deze eigenaar over bij de eerste start,
# zodat de app (gebruiker node, niet root) er zijn uploads in kan schrijven.
RUN mkdir -p /data/uploads /data/data && chown -R node:node /data && chmod +x entrypoint.sh
ENV FF_STORAGE=/data PORT=3001 NODE_ENV=production
USER node
EXPOSE 3001
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
