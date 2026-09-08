"""Referentievideo -> StyleProfile.

Analyseert UITSLUITEND abstracte ritme- en kleurparameters (shotlengtes,
cut-frequentie, bewegingsenergie, kleurpalet, loudness-curve, tempo). Er wordt
nooit beeld of audio uit de bron overgenomen — alleen het 'gevoel' van de edit.

Bron:
  * lokaal videobestand  -> altijd
  * YouTube-URL          -> alleen als yt-dlp beschikbaar is
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile

import numpy as np
from PIL import Image

from .config import FFMPEG
from .models import StyleProfile
from .render_util import media_dur


def _download_youtube(url: str, dest_dir: str) -> str:
    out = os.path.join(dest_dir, "ref.mp4")
    if shutil.which("yt-dlp"):
        subprocess.run(["yt-dlp", "-f", "mp4/bestvideo[height<=480]+bestaudio/best",
                        "--max-filesize", "300M", "-o", out, url], check=True, capture_output=True)
        return out
    try:
        import yt_dlp  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError(
            "yt-dlp niet gevonden. Installeer met `pip install yt-dlp` of geef een lokaal videobestand op."
        ) from e
    with yt_dlp.YoutubeDL({"format": "mp4/bestvideo[height<=480]+bestaudio/best",
                           "outtmpl": out, "quiet": True, "max_filesize": 300 * 1024 * 1024}) as y:
        y.download([url])
    return out


_MAX_ANALYSE_S = 600   # analyseer hooguit de eerste 10 minuten


def _frames(video: str, fps: float, width: int) -> list[np.ndarray]:
    d = tempfile.mkdtemp(prefix="studio-ref-")
    subprocess.run([FFMPEG, "-y", "-t", str(_MAX_ANALYSE_S), "-i", video,
                    "-vf", f"fps={fps},scale={width}:-1",
                    os.path.join(d, "f_%05d.png")], check=True, capture_output=True)
    out = []
    for name in sorted(os.listdir(d)):
        out.append(np.asarray(Image.open(os.path.join(d, name)).convert("RGB")).astype(np.float32))
    shutil.rmtree(d, ignore_errors=True)
    return out


def _palette(frames: list[np.ndarray], k: int = 4) -> list[str]:
    px = np.concatenate([f.reshape(-1, 3)[::37] for f in frames[:: max(1, len(frames) // 40)]], axis=0)
    # simpele k-means
    rng = np.random.default_rng(0)
    cent = px[rng.choice(len(px), k, replace=False)]
    for _ in range(8):
        d = ((px[:, None, :] - cent[None]) ** 2).sum(2)
        lab = d.argmin(1)
        for i in range(k):
            if (lab == i).any():
                cent[i] = px[lab == i].mean(0)
    order = np.argsort(cent.sum(1))
    return ["#%02x%02x%02x" % tuple(int(c) for c in cent[i]) for i in order]


def _audio_stats(video: str) -> tuple[list[float], float]:
    raw = tempfile.mktemp(suffix=".raw")
    r = subprocess.run([FFMPEG, "-y", "-t", str(_MAX_ANALYSE_S), "-i", video, "-vn",
                        "-ac", "1", "-ar", "8000", "-f", "s16le", raw], capture_output=True)
    if r.returncode != 0 or not os.path.exists(raw):
        return [], 100.0
    sig = np.fromfile(raw, dtype=np.int16).astype(np.float32) / 32768
    os.remove(raw)
    if sig.size < 8000:
        return [], 100.0
    win = 8000 * 2  # 2s
    rms = np.array([np.sqrt(np.mean(sig[i:i + win] ** 2)) for i in range(0, len(sig) - win, win)])
    curve = list((rms / (rms.max() + 1e-6)).round(3)) if rms.size else []
    # tempo via autocorrelatie van de energie-envelope
    env = np.abs(sig)
    env = np.convolve(env, np.ones(400) / 400, mode="same")[::80]
    env = env - env.mean()
    ac = np.correlate(env, env, mode="full")[len(env):]
    lo, hi = int(8000 / 80 * 60 / 180), int(8000 / 80 * 60 / 60)  # 60-180 bpm
    if hi < len(ac) and hi > lo:
        lag = lo + int(np.argmax(ac[lo:hi]))
        bpm = 60.0 / (lag * 80 / 8000)
    else:
        bpm = 100.0
    return curve, float(np.clip(bpm, 55, 190))


def analyse(source: str, sample_fps: float = 3.0) -> StyleProfile:
    tmp = None
    if source.startswith(("http://", "https://")):
        tmp = tempfile.mkdtemp(prefix="studio-ytref-")
        video = _download_youtube(source, tmp)
    else:
        video = source
        if not os.path.exists(video):
            raise FileNotFoundError(video)

    dur = media_dur(video)
    frames = _frames(video, sample_fps, 192)
    if len(frames) < 4:
        raise RuntimeError("te weinig frames uit de referentie")

    diffs = np.array([np.abs(frames[i] - frames[i - 1]).mean() / 255 for i in range(1, len(frames))])
    thr = max(0.11, float(diffs.mean() + 2.2 * diffs.std()))
    cut_idx = [i for i, d in enumerate(diffs) if d > thr]
    n_cuts = len(cut_idx)
    shot_lens = np.diff([0] + [i / sample_fps for i in cut_idx] + [dur]) if cut_idx else np.array([dur])
    shot_lens = shot_lens[shot_lens > 0.15]

    # tekst-dichtheid: hoog-frequente energie in de centrale band (proxy)
    band = [f[int(f.shape[0] * 0.55):int(f.shape[0] * 0.95)] for f in frames]
    hf = np.array([np.abs(np.diff(b.mean(2), axis=1)).mean() / 255 for b in band])
    text_density = float(np.clip((hf > (hf.mean() + hf.std())).mean() * 1.6, 0, 1))

    curve, bpm = _audio_stats(video)
    if tmp:
        shutil.rmtree(tmp, ignore_errors=True)

    return StyleProfile(
        source=source,
        duration_s=round(dur, 1),
        avg_shot_s=round(float(shot_lens.mean()), 2),
        shot_s_stddev=round(float(shot_lens.std()), 2),
        cuts_per_min=round(n_cuts / (dur / 60 + 1e-6), 1),
        motion_energy=round(float(np.clip(diffs.mean() / 0.09, 0, 1)), 2),
        text_density=round(text_density, 2),
        palette=_palette(frames),
        loudness_curve=curve,
        tempo_bpm=round(bpm, 1),
        notes=f"{n_cuts} cuts gedetecteerd over {dur:.0f}s",
    )
