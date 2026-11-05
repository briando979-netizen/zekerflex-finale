#!/bin/sh
# ZekerFlex wifi-server (FreeRADIUS). Zonder NETWERK_RADIUS_TOKEN doet de dienst
# niets (de app wijst dan elke vraag af). Het certificaat van vps.zekerflex.com
# komt van Caddy (volume caddy-data, alleen lezen) en wordt elke start gekopieerd:
# Let's Encrypt vernieuwt het elke twee maanden, de herstart bij een uitrol neemt
# het mee. Daarna draait radiusd op de voorgrond, log naar stdout.
set -e
export PATH=/opt/sbin:/opt/bin:$PATH

if [ -z "$NETWERK_RADIUS_TOKEN" ]; then
	echo "NETWERK_RADIUS_TOKEN ontbreekt: wifi-server slaapt"
	while true; do sleep 3600; done
fi

CERT_DIR=/caddy-data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${RADIUS_CERT_HOST:-vps.zekerflex.com}
mkdir -p /certs
if [ -r "$CERT_DIR/${RADIUS_CERT_HOST:-vps.zekerflex.com}.crt" ] && [ -r "$CERT_DIR/${RADIUS_CERT_HOST:-vps.zekerflex.com}.key" ]; then
	cp "$CERT_DIR/${RADIUS_CERT_HOST:-vps.zekerflex.com}.crt" /certs/server.crt
	cp "$CERT_DIR/${RADIUS_CERT_HOST:-vps.zekerflex.com}.key" /certs/server.key
	echo "certificaat van ${RADIUS_CERT_HOST:-vps.zekerflex.com} overgenomen van Caddy"
else
	# geen Caddy-certificaat (nog): een eigen certificaat zodat de dienst start;
	# telefoons waarschuwen dan bij het verbinden
	echo "geen Caddy-certificaat gevonden, eigen certificaat maken"
	openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
		-subj "/CN=${RADIUS_CERT_HOST:-vps.zekerflex.com}" -keyout /certs/server.key -out /certs/server.crt > /dev/null 2>&1
fi
chmod 600 /certs/server.key
chown -R radius:radius /certs 2>/dev/null || true

# controle vóór de start: een kapotte configuratie stopt hier met een duidelijke fout
radiusd -C -l stdout
exec radiusd -f -l stdout
