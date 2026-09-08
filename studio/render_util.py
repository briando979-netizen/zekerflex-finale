"""Gedeelde render-helpers: fonts, kleuren, easing, ffmpeg-wrappers."""
from __future__ import annotations

import math
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .config import FFMPEG, FPS

# ---- fonts ---------------------------------------------------------------- #
_FONT_DIRS = ["C:/Windows/Fonts/", "/usr/share/fonts/truetype/dejavu/", "/System/Library/Fonts/"]
_BOLD = ["segoeuib.ttf", "Arialbd.ttf", "DejaVuSans-Bold.ttf", "Helvetica.ttc"]
_REG = ["segoeui.ttf", "Arial.ttf", "DejaVuSans.ttf", "Helvetica.ttc"]


def _find(names: list[str]) -> str:
    for d in _FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return p
    return ""


_BOLD_PATH = _find(_BOLD)
_REG_PATH = _find(_REG)
_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    path = _BOLD_PATH if bold else _REG_PATH
    key = (path, size)
    if key not in _CACHE:
        _CACHE[key] = ImageFont.truetype(path, size) if path else ImageFont.load_default()
    return _CACHE[key]


# ---- kleur / easing ----------------------------------------------------- #
def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def mix(a, b, t: float):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def ease_out(t: float) -> float:
    return 1 - (1 - t) ** 3


def ease_io(t: float) -> float:
    return 3 * t * t - 2 * t * t * t


def clamp(t: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, t))


MOOD_PALETTE = {
    "warm": ["#1b1109", "#7a3b12", "#e0a45f", "#f4e3c8"],
    "epic": ["#05060a", "#122844", "#2f6fb0", "#d7e6f5"],
    "calm": ["#0c1512", "#1f3a34", "#5fc7a8", "#e4f8ef"],
    "playful": ["#1a0b20", "#8b2f6a", "#ff7ac0", "#ffe6f4"],
    "tense": ["#0a0a0c", "#2a1116", "#b83a3a", "#f0d7d7"],
    "corporate": ["#0c0e12", "#0a4b3c", "#4fe0a0", "#f4f5f1"],
}


def palette_for(mood: str, override: list[str] | None) -> list[str]:
    if override and len(override) >= 2:
        return override
    return MOOD_PALETTE.get(mood, MOOD_PALETTE["warm"])


# ---- ffmpeg ------------------------------------------------------------- #
def run(args: list[str]) -> None:
    subprocess.run(args, check=True, capture_output=True)


def media_dur(path: str) -> float:
    out = subprocess.run([FFMPEG, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    import re
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    if not m:
        return 0.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


class Clip:
    """Schrijft frames naar een .mp4 via de gebundelde ffmpeg (rawvideo -> h264)."""

    def __init__(self, path: str, size: tuple[int, int], fps: int = FPS):
        self.path, self.w, self.h, self.fps = path, size[0], size[1], fps
        self.proc = subprocess.Popen(
            [FFMPEG, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{self.w}x{self.h}", "-r", str(fps), "-i", "-",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
             "-pix_fmt", "yuv420p", path],
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

    def add(self, img: Image.Image) -> None:
        if img.size != (self.w, self.h):
            img = img.resize((self.w, self.h), Image.LANCZOS)
        assert self.proc.stdin is not None
        self.proc.stdin.write(np.asarray(img.convert("RGB")).tobytes())

    def close(self) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.close()
        self.proc.wait()


# ---- tekst ------------------------------------------------------------- #
def draw_text(d: ImageDraw.ImageDraw, xy, text: str, fnt, fill, anchor: str = "la", shadow=True):
    if shadow:
        d.text((xy[0] + 2, xy[1] + 3), text, font=fnt, fill=(0, 0, 0, 160), anchor=anchor)
    d.text(xy, text, font=fnt, fill=fill, anchor=anchor)


def wrap(d: ImageDraw.ImageDraw, text: str, fnt, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=fnt) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def vignette(img: Image.Image, strength: float = 0.55) -> Image.Image:
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([-w * 0.25, -h * 0.25, w * 1.25, h * 1.25], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(int(min(w, h) * 0.12)))
    dark = Image.new("RGB", (w, h), (0, 0, 0))
    return Image.composite(img, dark, mask.point(lambda p: int(255 - (255 - p) * strength)))


def grain(img: Image.Image, amount: float = 6.0) -> Image.Image:
    arr = np.asarray(img).astype(np.int16)
    noise = np.random.normal(0, amount, arr.shape[:2])[..., None]
    return Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))
