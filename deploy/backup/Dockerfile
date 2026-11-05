# De back-updienst (docker-compose.vps.yml → backup): het postgres-image, zodat
# pg_dump/pg_restore precies de versie van de server hebben, plus wat het
# opslaan buiten de server nodig heeft: scp (eigen reserveserver) en curl
# (WebDAV-opslag zoals TransIP STACK, Hetzner Storage Box, Nextcloud).
# openssl voor de versleuteling zit al in het basisimage.
FROM postgres:18-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl openssh-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*
