"""De 'creatief directeur' — orkestreert de volledige pijplijn.

Elke fase is los aanroepbaar en het project is hervatbaar: de toestand staat in
`projects/<slug>/manifest.json`. Draai opnieuw en afgeronde fases worden
overgeslagen (tenzij force).
"""
from __future__ import annotations

import datetime as _dt
import os
import re

from .config import CAPS, PROJECTS_DIR
from .models import Manifest, Script
from .stages import assemble as _assemble
from .stages import brief as _brief
from .stages import research as _research
from .stages import script as _script
from .stages import subtitles as _subs
from .stages import voice as _voice
from . import reference as _reference
from .visual_backends import render_shot
from .music_backends import score as _score


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (s[:48] or "project")


class Director:
    def __init__(self, prompt: str, slug: str | None = None, reference: str | None = None):
        self.prompt = prompt.strip()
        self.slug = slug or slugify(self.prompt)
        self.reference = reference
        self.dir = os.path.join(PROJECTS_DIR, self.slug)
        for sub in ("", "work", "voice", "clips", "out"):
            os.makedirs(os.path.join(self.dir, sub), exist_ok=True)
        self.manifest_path = os.path.join(self.dir, "manifest.json")
        if os.path.exists(self.manifest_path):
            self.m = Manifest.load(self.manifest_path)
            if reference:
                self.reference = reference
        else:
            self.m = Manifest(
                slug=self.slug, prompt=self.prompt,
                created_at=_dt.datetime.now().isoformat(timespec="seconds"),
            )
        self._save()

    # -- infrastructuur ---------------------------------------------------
    def _save(self) -> None:
        with open(self.manifest_path, "w", encoding="utf-8") as f:
            f.write(self.m.to_json())

    def _log(self, msg: str) -> None:
        print(f"  · {msg}", flush=True)
        self.m.log.append(f"{_dt.datetime.now().strftime('%H:%M:%S')} {msg}")
        self._save()

    def _need(self, stage: str, force: bool) -> bool:
        return force or stage not in self.m.done

    def _mark(self, stage: str) -> None:
        if stage not in self.m.done:
            self.m.done.append(stage)
        self._save()

    def _shot_starts(self) -> dict[int, float]:
        assert self.m.script
        starts, t = {}, 0.0
        for sh in self.m.script.shots:
            starts[sh.index] = t
            t += sh.seconds
        return starts

    # -- fases ----------------------------------------------------------
    def stage_reference(self, force: bool = False) -> None:
        if not self.reference:
            return
        if not self._need("reference", force):
            return
        self._log(f"referentie analyseren: {self.reference}")
        self.m.style_profile = _reference.analyse(self.reference)
        self._log(f"  → {self.m.style_profile.avg_shot_s}s/shot, "
                  f"{self.m.style_profile.cuts_per_min}/min, tempo {self.m.style_profile.tempo_bpm} bpm")
        self._mark("reference")

    def stage_brief(self, force: bool = False) -> None:
        if not self._need("brief", force):
            return
        self._log("brief opstellen")
        self.m.brief = _brief.run(self.prompt, self.m.style_profile)
        b = self.m.brief
        self._log(f"  → \"{b.title}\" · {b.style}/{b.mood} · {b.duration_s}s · {b.aspect}")
        self._mark("brief")

    def stage_research(self, force: bool = False) -> None:
        if not self._need("research", force):
            return
        assert self.m.brief
        self._log("onderzoek")
        self.m.research = _research.run(self.m.brief)
        self._mark("research")

    def stage_script(self, force: bool = False) -> None:
        if not self._need("script", force):
            return
        assert self.m.brief
        self._log("script + storyboard")
        self.m.script = _script.run(self.m.brief, self.m.research, self.m.style_profile)
        self._log(f"  → {len(self.m.script.shots)} shots, ~{self.m.script.total_seconds:.0f}s")
        self._mark("script")

    def stage_voice(self, force: bool = False) -> None:
        if not self._need("voice", force):
            return
        assert self.m.brief and self.m.script
        self._log(f"voice-over ({CAPS.voice_backend})")
        self.m.voice = _voice.run(self.m.brief, self.m.script, os.path.join(self.dir, "voice"))
        self._log(f"  → {len(self.m.voice)} regels ingesproken")
        self._mark("voice")

    def stage_music(self, force: bool = False) -> None:
        if not self._need("music", force):
            return
        assert self.m.brief and self.m.script
        self._log(f"muziek ({CAPS.music_backend})")
        dur = self.m.script.total_seconds + _assemble.TITLE_LEAD + _assemble.END_S
        path = os.path.join(self.dir, "work", "music.m4a")
        self.m.music_path = _score(self.m.brief, path, dur)
        self._mark("music")

    def stage_visuals(self, force: bool = False) -> None:
        if not self._need("visuals", force):
            return
        assert self.m.brief and self.m.script
        self._log(f"beeld genereren ({CAPS.image_backend}"
                  f"{'/' + CAPS.video_backend if CAPS.video_backend != 'none' else ''})")
        clips = []
        for sh in self.m.script.shots:
            out = os.path.join(self.dir, "clips", f"shot_{sh.index:02d}.mp4")
            self._log(f"  shot {sh.index + 1}/{len(self.m.script.shots)} ({sh.seconds:.1f}s) {sh.motion}")
            render_shot(sh, self.m.brief, out, sh.seconds)
            clips.append(out)
        self.m.shot_clips = clips
        self._mark("visuals")

    def stage_subtitles(self, force: bool = False) -> None:
        if not self._need("subtitles", force):
            return
        assert self.m.brief and self.m.script
        self._log("woord-voor-woord ondertitels")
        out = os.path.join(self.dir, "work", "subs.ass")
        _subs.build(self.m.brief, self.m.script, self.m.voice, self._shot_starts(), out,
                    time_offset=_assemble.TITLE_LEAD)
        self.m.subtitle_path = out
        self._mark("subtitles")

    def stage_assemble(self, force: bool = False) -> None:
        if not self._need("assemble", force):
            return
        assert self.m.brief and self.m.script
        self._log("monteren met FFmpeg")
        self.m.outputs = _assemble.run_stage(
            self.m.brief, self.m.script, self.m.shot_clips, self.m.voice,
            self.m.music_path, self.m.subtitle_path, self._shot_starts(),
            os.path.join(self.dir, "work"), os.path.join(self.dir, "out"),
        )
        self._mark("assemble")

    # -- volledige run ------------------------------------------------
    ORDER = ["reference", "brief", "research", "script", "voice", "music", "visuals", "subtitles", "assemble"]

    def run(self, upto: str | None = None, only: str | None = None, force: bool = False) -> str:
        print(f"\n🎬  ZekerFlex Video Studio  —  \"{self.prompt}\"\n{CAPS.report()}\n")
        stages = [only] if only else self.ORDER
        for name in stages:
            if upto and self.ORDER.index(name) > self.ORDER.index(upto):
                break
            getattr(self, f"stage_{name}")(force=force or bool(only))
        out = self.m.outputs.get(self.m.brief.aspect) if self.m.brief else None
        if out:
            print(f"\n✅  Klaar: {out}\n")
        self._save()
        return out or ""
