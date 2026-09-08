"""Stage — alles samenvoegen tot de eindvideo met FFmpeg.

  beeld : shot-clips met crossfades  (+ titel- en eindkaart)
  audio : voice-over op de tijdlijn + g"geduckte" muziekbed
  tekst : ASS-ondertitels ingebrand
"""
from __future__ import annotations

import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

from ..config import FFMPEG, FPS, work_size
from ..models import Brief, Script, VoiceLine
from ..render_util import (
    Clip, clamp, draw_text, ease_out, font, grain, hex_rgb, mix, palette_for, vignette, wrap,
)
from ..render_util import media_dur, run

XF = 0.35   # crossfade-duur
TITLE_S = 2.2
END_S = 2.6
TITLE_LEAD = TITLE_S - XF   # tijd die de titelkaart aan de tijdlijn toevoegt vóór shot 0


def _has_libass() -> bool:
    out = subprocess.run([FFMPEG, "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return " ass " in out or "\nass " in out


def _card(path: str, brief: Brief, kind: str, title: str, subtitle: str, seconds: float) -> None:
    size = work_size(brief.aspect)
    w, h = size
    pal = palette_for(brief.mood, brief.palette)
    dark, hi = hex_rgb(pal[0]), hex_rgb(pal[-1])
    clip = Clip(path, size)
    n = int(seconds * FPS)
    tf = font(int(h * (0.12 if brief.aspect == "9:16" else 0.09)))
    sf = font(int(h * 0.045), bold=False)
    for fi in range(n):
        t = fi / max(1, n - 1)
        img = Image.new("RGB", size, dark)
        gy = h * (0.5 if kind == "title" else 0.42)
        glow = Image.new("RGBA", size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gr = int(h * 0.42)
        gd.ellipse([w / 2 - gr, gy - gr, w / 2 + gr, gy + gr], fill=(*hi, 120))
        glow = glow.filter(ImageFilter.GaussianBlur(int(h * 0.13)))
        img = img.convert("RGBA")
        img.alpha_composite(glow)
        img = img.convert("RGB")
        d = ImageDraw.Draw(img, "RGBA")
        a1 = ease_out(clamp(t / 0.3))
        for i, ln in enumerate(wrap(d, title, tf, int(w * 0.86))):
            draw_text(d, (w / 2, gy - tf.size + i * tf.size * 1.1), ln, tf, (*mix((255, 255, 255), hi, 0.15), int(255 * a1)), anchor="ma")
        if subtitle and t > 0.35:
            a2 = ease_out(clamp((t - 0.35) / 0.3))
            draw_text(d, (w / 2, gy + tf.size * 1.4), subtitle, sf, (*hi, int(230 * a2)), anchor="ma")
        img = grain(vignette(img.convert("RGB"), 0.5), 4)
        fade = clamp(t / 0.12) * (1 - clamp((t - 0.85) / 0.15))
        if fade < 1:
            img = Image.blend(Image.new("RGB", size, (0, 0, 0)), img, fade)
        clip.add(img)
    clip.close()


def _xfade_chain(clips: list[str], out: str) -> None:
    if len(clips) == 1:
        run([FFMPEG, "-y", "-i", clips[0], "-c", "copy", out])
        return
    durs = [media_dur(c) for c in clips]
    inp: list[str] = []
    for c in clips:
        inp += ["-i", c]
    fc = []
    prev = "0:v"
    offset = 0.0
    for i in range(1, len(clips)):
        offset += durs[i - 1] - XF
        lbl = f"x{i}"
        fc.append(f"[{prev}][{i}:v]xfade=transition=fade:duration={XF}:offset={offset:.3f}[{lbl}]")
        prev = lbl
    run([FFMPEG, "-y", *inp, "-filter_complex", ";".join(fc),
         "-map", f"[{prev}]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
         "-pix_fmt", "yuv420p", "-r", str(FPS), out])


def run_stage(brief: Brief, script: Script, shot_clips: list[str], voice: list[VoiceLine],
              music_path: str, subtitle_path: str, shot_starts: dict[int, float],
              work_dir: str, out_dir: str) -> dict[str, str]:
    os.makedirs(out_dir, exist_ok=True)
    size = work_size(brief.aspect)

    # 1) titel + eindkaart
    title_clip = os.path.join(work_dir, "card_title.mp4")
    end_clip = os.path.join(work_dir, "card_end.mp4")
    _card(title_clip, brief, "title", script.title, script.logline, TITLE_S)
    _card(end_clip, brief, "end", brief.cta or script.title, "", END_S)

    body = os.path.join(work_dir, "body.mp4")
    _xfade_chain([title_clip, *shot_clips, end_clip], body)
    title_len = TITLE_LEAD

    # 2) audiotijdlijn
    a_inputs = ["-i", body]
    a_filters = []
    amix_labels = []
    idx = 1
    for line in voice:
        a_inputs += ["-i", line.audio_path]
        delay = int(max(0.0, title_len + shot_starts.get(line.shot_index, 0.0) + 0.15) * 1000)
        a_filters.append(f"[{idx}:a]adelay={delay}|{delay},apad[vo{idx}]")
        amix_labels.append(f"[vo{idx}]")
        idx += 1

    total = media_dur(body)
    have_music = bool(music_path and os.path.exists(music_path))
    if have_music:
        a_inputs += ["-i", music_path]
        music_idx = idx

    if len(amix_labels) > 1:
        a_filters.append(f"{''.join(amix_labels)}amix=inputs={len(amix_labels)}:normalize=0:dropout_transition=0[vo]")
        vo_lbl = "[vo]"
    elif len(amix_labels) == 1:
        a_filters.append(f"{amix_labels[0]}anull[vo]")
        vo_lbl = "[vo]"
    else:
        vo_lbl = None

    if have_music and vo_lbl:
        if _sidechain_ok():
            a_filters.append(f"{vo_lbl}asplit=2[vomix][vokey]")
            a_filters.append(f"[{music_idx}:a]volume=0.55,apad[mbed]")
            a_filters.append("[mbed][vokey]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=320[mduck]")
            a_filters.append("[mduck][vomix]amix=inputs=2:normalize=0[mix]")
        else:
            a_filters.append(f"[{music_idx}:a]volume=0.2,apad[mbed]")
            a_filters.append(f"[mbed]{vo_lbl}amix=inputs=2:normalize=0[mix]")
        final_a = "[mix]"
    elif vo_lbl and not have_music:
        final_a = vo_lbl
    elif have_music:
        a_filters.append(f"[{music_idx}:a]volume=0.5[mix]")
        final_a = "[mix]"
    else:
        final_a = None

    withaudio = os.path.join(work_dir, "withaudio.mp4")
    if final_a:
        a_filters.append(f"{final_a}atrim=0:{total:.3f},afade=t=out:st={max(0.0, total - 1.5):.3f}:d=1.5[out]")
        run([FFMPEG, "-y", *a_inputs, "-filter_complex", ";".join(a_filters),
             "-map", "0:v", "-map", "[out]", "-c:v", "copy",
             "-c:a", "aac", "-b:a", "192k", "-shortest", withaudio])
    else:
        run([FFMPEG, "-y", "-i", body, "-c", "copy", withaudio])

    # 3) ondertitels inbranden + naar doelresolutie schalen
    tw, th = brief.size
    outputs: dict[str, str] = {}
    final = os.path.join(out_dir, "final.mp4")
    vf = f"scale={tw}:{th}:flags=lanczos"
    if subtitle_path and os.path.exists(subtitle_path) and _has_libass():
        sp = subtitle_path.replace("\\", "/").replace(":", "\\:")
        vf = f"ass='{sp}'," + vf
    run([FFMPEG, "-y", "-i", withaudio, "-vf", vf, "-c:v", "libx264", "-preset", "fast",
         "-crf", "23", "-maxrate", "8M", "-bufsize", "16M",
         "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", final])
    outputs[brief.aspect] = final

    # poster
    run([FFMPEG, "-y", "-ss", "1.0", "-i", final, "-frames:v", "1", "-q:v", "3",
         os.path.join(out_dir, "poster.jpg")])
    return outputs


def _sidechain_ok() -> bool:
    out = subprocess.run([FFMPEG, "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return "sidechaincompress" in out
