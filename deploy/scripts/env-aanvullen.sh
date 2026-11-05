#!/usr/bin/env bash
# Vult .env.production aan met geheimen die alleen op deze server hoeven te bestaan
# en die niemand hoeft te kiezen: een willekeurige waarde, één keer gemaakt en
# daarna nooit meer veranderd (anders breken gekoppelde diensten). Bestaande
# regels blijven altijd staan, ook lege. Draait aan het begin van elke uitrol
# (deploy/scripts/vps-update.sh) en is veilig om vaker te draaien.
#   SCRAPER_TOKEN          app ↔ browser-werker (deploy/scraper)
#   OUTLINE_SECRET_KEY     kennisbank (Outline), versleuteling van de database
#   OUTLINE_UTILS_SECRET   kennisbank (Outline), interne taken
#   OIDC_OUTLINE_SECRET    het wachtwoord waarmee Outline bij ZekerFlex inlogt (OIDC)
#   METABASE_ADMIN_PASSWORD de beheerder die ZekerFlex in Metabase aanmaakt (lib/bi)
set -eu
ENV_BESTAND="${1:-.env.production}"
[ -f "$ENV_BESTAND" ] || { echo "env-aanvullen: $ENV_BESTAND ontbreekt"; exit 0; }
toegevoegd=0
for naam in SCRAPER_TOKEN OUTLINE_SECRET_KEY OUTLINE_UTILS_SECRET OIDC_OUTLINE_SECRET METABASE_ADMIN_PASSWORD; do
  if ! grep -q "^${naam}=" "$ENV_BESTAND"; then
    # altijd op een nieuwe regel, ook als het bestand niet met een regeleinde eindigt
    [ -z "$(tail -c1 "$ENV_BESTAND")" ] || printf '\n' >> "$ENV_BESTAND"
    printf '%s=%s\n' "$naam" "$(openssl rand -hex 32)" >> "$ENV_BESTAND"
    toegevoegd=$((toegevoegd + 1))
  fi
done
[ "$toegevoegd" -eq 0 ] || echo "env-aanvullen: $toegevoegd geheim(en) toegevoegd aan $ENV_BESTAND"
