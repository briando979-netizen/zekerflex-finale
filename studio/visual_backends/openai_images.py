"""AI-stills via een image-gen API, daarna Ken Burns naar een clip.

Actief wanneer OPENAI_API_KEY (DALL·E / gpt-image-1) of STABILITY_API_KEY gezet is.
Zonder sleutel wordt deze module nooit aangeroepen (zie visual_backends/__init__).
"""
from __future__ import annotations

import base64
import json
import os
import urllib.request

from PIL import Image

from ..config import FPS, work_size
from ..models import Brief, Shot
from ..render_util import Clip, clamp, ease_io, grain, vignette

_STYLE_SUFFIX = {
    "cinematic": "cinematic still, 35mm film, dramatic lighting, shallow depth of field, no text",
    "animation": "3D animated film still, Pixar-style, soft global illumination, expressive, no text",
    "kinetic": "bold minimal graphic background, flat design, high contrast, no text",
    "product": "premium product photography, studio lighting, clean seamless background, no text",
    "docu": "documentary photograph, natural light, photojournalistic, no text",
}


def _prompt(shot: Shot, brief: Brief) -> str:
    pal = ", ".join(brief.palette) if brief.palette else brief.mood + " palette"
    return f"{shot.visual}. {_STYLE_SUFFIX.get(brief.style, '')}. Colour mood: {pal}. Aspect {brief.aspect}."


def _openai_image(prompt: str, size: tuple[int, int]) -> Image.Image:
    key = os.environ["OPENAI_API_KEY"]
    base = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    w, h = size
    api_size = "1792x1024" if w > h else "1024x1792" if h > w else "1024x1024"
    payload = {"model": os.environ.get("STUDIO_IMAGE_MODEL", "gpt-image-1"),
               "prompt": prompt, "size": api_size, "n": 1}
    req = urllib.request.Request(base + "/images/generations",
                                 data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=180) as r:
        out = json.loads(r.read())
    d0 = out["data"][0]
    if d0.get("b64_json"):
        raw = base64.b64decode(d0["b64_json"])
    else:
        with urllib.request.urlopen(d0["url"], timeout=120) as ir:
            raw = ir.read()
    import io
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _stability_image(prompt: str, size: tuple[int, int]) -> Image.Image:
    key = os.environ["STABILITY_API_KEY"]
    import io
    body = json.dumps({"text_prompts": [{"text": prompt}], "width": 1344 if size[0] >= size[1] else 768,
                       "height": 768 if size[0] >= size[1] else 1344, "samples": 1, "steps": 30}).encode()
    req = urllib.request.Request(
        "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
        data=body, headers={"Content-Type": "application/json", "Accept": "application/json",
                            "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=180) as r:
        out = json.loads(r.read())
    raw = base64.b64decode(out["artifacts"][0]["base64"])
    return Image.open(io.BytesIO(raw)).convert("RGB")


def render_shot(shot: Shot, brief: Brief, path: str, seconds: float) -> str:
    size = work_size(brief.aspect)
    prompt = _prompt(shot, brief)
    src = _stability_image(prompt, size) if os.environ.get("STABILITY_API_KEY") else _openai_image(prompt, size)

    # cover-crop naar aspect, iets groter voor Ken Burns
    tw, th = size[0], size[1]
    scale = max((tw * 1.15) / src.width, (th * 1.15) / src.height)
    src = src.resize((int(src.width * scale), int(src.height * scale)), Image.LANCZOS)

    nframes = max(1, int(seconds * FPS))
    clip = Clip(path, size)
    zoom_in = shot.motion != "static"
    for fi in range(nframes):
        t = fi / max(1, nframes - 1)
        z = (1.10 - 0.10 * ease_io(t)) if zoom_in else 1.05
        cw, ch = tw * z, th * z
        maxdx, maxdy = src.width - cw, src.height - ch
        dx = maxdx * (0.5 + 0.4 * (ease_io(t) - 0.5) * (-1 if shot.motion == "pan-left" else 1))
        dy = maxdy * 0.5
        crop = src.crop((int(dx), int(dy), int(dx + cw), int(dy + ch))).resize(size, Image.LANCZOS)
        if brief.style in ("cinematic", "docu"):
            crop = grain(vignette(crop, 0.45), 4)
        fade = clamp(t / 0.1) * (1 - clamp((t - 0.9) / 0.1))
        if fade < 1:
            crop = Image.blend(Image.new("RGB", size, (0, 0, 0)), crop, fade)
        clip.add(crop)
    clip.close()
    return path
