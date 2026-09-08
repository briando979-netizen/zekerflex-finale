"""CLI:

  python -m studio "maak een 60 seconden Pixar-achtige film over een eenzame banaan"
  python -m studio "cinematische advertentie over een neurale interface" --aspect 9:16
  python -m studio "video over quantum computing" --reference https://youtu.be/XXXX
  python -m studio --resume eenzame-banaan --stage script --force
  python -m studio --caps
"""
from __future__ import annotations

import argparse
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except Exception:
        pass

from .config import CAPS
from .director import Director


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="studio", description="ZekerFlex Video Studio")
    p.add_argument("prompt", nargs="?", help="opdracht in gewoon Nederlands")
    p.add_argument("--reference", "-r", help="YouTube-URL of lokaal videobestand als stijlreferentie")
    p.add_argument("--aspect", choices=["16:9", "9:16", "1:1"], help="forceer beeldverhouding")
    p.add_argument("--duration", type=int, help="forceer duur in seconden")
    p.add_argument("--slug", help="projectnaam (map onder studio/projects/)")
    p.add_argument("--resume", help="hervat een bestaand project op slug")
    p.add_argument("--stage", help="draai alleen deze fase", choices=Director.ORDER)
    p.add_argument("--upto", help="stop na deze fase", choices=Director.ORDER)
    p.add_argument("--force", action="store_true", help="negeer eerder afgeronde fases")
    p.add_argument("--caps", action="store_true", help="toon beschikbare backends en stop")
    a = p.parse_args(argv)

    if a.caps:
        print(CAPS.report())
        return 0

    if a.resume:
        d = Director("", slug=a.resume, reference=a.reference)
        d.prompt = d.m.prompt
    elif a.prompt:
        d = Director(a.prompt, slug=a.slug, reference=a.reference)
    else:
        p.print_help()
        return 1

    # overrides pas toepassen nadat de brief bestaat
    if a.aspect or a.duration:
        d.stage_reference()
        d.stage_brief()
        if a.aspect:
            d.m.brief.aspect = a.aspect          # type: ignore[union-attr]
        if a.duration:
            d.m.brief.duration_s = a.duration    # type: ignore[union-attr]
        d._save()

    d.run(upto=a.upto, only=a.stage, force=a.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
