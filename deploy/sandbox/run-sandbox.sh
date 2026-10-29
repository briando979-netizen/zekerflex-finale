#!/usr/bin/env bash
# Eigen wegwerp-sandbox: draai (mogelijk onvertrouwde / AI-gegenereerde) code in
# een dichtgetimmerde, kortstondige container — geen cloud-sandboxdienst nodig.
# De huidige map wordt READ-ONLY gemount op /work; schrijven kan alleen in /tmp.
#
# Gebruik:
#   ./run-sandbox.sh python3 script.py
#   echo 'print(1+1)' | ./run-sandbox.sh python3 -
#   SANDBOX_IMAGE=zf-sandbox SANDBOX_NETWORK=none ./run-sandbox.sh node app.js
#
# Knoppen (env): SANDBOX_IMAGE, SANDBOX_NETWORK (default none), SANDBOX_MEM,
# SANDBOX_CPUS, SANDBOX_TIMEOUT (seconden).
set -euo pipefail

IMAGE="${SANDBOX_IMAGE:-python:3.12-slim}"
NETWORK="${SANDBOX_NETWORK:-none}"
MEM="${SANDBOX_MEM:-512m}"
CPUS="${SANDBOX_CPUS:-1}"
TIMEOUT="${SANDBOX_TIMEOUT:-30}"

if [ "$#" -eq 0 ]; then
  echo "run-sandbox: geef een commando op, bv. ./run-sandbox.sh python3 script.py" >&2
  exit 2
fi

# Sterkere isolatie met gVisor (runsc) als die beschikbaar is; anders gewone runc.
runtime_args=()
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q '"runsc"'; then
  runtime_args+=(--runtime=runsc)
fi

exec docker run --rm -i \
  "${runtime_args[@]}" \
  --network "$NETWORK" \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --memory "$MEM" --memory-swap "$MEM" \
  --cpus "$CPUS" \
  --pids-limit 256 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user "$(id -u):$(id -g)" \
  --stop-timeout 5 \
  -v "$(pwd):/work:ro" \
  -w /work \
  "$IMAGE" timeout --signal=SIGKILL "$TIMEOUT" "$@"
