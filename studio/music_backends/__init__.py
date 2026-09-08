"""Muziek-backends. `score(brief, path, seconds)` levert een wav/mp3.

  freesound / pixabay  — royaltyvrije track ophalen (met API-sleutel)
  synth                — procedureel gecomponeerde bed, altijd beschikbaar
"""
from __future__ import annotations

from ..config import CAPS
from ..models import Brief
from . import synth


def score(brief: Brief, path: str, seconds: float) -> str:
    if CAPS.music_backend == "freesound":
        try:
            from . import freesound
            return freesound.fetch(brief, path, seconds)
        except Exception as e:  # pragma: no cover
            print(f"    ! freesound faalde ({e}); val terug op synth")
    if CAPS.music_backend == "pixabay":
        try:
            from . import pixabay
            return pixabay.fetch(brief, path, seconds)
        except Exception as e:  # pragma: no cover
            print(f"    ! pixabay faalde ({e}); val terug op synth")
    return synth.score(brief, path, seconds)
