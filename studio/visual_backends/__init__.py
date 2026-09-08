"""Beeld-backends. `render_shot(shot, brief, path, seconds)` levert een .mp4.

Volgorde van voorkeur (zie config.CAPS.image_backend / video_backend):
  1. video-gen API  (Replicate / Runway)  — echte AI-clips
  2. image-gen API  (OpenAI / Stability)  — AI-stills + Ken Burns
  3. procedural                            — motion-graphics, altijd beschikbaar
"""
from __future__ import annotations

from ..config import CAPS
from ..models import Brief, Shot
from . import procedural


def render_shot(shot: Shot, brief: Brief, path: str, seconds: float) -> str:
    if CAPS.video_backend == "replicate":
        try:
            from . import replicate_video
            return replicate_video.render_shot(shot, brief, path, seconds)
        except Exception as e:  # pragma: no cover - alleen met sleutel
            print(f"    ! video-backend faalde ({e}); val terug op procedural")
    if CAPS.image_backend in ("openai", "stability"):
        try:
            from . import openai_images
            return openai_images.render_shot(shot, brief, path, seconds)
        except Exception as e:  # pragma: no cover
            print(f"    ! image-backend faalde ({e}); val terug op procedural")
    return procedural.render_shot(shot, brief, path, seconds)
