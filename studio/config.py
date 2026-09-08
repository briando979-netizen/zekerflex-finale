"""Configuratie + detectie van beschikbare backends.

De studio werkt volledig lokaal (Ollama + edge-tts + PIL/numpy + ffmpeg).
Zodra je API-sleutels in de omgeving zet, schakelen betere backends vanzelf in.
"""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass

import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "projects")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
os.environ.setdefault("IMAGEIO_FFMPEG_EXE", FFMPEG)

FPS = 24
# Werkhoogte voor het renderen; assemble schaalt naar de brief-resolutie.
RENDER_H = int(os.environ.get("STUDIO_RENDER_HEIGHT", "720"))


def work_size(aspect: str) -> tuple[int, int]:
    h = RENDER_H
    if aspect == "9:16":
        return (round(h * 9 / 16 / 2) * 2, h)
    if aspect == "1:1":
        return (h, h)
    return (round(h * 16 / 9 / 2) * 2, h)


def _env(*names: str) -> str | None:
    for n in names:
        v = os.environ.get(n)
        if v:
            return v
    return None


@dataclass
class Capabilities:
    # tekst / redenering
    llm_backend: str = "ollama"          # ollama | openai | anthropic
    llm_model: str = "llama3.1:8b"
    # stem
    voice_backend: str = "edge-tts"      # edge-tts | elevenlabs | openai
    # beeld
    image_backend: str = "procedural"    # procedural | openai | stability
    video_backend: str = "none"          # none | replicate | runway
    # muziek
    music_backend: str = "synth"         # synth | freesound | pixabay
    # referentie-analyse
    ytdlp: bool = False

    def report(self) -> str:
        lines = [
            "ZekerFlex Video Studio — capaciteiten",
            f"  LLM        : {self.llm_backend} ({self.llm_model})",
            f"  Voice-over : {self.voice_backend}",
            f"  Beeld      : {self.image_backend}"
            + (f"  + video: {self.video_backend}" if self.video_backend != "none" else ""),
            f"  Muziek     : {self.music_backend}",
            f"  YouTube    : {'yt-dlp aanwezig' if self.ytdlp else 'alleen lokale videobestanden'}",
            f"  FFmpeg     : {FFMPEG}",
        ]
        return "\n".join(lines)


def detect() -> Capabilities:
    c = Capabilities()

    if _env("ANTHROPIC_API_KEY"):
        c.llm_backend, c.llm_model = "anthropic", os.environ.get("STUDIO_LLM_MODEL", "claude-sonnet-5")
    elif _env("OPENAI_API_KEY") or _env("LLM_BASE_URL"):
        c.llm_backend, c.llm_model = "openai", os.environ.get("STUDIO_LLM_MODEL", "gpt-4o-mini")
    else:
        c.llm_model = os.environ.get("STUDIO_LLM_MODEL", "llama3.1:8b")

    if _env("ELEVENLABS_API_KEY"):
        c.voice_backend = "elevenlabs"
    elif _env("OPENAI_API_KEY") and os.environ.get("STUDIO_VOICE") == "openai":
        c.voice_backend = "openai"

    if _env("REPLICATE_API_TOKEN"):
        c.video_backend = "replicate"
    if os.environ.get("RUNWAY_API_SECRET"):
        c.video_backend = "runway"

    if _env("STABILITY_API_KEY"):
        c.image_backend = "stability"
    elif _env("OPENAI_API_KEY"):
        c.image_backend = "openai"

    if _env("FREESOUND_API_KEY"):
        c.music_backend = "freesound"
    elif _env("PIXABAY_API_KEY"):
        c.music_backend = "pixabay"

    c.ytdlp = shutil.which("yt-dlp") is not None or _try_import("yt_dlp")
    return c


def _try_import(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


CAPS = detect()
