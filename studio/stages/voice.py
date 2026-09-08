"""Stage 4 — voice-over per shot + woord-voor-woord timing.

edge-tts (gratis, Microsoft-stemmen) levert echte WordBoundary-events.
ElevenLabs / OpenAI-TTS worden gebruikt als de sleutel gezet is (dan wordt de
woordtiming geschat op basis van lettergrepen).
"""
from __future__ import annotations

import asyncio
import os
import re

from ..config import CAPS, FFMPEG
from ..models import Brief, Script, VoiceLine, WordTime
from ..render_util import media_dur, run as ffrun

_NL_VOICE = {"male": "nl-NL-MaartenNeural", "female": "nl-NL-FennaNeural"}
_EN_VOICE = {"male": "en-US-AndrewNeural", "female": "en-US-AvaNeural"}


def _voice_name(brief: Brief) -> str:
    table = _NL_VOICE if brief.language == "nl" else _EN_VOICE
    return os.environ.get("STUDIO_TTS_VOICE") or table[brief.voice_gender]


def _spoken(text: str) -> str:
    t = text.replace("’", "'").replace("×", " keer ").replace("&", " en ")
    t = re.sub(r"€\s*(\d+),(\d{2})", r"\1 euro \2", t)
    t = re.sub(r"€\s*(\d+)", r"\1 euro", t)
    return re.sub(r"\s+", " ", t).strip()


async def _edge(text: str, voice: str, out_mp3: str) -> list[WordTime]:
    import edge_tts
    words: list[WordTime] = []
    comm = edge_tts.Communicate(text, voice, boundary="WordBoundary")
    with open(out_mp3, "wb") as f:
        async for ch in comm.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                start = ch["offset"] / 1e7
                words.append(WordTime(word=ch["text"], start=start, end=start + ch["duration"] / 1e7))
    return words


def _syllables(w: str) -> int:
    return max(1, len(re.findall(r"[aeiouyàáâäèéêëìíîïòóôöùúûü]+", w.lower())))


def _estimate_words(text: str, dur: float) -> list[WordTime]:
    toks = text.split()
    weights = [_syllables(t) for t in toks]
    total = sum(weights) or 1
    out, t = [], 0.05 * dur
    span = dur * 0.9
    for tok, wgt in zip(toks, weights):
        d = span * wgt / total
        out.append(WordTime(word=tok, start=round(t, 3), end=round(t + d, 3)))
        t += d
    return out


def _elevenlabs(text: str, brief: Brief, out_mp3: str) -> None:  # pragma: no cover
    import json
    import urllib.request
    key = os.environ["ELEVENLABS_API_KEY"]
    vid = os.environ.get("ELEVENLABS_VOICE_ID", "onwK4e9ZLuTAKqWW03F9")
    body = json.dumps({"text": text, "model_id": "eleven_multilingual_v2"}).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
        data=body, headers={"xi-api-key": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r, open(out_mp3, "wb") as f:
        f.write(r.read())


def _synthesize(text: str, brief: Brief, out_mp3: str) -> list[WordTime]:
    if CAPS.voice_backend == "elevenlabs":
        try:
            _elevenlabs(text, brief, out_mp3)
            return _estimate_words(text, media_dur(out_mp3))
        except Exception as e:
            print(f"    ! ElevenLabs faalde ({e}); val terug op edge-tts")
    words = asyncio.run(_edge(text, _voice_name(brief), out_mp3))
    if not words:
        words = _estimate_words(text, media_dur(out_mp3))
    return words


def run(brief: Brief, script: Script, out_dir: str) -> list[VoiceLine]:
    os.makedirs(out_dir, exist_ok=True)
    lines: list[VoiceLine] = []
    for sh in script.shots:
        if not sh.narration.strip():
            continue
        mp3 = os.path.join(out_dir, f"vo_{sh.index:02d}.mp3")
        wav = os.path.join(out_dir, f"vo_{sh.index:02d}.m4a")
        words = _synthesize(_spoken(sh.narration), brief, mp3)
        ffrun([FFMPEG, "-y", "-i", mp3, "-af", "loudnorm=I=-16:TP=-1.5", "-c:a", "aac", "-b:a", "160k", wav])
        dur = media_dur(wav)
        lines.append(VoiceLine(shot_index=sh.index, audio_path=wav, duration=dur, words=words))
        # verleng de shot als de voice-over langer is dan gepland
        sh.seconds = max(sh.seconds, round(dur + 0.6, 2))
    return lines
