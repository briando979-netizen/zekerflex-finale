# De browser-werker voor de bronnen (docker-compose.vps.yml → scraper): Playwright
# met Chromium in een eigen container. Geen database, geen geheimen van de app;
# alleen de app praat ermee, op het interne netwerk, met SCRAPER_TOKEN.
# Het image van Microsoft heeft de browsers en alle systeembibliotheken al aan boord;
# de versie hoort bij die in package.json.
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /opt/scraper
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs ./
# niet als root: een pagina van buiten mag nooit meer kunnen dan deze map
USER pwuser
EXPOSE 4300
CMD ["node", "server.mjs"]
