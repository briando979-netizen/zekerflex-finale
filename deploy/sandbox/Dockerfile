# Optionele sandbox-basis met Python + Node, als non-root. Niet verplicht — de
# runner werkt ook met kale images (python:3.12-slim, node:22-slim). Bouwen:
#   docker build -t zf-sandbox deploy/sandbox
# en dan: SANDBOX_IMAGE=zf-sandbox ./run-sandbox.sh python3 script.py
FROM debian:stable-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 nodejs ca-certificates coreutils \
  && rm -rf /var/lib/apt/lists/*

# Draai standaard als een onbevoorrechte gebruiker (de runner kan dit nog
# overschrijven met --user).
RUN useradd -m -u 10001 sandbox
USER sandbox
WORKDIR /work
