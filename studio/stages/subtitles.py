"""Stage — woord-voor-woord ondertitels (ASS karaoke) uit de VO-timing."""
from __future__ import annotations

import os

from ..models import Brief, Script, VoiceLine, WordTime
from ..render_util import hex_rgb, palette_for


def _ass_colour(hex_str: str, alpha: int = 0) -> str:
    r, g, b = hex_rgb(hex_str)
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"


def _ts(s: float) -> str:
    s = max(0.0, s)
    h = int(s // 3600)
    m = int(s % 3600 // 60)
    sec = s % 60
    return f"{h:d}:{m:02d}:{sec:05.2f}"


def _phrases(words: list[WordTime], max_words: int = 5, max_gap: float = 0.6):
    group: list[WordTime] = []
    for w in words:
        if group and (len(group) >= max_words or w.start - group[-1].end > max_gap):
            yield group
            group = []
        group.append(w)
    if group:
        yield group


def build(brief: Brief, script: Script, voice: list[VoiceLine], shot_starts: dict[int, float],
          out_path: str, time_offset: float = 0.0) -> str:
    w, h = brief.size
    pal = palette_for(brief.mood, brief.palette)
    active = _ass_colour(pal[-1])          # PrimaryColour  — al uitgesproken / actief
    upcoming = _ass_colour("#FFFFFF")      # SecondaryColour — nog te komen
    outline = _ass_colour("#000000")
    back = _ass_colour("#000000", alpha=0xA0)
    fs = int(h * (0.062 if brief.aspect != "9:16" else 0.05))
    mv = int(h * (0.12 if brief.aspect != "9:16" else 0.22))

    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Segoe UI,{fs},{active},{upcoming},{outline},{back},1,0,0,0,100,100,0.5,0,1,3,1,2,80,80,{mv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events: list[str] = []
    for line in voice:
        base = time_offset + shot_starts.get(line.shot_index, 0.0) + 0.15
        for phrase in _phrases(line.words):
            start = base + phrase[0].start
            end = base + phrase[-1].end + 0.15
            parts = []
            for i, wd in enumerate(phrase):
                nxt = phrase[i + 1].start if i + 1 < len(phrase) else wd.end
                k = max(1, round((nxt - wd.start) * 100))
                parts.append(f"{{\\k{k}}}{wd.word}")
            events.append(f"Dialogue: 0,{_ts(start)},{_ts(end)},Caption,,0,0,0,,{' '.join(parts)}")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(head + "\n".join(events) + "\n")
    return out_path
