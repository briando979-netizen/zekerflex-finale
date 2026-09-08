"""Royaltyvrije muziek van Freesound (CC0/CC-BY). Vereist FREESOUND_API_KEY."""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

from ..config import FFMPEG
from ..models import Brief
from ..render_util import media_dur, run

_MOOD_QUERY = {
    "warm": "warm acoustic underscore loop",
    "epic": "epic orchestral cinematic loop",
    "calm": "ambient calm drone loop",
    "playful": "quirky upbeat ukulele loop",
    "tense": "dark tension pulse loop",
    "corporate": "corporate motivational loop",
}


def fetch(brief: Brief, path: str, seconds: float) -> str:
    key = os.environ["FREESOUND_API_KEY"]
    q = _MOOD_QUERY.get(brief.mood, "background music loop")
    params = urllib.parse.urlencode({
        "query": q, "filter": "duration:[20 TO 200] license:(\"Creative Commons 0\" OR \"Attribution\")",
        "sort": "rating_desc", "fields": "id,name,previews,license,username", "page_size": 5,
        "token": key,
    })
    with urllib.request.urlopen("https://freesound.org/apiv2/search/text/?" + params, timeout=60) as r:
        results = json.loads(r.read())["results"]
    if not results:
        raise RuntimeError("geen resultaten")
    hit = results[0]
    prev = hit["previews"]["preview-hq-mp3"]
    src = path + ".src.mp3"
    with urllib.request.urlopen(prev, timeout=120) as r, open(src, "wb") as f:
        f.write(r.read())

    d = media_dur(src) or seconds
    loop = ["-stream_loop", "-1"] if d + 0.5 < seconds else []
    run([FFMPEG, "-y", *loop, "-i", src, "-t", f"{seconds:.3f}",
         "-af", "afade=t=in:st=0:d=1.5,afade=t=out:st=%.2f:d=2.0,loudnorm=I=-20" % max(0.0, seconds - 2.0),
         "-c:a", "aac", "-b:a", "160k", path])
    os.remove(src)
    # bronvermelding wegschrijven naast het project
    with open(os.path.join(os.path.dirname(path), "MUSIC_CREDIT.txt"), "w", encoding="utf-8") as f:
        f.write(f"Muziek: \"{hit['name']}\" door {hit['username']} — Freesound ({hit['license']})\n")
    return path
