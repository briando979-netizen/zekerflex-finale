# ZekerFlex Bouwer — de AI-programmeur van Admin → ZekerFlex AI → Bouwer.
# Alleen node + git + ripgrep; de code (server.mjs e.a.) komt via een alleen-lezen
# mount uit deploy/bouwer/werker, zodat een uitrol hem bijwerkt zonder dit image
# opnieuw te bouwen. Werkkopie, pakketten en opdrachten staan in het volume /werk.
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
# eigen uid, botst niet met de app (1001) of met testgebruikers op de host
RUN useradd -u 61000 -m bouwer && mkdir -p /werk && chown bouwer:bouwer /werk
USER bouwer
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=2560 \
    npm_config_update_notifier=false
WORKDIR /werk
EXPOSE 4100
CMD ["node", "/opt/bouwer/server.mjs"]
