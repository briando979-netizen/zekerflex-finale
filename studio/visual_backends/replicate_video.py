"""Echte AI-videoclips via Replicate (of Runway).

Actief wanneer REPLICATE_API_TOKEN gezet is. Standaardmodel is een snel
text-to-video model; overschrijf met STUDIO_VIDEO_MODEL.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request

from PIL import Image

from ..config import FPS, work_size
from ..models import Brief, Shot
from ..render_util import Clip, media_dur, run
from ..config import FFMPEG

_DEFAULT_MODEL = os.environ.get(
    "STUDIO_VIDEO_MODEL",
    "minimax/video-01",  # of: "tencent/hunyuan-video", "lightricks/ltx-video"
)

_STYLE = {
    "cinematic": "cinematic, 35mm, dramatic lighting, shallow depth of field",
    "animation": "3D animated, Pixar-style, soft lighting, expressive characters",
    "kinetic": "bold graphic motion background, flat design",
    "product": "premium product shot, studio lighting, slow rotation",
    "docu": "documentary footage, natural light, handheld",
}


def _replicate_predict(prompt: str) -> str:
    token = os.environ["REPLICATE_API_TOKEN"]
    body = json.dumps({"input": {"prompt": prompt}}).encode()
    ref = _DEFAULT_MODEL
    url = f"https://api.replicate.com/v1/models/{ref}/predictions" if "/" in ref and ":" not in ref \
        else "https://api.replicate.com/v1/predictions"
    if url.endswith("/predictions") and ":" in ref:
        body = json.dumps({"version": ref.split(":")[-1], "input": {"prompt": prompt}}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Prefer": "wait"})
    with urllib.request.urlopen(req, timeout=600) as r:
        pred = json.loads(r.read())
    # poll indien nog niet klaar
    for _ in range(120):
        if pred.get("status") in ("succeeded", "failed", "canceled"):
            break
        time.sleep(5)
        with urllib.request.urlopen(urllib.request.Request(
                pred["urls"]["get"], headers={"Authorization": f"Bearer {token}"})) as r:
            pred = json.loads(r.read())
    if pred.get("status") != "succeeded":
        raise RuntimeError(f"Replicate: {pred.get('status')} {pred.get('error')}")
    out = pred["output"]
    return out[0] if isinstance(out, list) else out


def render_shot(shot: Shot, brief: Brief, path: str, seconds: float) -> str:
    size = work_size(brief.aspect)
    prompt = f"{shot.visual}. {_STYLE.get(brief.style, '')}. Camera: {shot.motion.replace('-', ' ')}."
    video_url = _replicate_predict(prompt)

    raw = path + ".src.mp4"
    with urllib.request.urlopen(video_url, timeout=300) as r, open(raw, "wb") as f:
        f.write(r.read())

    # normaliseren: aspect-crop, exacte duur (loop of trim), fps
    src_dur = media_dur(raw) or seconds
    vf = (f"scale={size[0]}:{size[1]}:force_original_aspect_ratio=increase,"
          f"crop={size[0]}:{size[1]},fps={FPS}")
    loop_args = ["-stream_loop", "-1"] if src_dur + 0.2 < seconds else []
    run([FFMPEG, "-y", *loop_args, "-i", raw, "-t", f"{seconds:.3f}",
         "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
         "-pix_fmt", "yuv420p", path])
    try:
        os.remove(raw)
    except OSError:
        pass
    return path
