"""Gereedschapskist voor een assistent die de studio aanstuurt.

Elke functie is één stap die los aangeroepen, geïnspecteerd en bijgestuurd kan
worden. Bedoeld om door een LLM-agent gebruikt te worden ("creatief directeur"),
of handmatig in een REPL.

    from studio.agent import *
    p = start("maak een 30s uitlegvideo over composteren", aspect="9:16")
    plan(p)                      # brief tonen / aanpassen
    write_script(p)              # storyboard
    edit_shot(p, 2, narration="...", visual="...")
    produce(p)                   # voice + muziek + beeld + montage
"""
from __future__ import annotations

import json
from dataclasses import asdict

from .director import Director
from .models import Brief, Shot

_SESSIONS: dict[str, Director] = {}


def start(prompt: str, *, slug: str | None = None, reference: str | None = None,
          aspect: str | None = None, duration: int | None = None) -> str:
    d = Director(prompt, slug=slug, reference=reference)
    _SESSIONS[d.slug] = d
    if reference:
        d.stage_reference()
    d.stage_brief()
    if aspect:
        d.m.brief.aspect = aspect  # type: ignore[union-attr]
    if duration:
        d.m.brief.duration_s = duration  # type: ignore[union-attr]
    d._save()
    return d.slug


def _d(slug: str) -> Director:
    if slug not in _SESSIONS:
        _SESSIONS[slug] = Director("", slug=slug)
    return _SESSIONS[slug]


def plan(slug: str) -> dict:
    """De huidige brief als bewerkbaar dict."""
    b = _d(slug).m.brief
    return asdict(b) if b else {}


def set_brief(slug: str, **fields) -> dict:
    d = _d(slug)
    assert d.m.brief
    for k, v in fields.items():
        if hasattr(d.m.brief, k):
            setattr(d.m.brief, k, v)
    d._save()
    return asdict(d.m.brief)


def research(slug: str) -> str:
    d = _d(slug)
    d.stage_research()
    return d.m.research


def write_script(slug: str, force: bool = True) -> dict:
    d = _d(slug)
    d.stage_research()
    d.stage_script(force=force)
    return _script_dict(d)


def _script_dict(d: Director) -> dict:
    s = d.m.script
    assert s
    return {"title": s.title, "logline": s.logline,
            "shots": [asdict(sh) for sh in s.shots], "total_seconds": round(s.total_seconds, 1)}


def show_script(slug: str) -> dict:
    return _script_dict(_d(slug))


def edit_shot(slug: str, index: int, **fields) -> dict:
    d = _d(slug)
    assert d.m.script
    sh = next(s for s in d.m.script.shots if s.index == index)
    for k, v in fields.items():
        if hasattr(sh, k):
            setattr(sh, k, v)
    # 'voice', 'visuals', 'subtitles', 'assemble' opnieuw nodig
    for st in ("voice", "music", "visuals", "subtitles", "assemble"):
        if st in d.m.done:
            d.m.done.remove(st)
    d._save()
    return _script_dict(d)


def add_shot(slug: str, after_index: int, narration: str, visual: str,
             on_screen_text: str = "", motion: str = "slow-push", seconds: float = 4.0) -> dict:
    d = _d(slug)
    assert d.m.script
    shots = d.m.script.shots
    new = Shot(index=0, narration=narration, visual=visual, on_screen_text=on_screen_text,
              motion=motion, seconds=seconds)
    pos = next((i for i, s in enumerate(shots) if s.index == after_index), len(shots) - 1) + 1
    shots.insert(pos, new)
    for i, s in enumerate(shots):
        s.index = i
    for st in ("voice", "music", "visuals", "subtitles", "assemble"):
        if st in d.m.done:
            d.m.done.remove(st)
    d._save()
    return _script_dict(d)


def produce(slug: str, force: bool = False) -> str:
    """Voice-over + muziek + beeld + ondertitels + montage."""
    d = _d(slug)
    for st in ("voice", "music", "visuals", "subtitles", "assemble"):
        getattr(d, f"stage_{st}")(force=force)
    return d.m.outputs.get(d.m.brief.aspect, "")  # type: ignore[union-attr]


def make(prompt: str, *, slug: str | None = None, reference: str | None = None,
         aspect: str | None = None, duration: int | None = None) -> str:
    """Alles in één keer: brief → script → productie → montage."""
    d = Director(prompt, slug=slug, reference=reference)
    _SESSIONS[d.slug] = d
    d.stage_reference()
    d.stage_brief()
    if aspect and d.m.brief:
        d.m.brief.aspect = aspect
    if duration and d.m.brief:
        d.m.brief.duration_s = duration
    d._save()
    return d.run()


def status(slug: str) -> dict:
    d = _d(slug)
    return {"slug": d.slug, "done": d.m.done, "outputs": d.m.outputs,
            "shots": len(d.m.script.shots) if d.m.script else 0,
            "dir": d.dir}
