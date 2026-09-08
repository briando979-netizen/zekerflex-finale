"""Stage 3 — Brief (+ research, + referentie-tempo) -> getimed scenescript."""
from __future__ import annotations

from ..llm import complete_json
from ..models import Brief, Script, Shot, StyleProfile

_WORDS_PER_SEC = 2.5      # gemiddeld Nederlands spreektempo
_DEFAULT_SHOT_S = {"cinematic": 5.0, "docu": 5.5, "animation": 4.0, "product": 4.0, "kinetic": 2.6}

_SYS = """Je bent scenarioschrijver + storyboard-artiest. Lever een JSON-object:
{
  "title": "...",
  "logline": "één zin die de video samenvat (NL)",
  "shots": [
    {
      "narration": "gesproken voice-over voor deze shot (NL, kan leeg zijn voor een pure sfeershot)",
      "visual": "visuele beschrijving in het ENGELS, concreet en filmisch, één zin",
      "on_screen_text": "korte tekst in beeld (NL, meestal leeg; alleen bij kernboodschap of eindkaart)",
      "motion": "slow-push | pan-left | pan-right | static | whip | orbit"
    }
  ]
}
Regels:
- Precies {n_shots} shots.
- De voice-over samen is ongeveer {word_budget} woorden (niet meer).
- Shot 1 opent sterk (haak). De laatste shot bevat de call-to-action / slogan in on_screen_text.
- 'visual' bevat NOOIT tekst-instructies of woorden die in beeld moeten; dat hoort in on_screen_text.
- Bouw een boog: haak -> ontwikkeling -> climax -> uitsmijter."""


def _shot_count(brief: Brief, prof: StyleProfile | None) -> tuple[int, float]:
    avg = prof.avg_shot_s if prof and prof.avg_shot_s > 0.8 else _DEFAULT_SHOT_S.get(brief.style, 4.5)
    n = max(3, round(brief.duration_s / avg))
    return n, avg


def run(brief: Brief, research: str = "", prof: StyleProfile | None = None) -> Script:
    n_shots, avg = _shot_count(brief, prof)
    word_budget = int(brief.duration_s * _WORDS_PER_SEC * 0.82)

    sys = _SYS.replace("{n_shots}", str(n_shots)).replace("{word_budget}", str(word_budget))
    user = (
        f"Titel-idee: {brief.title}\nOnderwerp: {brief.subject}\n"
        f"Stijl: {brief.style} | sfeer: {brief.mood} | doelgroep: {brief.audience}\n"
        f"Doelduur: {brief.duration_s}s | beeldverhouding: {brief.aspect}\n"
        f"Call-to-action / slogan: {brief.cta or '(verzin een passende)'}\n"
        f"Regie-notities: {brief.notes or '-'}\n\n"
        f"Research:\n{research or '(geen)'}"
    )
    data = complete_json(sys, user, max_tokens=2200, temperature=0.8)

    raw_shots = data.get("shots") or []
    if not raw_shots:
        raise ValueError("script-stage gaf geen shots terug")

    shots: list[Shot] = []
    for i, s in enumerate(raw_shots):
        shots.append(Shot(
            index=i,
            narration=str(s.get("narration") or "").strip(),
            visual=str(s.get("visual") or "abstract atmospheric background").strip(),
            on_screen_text=str(s.get("on_screen_text") or "").strip(),
            motion=str(s.get("motion") or "slow-push").strip().lower()
            if str(s.get("motion", "")).strip().lower() in
            {"slow-push", "pan-left", "pan-right", "static", "whip", "orbit"} else "slow-push",
        ))

    # duur per shot: op de voice-over als er tekst is, anders vaste sfeerduur
    for sh in shots:
        wc = len(sh.narration.split())
        sh.seconds = round(max(2.2, wc / _WORDS_PER_SEC + 0.9) if wc else min(avg, 3.5), 2)

    # schaal het geheel naar de doelduur (± redelijk)
    total = sum(sh.seconds for sh in shots)
    if total > 0:
        factor = brief.duration_s / total
        if 0.6 < factor < 1.8:
            for sh in shots:
                sh.seconds = round(sh.seconds * factor, 2)

    if brief.cta and shots and not shots[-1].on_screen_text:
        shots[-1].on_screen_text = brief.cta

    return Script(
        title=str(data.get("title") or brief.title).strip(),
        logline=str(data.get("logline") or brief.subject).strip(),
        shots=shots,
    )
