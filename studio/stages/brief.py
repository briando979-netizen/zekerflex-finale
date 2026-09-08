"""Stage 1 — losse prompt -> gestructureerde Brief."""
from __future__ import annotations

import re

from ..llm import complete_json
from ..models import Brief, StyleProfile

_SYS = """Je bent een creatief directeur. Zet het verzoek van de klant om in een strak productieplan.
Geef een JSON-object met exact deze sleutels:
  title          korte pakkende titel (NL)
  subject        waar de video over gaat (1 zin, NL)
  style          één van: cinematic, animation, kinetic, product, docu
  mood           één van: warm, epic, calm, playful, tense, corporate
  voice_gender   "male" of "female"
  duration_s     geheel getal seconden
  aspect         "16:9", "9:16" of "1:1"
  audience       doelgroep (NL)
  cta            afsluitende call-to-action of slogan (NL, mag leeg)
  palette        lijst van 0-4 hex-kleuren als de klant kleuren noemt, anders []
  notes          extra regie-aanwijzingen (NL, mag leeg)
Kies verstandige defaults als iets niet genoemd is (duur 45s, 16:9, cinematic, warm)."""


def _fallback_duration(prompt: str) -> int | None:
    m = re.search(r"(\d{1,3})\s*(seconden|sec|s|minuten|min|minuut)", prompt, re.I)
    if not m:
        return None
    n = int(m.group(1))
    return n * 60 if m.group(2).lower().startswith("min") else n


def run(prompt: str, style_profile: StyleProfile | None = None) -> Brief:
    extra = ""
    if style_profile:
        extra = (f"\n\nDe klant wil het tempo/stijl van een referentievideo overnemen: "
                 f"gemiddelde shotlengte {style_profile.avg_shot_s:.1f}s, "
                 f"{style_profile.cuts_per_min:.0f} cuts/min, bewegingsenergie {style_profile.motion_energy:.2f}. "
                 f"Palet: {', '.join(style_profile.palette)}.")
    data = complete_json(_SYS, f"Verzoek van de klant:\n\"{prompt}\"{extra}")

    def _pick(key, options, default):
        v = str(data.get(key, "")).strip().lower()
        return v if v in options else default

    b = Brief(
        prompt=prompt,
        title=str(data.get("title") or "Naamloos project").strip(),
        subject=str(data.get("subject") or prompt).strip(),
        style=_pick("style", {"cinematic", "animation", "kinetic", "product", "docu"}, "cinematic"),
        mood=_pick("mood", set("warm epic calm playful tense corporate".split()), "warm"),
        voice_gender=_pick("voice_gender", {"male", "female"}, "male"),
        duration_s=int(data.get("duration_s") or _fallback_duration(prompt) or 45),
        aspect=str(data.get("aspect") or "16:9") if str(data.get("aspect")) in ("16:9", "9:16", "1:1") else "16:9",
        audience=str(data.get("audience") or "algemeen publiek").strip(),
        cta=str(data.get("cta") or "").strip(),
        palette=[c for c in (data.get("palette") or []) if isinstance(c, str) and re.match(r"#?[0-9a-fA-F]{6}$", c)][:4],
        notes=str(data.get("notes") or "").strip(),
    )
    b.palette = [c if c.startswith("#") else "#" + c for c in b.palette]
    if style_profile and style_profile.palette and not b.palette:
        b.palette = style_profile.palette[:4]
    b.duration_s = max(10, min(b.duration_s, 300))
    return b
