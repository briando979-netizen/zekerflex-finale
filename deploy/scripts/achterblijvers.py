#!/usr/bin/env python3
"""Achterblijvers van eerdere uitrollen in quarantaine zetten.

git archive / tar xzf voegt bestanden toe maar wist niets: een in git verwijderd
bestand bleef op de server staan, en Next serveert een public-bestand vóór een
route (zo bleef public/.well-known/assetlinks.json live na zijn vervanging).

Leest op stdin de bestanden die er horen te zijn, en verplaatst elk bestand in
app/, components/, lib/, public/, prisma/ of types/ dat daar niet in staat naar
~/zekerflex-weg/<tijd>/ (terugzetten = terugverplaatsen). In die mappen komt alles
uit git; .env.production, back-ups en Caddy-sites staan erbuiten en blijven altijd.
Zijn het er meer dan 50, dan doet het niets (exit 3): dat past niet bij
achterblijvers, eerder bij een verkeerde lijst.

Vanuit ~/zekerflex, na het uitpakken en vóór het bouwen:
  tar tzf /tmp/zf.tar.gz | python3 deploy/scripts/achterblijvers.py
  git -C ~/.zf-bron ls-tree -r -z --name-only <commit> | python3 deploy/scripts/achterblijvers.py
De live-zetter (deploy/bouwer/zf-live.py) doet het tweede zelf.
"""
from __future__ import annotations

import os
import shutil
import sys
from datetime import datetime, timezone

CODEMAPPEN = ("app", "components", "lib", "public", "prisma", "types")
MAX_OPRUIMEN = 50


def lees_lijst(ruw: str) -> set[str]:
    """Regels of NUL-gescheiden; zonder ./-voorvoegsel; mappen (eindigen op /) tellen niet."""
    delen = ruw.split("\0") if "\0" in ruw else ruw.splitlines()
    uit = set()
    for d in delen:
        d = d.strip().replace("\\", "/")
        while d.startswith("./"):
            d = d[2:]
        if d and not d.endswith("/"):
            uit.add(d)
    return uit


def achterblijvers(boom: str, horen_er: set[str]) -> list[str]:
    weg = []
    for map_ in CODEMAPPEN:
        for root, _dirs, files in os.walk(os.path.join(boom, map_)):
            for naam in files:
                rel = os.path.relpath(os.path.join(root, naam), boom).replace(os.sep, "/")
                if rel not in horen_er:
                    weg.append(rel)
    return sorted(weg)


def main() -> int:
    boom = os.environ.get("ZF_DIR", os.getcwd())
    quarantaine = os.environ.get("ZF_QUARANTAINE", os.path.expanduser("~/zekerflex-weg"))
    horen_er = lees_lijst(sys.stdin.read())
    if not any(p.split("/", 1)[0] in CODEMAPPEN for p in horen_er):
        print("!! de lijst bevat geen codebestanden; niets gedaan")
        return 2
    weg = achterblijvers(boom, horen_er)
    if not weg:
        return 0
    if len(weg) > MAX_OPRUIMEN:
        print(f"!! {len(weg)} bestanden staan niet in de lijst; te veel om veilig op te ruimen, niets gedaan")
        return 3
    map_weg = os.path.join(quarantaine, datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S"))
    for rel in weg:
        naar = os.path.join(map_weg, rel)
        os.makedirs(os.path.dirname(naar), exist_ok=True)
        shutil.move(os.path.join(boom, rel), naar)
        print(f"achterblijver weggezet: {rel}")
    print(f"{len(weg)} achterblijver(s) staan in {map_weg} (terugzetten = terugverplaatsen)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
