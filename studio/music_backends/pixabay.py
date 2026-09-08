"""Rechtenvrije muziek van Pixabay. Vereist PIXABAY_API_KEY.

Let op: de publieke Pixabay-API dekt afbeeldingen/video; audio loopt via de
site-feed. Deze module gebruikt het (ongedocumenteerde) audio-endpoint en valt
bij problemen terug op de synth-backend.
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

from ..config import FFMPEG
from ..models import Brief
from ..render_util import media_dur, run

_MOOD = {"warm": "warm", "epic": "epic", "calm": "ambient", "playful": "happy",
         "tense": "dark", "corporate": "corporate"}


def fetch(brief: Brief, path: str, seconds: float) -> str:
    key = os.environ["PIXABAY_API_KEY"]
    q = urllib.parse.quote(_MOOD.get(brief.mood, "background"))
    url = f"https://pixabay.com/api/audio/?key={key}&q={q}&per_page=5&order=popular"
    with urllib.request.urlopen(url, timeout=60) as r:
        hits = json.loads(r.read()).get("hits", [])
    if not hits:
        raise RuntimeError("geen resultaten")
    audio_url = hits[0].get("audio") or hits[0]["previewURL"]
    src = path + ".src.mp3"
    with urllib.request.urlopen(audio_url, timeout=120) as r, open(src, "wb") as f:
        f.write(r.read())
    d = media_dur(src) or seconds
    loop = ["-stream_loop", "-1"] if d + 0.5 < seconds else []
    run([FFMPEG, "-y", *loop, "-i", src, "-t", f"{seconds:.3f}",
         "-af", f"afade=t=in:st=0:d=1.5,afade=t=out:st={max(0.0, seconds - 2.0):.2f}:d=2.0,loudnorm=I=-20",
         "-c:a", "aac", "-b:a", "160k", path])
    os.remove(src)
    with open(os.path.join(os.path.dirname(path), "MUSIC_CREDIT.txt"), "w", encoding="utf-8") as f:
        f.write(f"Muziek via Pixabay ({hits[0].get('user', 'onbekend')}) — Pixabay Content License\n")
    return path
