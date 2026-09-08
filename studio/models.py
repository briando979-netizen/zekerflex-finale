"""Datastructuren voor de videostudio-pijplijn.

Alles is JSON-serialiseerbaar zodat een project volledig in
`projects/<slug>/manifest.json` bewaard en hervat kan worden.
"""
from __future__ import annotations

import dataclasses
import json
from dataclasses import dataclass, field
from typing import Any


def _asdict(obj: Any) -> Any:
    if dataclasses.is_dataclass(obj):
        return {k: _asdict(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, list):
        return [_asdict(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _asdict(v) for k, v in obj.items()}
    return obj


# --------------------------------------------------------------------------- #
#  Brief — het gestructureerde plan uit de losse prompt
# --------------------------------------------------------------------------- #
@dataclass
class Brief:
    prompt: str
    title: str = ""
    subject: str = ""
    # visuele stijl: "cinematic" | "animation" | "kinetic" | "product" | "docu"
    style: str = "cinematic"
    mood: str = "warm"                 # warm | epic | calm | playful | tense | corporate
    language: str = "nl"
    voice_gender: str = "male"         # male | female
    duration_s: int = 60
    aspect: str = "16:9"              # 16:9 | 9:16 | 1:1
    palette: list[str] = field(default_factory=list)   # hex, optioneel
    audience: str = "algemeen publiek"
    cta: str = ""                     # slot-tekst voor de eindkaart
    notes: str = ""

    @property
    def size(self) -> tuple[int, int]:
        return {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}[self.aspect]


# --------------------------------------------------------------------------- #
#  Script — scene voor scene
# --------------------------------------------------------------------------- #
@dataclass
class Shot:
    index: int
    narration: str                    # gesproken tekst (leeg = stille shot)
    visual: str                       # visuele regie in het Engels (voor image/video-gen)
    on_screen_text: str = ""          # kinetische tekst / lower-third
    seconds: float = 4.0              # streefduur; wordt bijgesteld op de VO
    motion: str = "slow-push"         # slow-push | pan-left | pan-right | static | whip | orbit
    palette: list[str] = field(default_factory=list)


@dataclass
class Script:
    title: str
    logline: str
    shots: list[Shot] = field(default_factory=list)

    @property
    def total_seconds(self) -> float:
        return sum(s.seconds for s in self.shots)


# --------------------------------------------------------------------------- #
#  Voice-over resultaat
# --------------------------------------------------------------------------- #
@dataclass
class WordTime:
    word: str
    start: float
    end: float


@dataclass
class VoiceLine:
    shot_index: int
    audio_path: str
    duration: float
    words: list[WordTime] = field(default_factory=list)


# --------------------------------------------------------------------------- #
#  StyleProfile — geabstraheerd uit een referentievideo
#  (nooit beeld/audio zelf, alleen ritme- en kleurparameters)
# --------------------------------------------------------------------------- #
@dataclass
class StyleProfile:
    source: str = ""
    duration_s: float = 0.0
    avg_shot_s: float = 3.0
    shot_s_stddev: float = 1.0
    cuts_per_min: float = 20.0
    motion_energy: float = 0.5        # 0 rustig .. 1 hectisch
    text_density: float = 0.3         # aandeel frames met on-screen tekst
    palette: list[str] = field(default_factory=list)
    loudness_curve: list[float] = field(default_factory=list)   # genormaliseerd 0..1 per ~2s
    tempo_bpm: float = 100.0
    notes: str = ""


# --------------------------------------------------------------------------- #
#  Manifest — de volledige projecttoestand
# --------------------------------------------------------------------------- #
STAGES = ["brief", "reference", "research", "script", "voice", "music", "visuals", "subtitles", "assemble"]


@dataclass
class Manifest:
    slug: str
    prompt: str
    created_at: str
    brief: Brief | None = None
    style_profile: StyleProfile | None = None
    research: str = ""
    script: Script | None = None
    voice: list[VoiceLine] = field(default_factory=list)
    music_path: str = ""
    shot_clips: list[str] = field(default_factory=list)   # per shot een mp4
    subtitle_path: str = ""
    outputs: dict[str, str] = field(default_factory=dict)  # "16:9" -> pad
    done: list[str] = field(default_factory=list)          # afgeronde stages
    log: list[str] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(_asdict(self), indent=2, ensure_ascii=False)

    @classmethod
    def load(cls, path: str) -> "Manifest":
        raw = json.loads(open(path, encoding="utf-8").read())
        m = cls(slug=raw["slug"], prompt=raw["prompt"], created_at=raw["created_at"])
        if raw.get("brief"):
            m.brief = Brief(**raw["brief"])
        if raw.get("style_profile"):
            m.style_profile = StyleProfile(**raw["style_profile"])
        m.research = raw.get("research", "")
        if raw.get("script"):
            sc = raw["script"]
            m.script = Script(
                title=sc["title"], logline=sc["logline"],
                shots=[Shot(**s) for s in sc["shots"]],
            )
        m.voice = [
            VoiceLine(
                shot_index=v["shot_index"], audio_path=v["audio_path"], duration=v["duration"],
                words=[WordTime(**w) for w in v.get("words", [])],
            )
            for v in raw.get("voice", [])
        ]
        m.music_path = raw.get("music_path", "")
        m.shot_clips = raw.get("shot_clips", [])
        m.subtitle_path = raw.get("subtitle_path", "")
        m.outputs = raw.get("outputs", {})
        m.done = raw.get("done", [])
        m.log = raw.get("log", [])
        return m
