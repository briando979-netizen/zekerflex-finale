"""Procedurele motion-graphics — de altijd-beschikbare beeld-backend.

Geen AI-model nodig: per shot wordt op basis van stijl, beweging, palet en
on-screen tekst een korte geanimeerde clip gerenderd met PIL + numpy.
"""
from __future__ import annotations

import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from ..config import FPS, work_size
from ..models import Brief, Shot
from ..render_util import (
    Clip, clamp, draw_text, ease_io, ease_out, font, grain, hex_rgb, mix,
    palette_for, vignette, wrap,
)


# --------------------------------------------------------------------------- #
def _gradient(size, top, bottom, angle=90):
    w, h = size
    base = Image.new("RGB", (1, h))
    for y in range(h):
        base.putpixel((0, y), mix(top, bottom, y / max(1, h - 1)))
    img = base.resize((w, h))
    if angle != 90:
        img = img.rotate(angle - 90, expand=False, resample=Image.BICUBIC)
    return img


def _blobs(d, size, colors, rnd, n=5, blur=0):
    w, h = size
    for _ in range(n):
        c = rnd.choice(colors)
        r = rnd.randint(int(h * 0.25), int(h * 0.7))
        x = rnd.randint(-r // 2, w + r // 2)
        y = rnd.randint(-r // 2, h + r // 2)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)


def _pan_offset(motion: str, t: float, amp: int) -> tuple[float, float]:
    e = ease_io(t)
    if motion == "pan-left":
        return (-amp * e, 0)
    if motion == "pan-right":
        return (amp * e, 0)
    if motion == "whip":
        return (amp * math.sin(t * math.pi) * (1 - t), 0)
    if motion == "orbit":
        return (amp * math.sin(t * math.tau) * 0.5, amp * math.cos(t * math.tau) * 0.3)
    return (0, -amp * 0.15 * e)  # slow-push handled via zoom elsewhere


# --------------------------------------------------------------------------- #
def _bg_layer(style: str, size, pal, rnd) -> Image.Image:
    dark = hex_rgb(pal[0])
    mid = hex_rgb(pal[1]) if len(pal) > 1 else dark
    lo = hex_rgb(pal[-2]) if len(pal) > 2 else mid
    hi = hex_rgb(pal[-1])
    w, h = size
    over = (w * 4 // 3, h * 4 // 3)  # groter, zodat pannen ruimte heeft

    if style == "animation":
        img = _gradient(over, hi, lo)
        d = ImageDraw.Draw(img)
        _blobs(d, over, [mid, lo, hi], rnd, n=6)
        img = img.filter(ImageFilter.GaussianBlur(over[1] // 14))
        d = ImageDraw.Draw(img)
        for _ in range(3):
            r = rnd.randint(int(h * 0.08), int(h * 0.2))
            x, y = rnd.randint(0, over[0]), rnd.randint(0, over[1])
            d.ellipse([x - r, y - r, x + r, y + r], outline=dark, width=max(3, r // 8))
        return img

    if style == "product":
        img = _gradient(over, mid, dark)
        d = ImageDraw.Draw(img)
        d.ellipse([over[0] * 0.15, over[1] * 0.55, over[0] * 0.85, over[1] * 1.15],
                  fill=mix(mid, hi, 0.25))
        img = img.filter(ImageFilter.GaussianBlur(over[1] // 20))
        return img

    if style == "kinetic":
        return _gradient(over, dark, mix(dark, mid, 0.5))

    # cinematic / docu
    img = _gradient(over, dark, mid, angle=100)
    # verre horizon-gloed op een aparte, sterk geblurde laag
    glow = Image.new("RGBA", over, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gx, gy = int(over[0] * rnd.uniform(0.3, 0.7)), int(over[1] * 0.55)
    gr = int(over[1] * 0.42)
    gd.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=(*hi, 150))
    gd.ellipse([gx - gr // 2, gy - gr // 2, gx + gr // 2, gy + gr // 2], fill=(*hi, 220))
    glow = glow.filter(ImageFilter.GaussianBlur(over[1] // 8))
    img = img.convert("RGBA")
    img.alpha_composite(glow)
    img = img.convert("RGB")
    d = ImageDraw.Draw(img, "RGBA")
    # silhouet-lagen
    layers = Image.new("RGBA", over, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layers)
    for i in range(3):
        yy = over[1] * (0.62 + i * 0.12)
        pts = [(0, over[1])]
        x = 0
        while x < over[0]:
            pts.append((x, yy + rnd.uniform(-over[1] * 0.06, over[1] * 0.02) - i * 8))
            x += rnd.randint(60, 160)
        pts += [(over[0], over[1])]
        shade = mix(dark, (0, 0, 0), 0.3 + i * 0.2)
        ld.polygon(pts, fill=(*shade, 255))
    img = img.convert("RGBA")
    img.alpha_composite(layers)
    return img.convert("RGB")


def _fg_dust(d, size, t, seed, hi):
    w, h = size
    r = random.Random(seed)
    for _ in range(24):
        px, py = r.random(), r.random()
        sp = r.uniform(10, 60)
        bx = (px * w + t * r.uniform(-30, 30)) % w
        by = (py * h - t * sp) % h
        s = r.uniform(1.0, 2.6)
        d.ellipse([bx, by, bx + s, by + s], fill=(*hi, r.randint(35, 110)))


def render_shot(shot: Shot, brief: Brief, path: str, seconds: float) -> str:
    size = work_size(brief.aspect)
    w, h = size
    pal = palette_for(brief.mood, shot.palette or brief.palette)
    hi = hex_rgb(pal[-1])
    rnd = random.Random(hash((shot.index, shot.visual)) & 0xFFFFFFFF)

    bg = _bg_layer(brief.style, size, pal, rnd)
    ow, oh = bg.size
    nframes = max(1, int(seconds * FPS))
    clip = Clip(path, size)

    title_f = font(int(h * (0.11 if brief.aspect == "9:16" else 0.085)))
    body_f = font(int(h * 0.05), bold=False)

    for fi in range(nframes):
        t = fi / max(1, nframes - 1)
        # camerabeweging: zoom (slow-push) + pan
        zoom = 1.0 + (0.12 * ease_io(t) if shot.motion in ("slow-push", "static") else 0.06)
        cw, ch = ow / zoom, oh / zoom
        px, py = _pan_offset(shot.motion, t, amp=int((ow - w) * 0.8))
        cx = (ow - cw) / 2 + px
        cy = (oh - ch) / 2 + py
        cx = clamp(cx, 0, ow - cw)
        cy = clamp(cy, 0, oh - ch)
        frame = bg.crop((int(cx), int(cy), int(cx + cw), int(cy + ch))).resize(size, Image.LANCZOS)

        d = ImageDraw.Draw(frame, "RGBA")
        if brief.style in ("cinematic", "docu"):
            _fg_dust(d, size, t, shot.index, hi)

        # on-screen tekst (kinetisch of lower-third)
        if shot.on_screen_text:
            appear = ease_out(clamp(t / 0.25))
            if brief.style == "kinetic":
                lines = wrap(d, shot.on_screen_text.upper(), title_f, int(w * 0.86))
                total_h = len(lines) * title_f.size * 1.15
                y = h / 2 - total_h / 2
                for li, ln in enumerate(lines):
                    lt = clamp((t - li * 0.08) / 0.3)
                    dy = (1 - ease_out(lt)) * h * 0.08
                    draw_text(d, (w / 2, y + li * title_f.size * 1.15 + dy),
                              ln, title_f, (*hi, int(255 * lt)), anchor="ma")
            else:
                bar_y = h * (0.80 if brief.aspect != "9:16" else 0.72)
                d.rectangle([0, bar_y, w * appear, bar_y + h * 0.12], fill=(*hex_rgb(pal[1]), 210))
                d.rectangle([0, bar_y, w * 0.012, bar_y + h * 0.12], fill=(*hi, 255))
                draw_text(d, (w * 0.05, bar_y + h * 0.04), shot.on_screen_text,
                          font(int(h * 0.045)), (*hex_rgb(pal[-1]), 255))

        frame = frame.convert("RGB")
        if brief.style in ("cinematic", "docu"):
            frame = vignette(frame, 0.5)
            frame = grain(frame, 3)
        elif brief.style == "product":
            frame = vignette(frame, 0.35)

        # heel korte in/uit-flits (crossfades komen in assemble)
        edge = min(3, nframes // 6)
        if edge and (fi < edge or fi >= nframes - edge):
            f = (fi + 1) / (edge + 1) if fi < edge else (nframes - fi) / (edge + 1)
            frame = Image.blend(Image.new("RGB", size, (0, 0, 0)), frame, clamp(f))

        clip.add(frame)

    clip.close()
    return path
