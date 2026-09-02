#!/usr/bin/env bash
# One-time: pull the local models into the Ollama container. Reads LLM_MODEL /
# LLM_FAST_MODEL / LLM_EMBED_MODEL from .env.production. Non-destructive.
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPOSE="docker compose -f docker-compose.prod.yml"

set -a; source .env.production; set +a

for m in "${LLM_MODEL:-qwen2.5:3b}" "${LLM_FAST_MODEL:-llama3.2:1b}" "${LLM_EMBED_MODEL:-nomic-embed-text}"; do
  echo "▸ ollama pull $m"
  $COMPOSE exec -T ollama ollama pull "$m"
done
echo "✓ Modellen gereed:"
$COMPOSE exec -T ollama ollama list
