#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ZekerFlex AI-node — turns a fresh Ubuntu 22.04/24.04 server into the private
# language-model endpoint for the live site (Jarvis, sales motor, chat).
#
#   sudo bash setup.sh ai.zekerflex.com
#
# What it does:
#   - installs Ollama, bound to 127.0.0.1 only (never exposed directly)
#   - installs Caddy in front of it: automatic HTTPS (Let's Encrypt) and a
#     required "Authorization: Bearer <key>" — Ollama has no auth of its own
#   - generates that key (or reuses the one in /etc/zekerflex-ai/key)
#   - firewall: only SSH, HTTP (certificate challenge) and HTTPS open
#   - pulls the models (override with MODEL= FAST_MODEL= EMBED_MODEL=)
#   - prints the exact values to paste into Vercel
#
# Prerequisites: a DNS A-record for the domain pointing at this server.
# Re-running is safe; it keeps the existing key (rotate with --rotate-key).
# ---------------------------------------------------------------------------
set -euo pipefail

DOMAIN="${1:-}"
ROTATE="${2:-}"
EMBED_MODEL="${EMBED_MODEL:-nomic-embed-text}"

# Pick the strongest model that fits the GPU (Qwen 2.5: good Dutch, good at
# following instructions and JSON). Override with MODEL= / FAST_MODEL=.
VRAM_GB=0
if command -v nvidia-smi >/dev/null 2>&1; then
  VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | awk '{s+=$1} END {print s+0}')
  VRAM_GB=$(( ${VRAM_MB:-0} / 1024 ))
fi
if   (( VRAM_GB >= 48 )); then AUTO_MODEL="qwen2.5:72b"; AUTO_FAST="qwen2.5:7b";  TIMEOUT_MS=120000
elif (( VRAM_GB >= 24 )); then AUTO_MODEL="qwen2.5:32b"; AUTO_FAST="qwen2.5:7b";  TIMEOUT_MS=90000
elif (( VRAM_GB >= 16 )); then AUTO_MODEL="qwen2.5:14b"; AUTO_FAST="llama3.2:3b"; TIMEOUT_MS=60000
else                           AUTO_MODEL="qwen2.5:7b";  AUTO_FAST="llama3.2:3b"; TIMEOUT_MS=60000
fi
MODEL="${MODEL:-$AUTO_MODEL}"
FAST_MODEL="${FAST_MODEL:-$AUTO_FAST}"

if [[ -z "$DOMAIN" ]]; then
  echo "Gebruik: sudo bash setup.sh <domein, bv. ai.zekerflex.com> [--rotate-key]" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Draai dit script met sudo." >&2
  exit 1
fi

echo "▸ Videokaart: ${VRAM_GB} GB geheugen → hoofdmodel ${MODEL}, snel model ${FAST_MODEL}"
if (( VRAM_GB == 0 )); then
  echo "  ⚠ Geen NVIDIA-GPU gevonden: het werkt, maar traag en met een klein model. Neem voor de beste kwaliteit een server met 24-48 GB videogeheugen."
fi

echo "▸ Pakketten bijwerken"
apt-get update -qq
apt-get install -y -qq curl ufw openssl debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null

echo "▸ Ollama installeren"
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
mkdir -p /etc/systemd/system/ollama.service.d
cat >/etc/systemd/system/ollama.service.d/zekerflex.conf <<'EOF'
[Service]
# Only reachable through Caddy on this machine.
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_KEEP_ALIVE=30m"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=3"
EOF
systemctl daemon-reload
systemctl enable --now ollama
systemctl restart ollama

echo "▸ Toegangssleutel"
mkdir -p /etc/zekerflex-ai
chmod 700 /etc/zekerflex-ai
if [[ "$ROTATE" == "--rotate-key" || ! -s /etc/zekerflex-ai/key ]]; then
  openssl rand -hex 32 >/etc/zekerflex-ai/key
  echo "  nieuwe sleutel aangemaakt"
fi
chmod 600 /etc/zekerflex-ai/key
KEY="$(cat /etc/zekerflex-ai/key)"

echo "▸ Caddy (HTTPS + sleutelcontrole) installeren"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi
mkdir -p /etc/systemd/system/caddy.service.d
cat >/etc/systemd/system/caddy.service.d/zekerflex.conf <<EOF
[Service]
Environment="ZF_AI_KEY=${KEY}"
EOF
cat >/etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	encode zstd gzip
	@authorized header Authorization "Bearer {\$ZF_AI_KEY}"
	handle @authorized {
		reverse_proxy 127.0.0.1:11434 {
			flush_interval -1
			transport http {
				read_timeout 10m
				write_timeout 10m
			}
		}
	}
	handle {
		respond "Unauthorized" 401
	}
	log {
		output file /var/log/caddy/zekerflex-ai.log
		format console
	}
}
EOF
systemctl daemon-reload
systemctl enable --now caddy
systemctl restart caddy

echo "▸ Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "▸ Modellen downloaden (kan even duren)"
for m in "$MODEL" "$FAST_MODEL" "$EMBED_MODEL"; do
  echo "  ollama pull $m"
  ollama pull "$m"
done

echo "▸ Test"
sleep 3
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${KEY}" "https://${DOMAIN}/v1/models" || true)
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' "https://${DOMAIN}/v1/models" || true)
echo "  met sleutel: HTTP ${CODE} (verwacht 200) · zonder sleutel: HTTP ${NOAUTH} (verwacht 401)"

cat <<EOF

✓ Klaar. Zet deze waarden in Vercel → Project → Settings → Environment Variables
  (Production), en deploy daarna opnieuw:

  LLM_BASE_URL=https://${DOMAIN}/v1
  LLM_API_KEY=${KEY}
  AI_ALLOW_REMOTE=true
  LLM_MODEL=${MODEL}
  LLM_FAST_MODEL=${FAST_MODEL}
  LLM_EMBED_MODEL=${EMBED_MODEL}
  LLM_TIMEOUT_MS=${TIMEOUT_MS}

  Bewaar de sleutel veilig; hij staat ook in /etc/zekerflex-ai/key.
  Sleutel vervangen: sudo bash setup.sh ${DOMAIN} --rotate-key  (en daarna Vercel bijwerken)
EOF
