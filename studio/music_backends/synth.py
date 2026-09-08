"""Procedureel gecomponeerde muziekbed (numpy). Rechtenvrij per definitie."""
from __future__ import annotations

import numpy as np

from ..config import FFMPEG
from ..models import Brief
from ..render_util import run

SR = 44100

# mood -> (grondtoon Hz, akkoordreeks als halve-tonen t.o.v. grondtoon, drums?, tempo)
_MOODS = {
    "warm":      (196.00, [(0, 4, 7), (-3, 0, 4), (2, 5, 9), (-1, 2, 7)], False, 76),
    "epic":      (110.00, [(0, 3, 7), (5, 8, 12), (3, 7, 10), (-2, 3, 7)], True, 90),
    "calm":      (174.61, [(0, 4, 7, 11), (2, 5, 9), (-3, 0, 4), (0, 4, 7)], False, 68),
    "playful":   (261.63, [(0, 4, 7), (-3, 2, 5), (5, 9, 12), (2, 5, 9)], True, 120),
    "tense":     (98.00, [(0, 3, 6), (1, 4, 7), (0, 3, 6), (-1, 2, 5)], True, 100),
    "corporate": (220.00, [(0, 4, 7), (2, 5, 9), (-3, 0, 4), (-5, -1, 2)], True, 104),
}


def _st(root: float, semis: float) -> float:
    return root * (2 ** (semis / 12))


def _adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    env = np.ones(n)
    ai, di, ri = int(a * SR), int(d * SR), int(r * SR)
    ai, di, ri = min(ai, n), min(di, n - min(ai, n)), min(ri, n)
    if ai:
        env[:ai] = np.linspace(0, 1, ai)
    if di:
        env[ai:ai + di] = np.linspace(1, s, di)
    env[ai + di:n - ri] = s
    if ri:
        env[n - ri:] = np.linspace(env[n - ri - 1] if n - ri > 0 else s, 0, ri)
    return env


def _pad(freqs, n, detune=0.004):
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for f in freqs:
        for k, amp in ((1, 1.0), (2, 0.35), (3, 0.16), (4, 0.08)):
            sig += amp * np.sin(2 * np.pi * f * k * (1 + detune * (k - 1)) * t)
    sig *= _adsr(n, 0.8, 0.6, 0.7, 1.2)
    return sig / (len(freqs) * 1.6)


def _arp(freqs, n, bpm, wave="tri"):
    step = int(SR * 60 / bpm / 2)
    out = np.zeros(n)
    i, k = 0, 0
    while i < n:
        f = freqs[k % len(freqs)] * 2
        m = min(step, n - i)
        t = np.arange(m) / SR
        v = (2 * np.abs(2 * ((f * t) % 1) - 1) - 1) if wave == "tri" else np.sin(2 * np.pi * f * t)
        v *= _adsr(m, 0.005, 0.08, 0.2, 0.12)
        out[i:i + m] += 0.28 * v
        i += step
        k += 1
    return out


def _bass(root_f, n, bpm):
    step = int(SR * 60 / bpm)
    out = np.zeros(n)
    i = 0
    while i < n:
        m = min(step, n - i)
        t = np.arange(m) / SR
        v = np.sin(2 * np.pi * root_f * t) + 0.3 * np.sin(2 * np.pi * root_f * 2 * t)
        v *= _adsr(m, 0.01, 0.1, 0.6, 0.3)
        out[i:i + m] += 0.5 * v
        i += step
    return out


def _drums(n, bpm):
    beat = int(SR * 60 / bpm)
    out = np.zeros(n)
    # kick op 1 & 3
    for pos in range(0, n, beat * 2):
        m = min(int(SR * 0.18), n - pos)
        if m <= 0:
            break
        t = np.arange(m) / SR
        f = 120 * np.exp(-t * 30) + 45
        out[pos:pos + m] += 0.9 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12)
    # hats op 8sten
    rng = np.random.default_rng(7)
    for pos in range(beat // 2, n, beat // 2):
        m = min(int(SR * 0.05), n - pos)
        if m <= 0:
            break
        t = np.arange(m) / SR
        out[pos:pos + m] += 0.18 * rng.standard_normal(m) * np.exp(-t * 60)
    return out


def _reverb(x, decay=0.35, delay=0.09):
    d = int(delay * SR)
    y = x.copy()
    for k in range(1, 4):
        y[d * k:] += (decay ** k) * x[: len(x) - d * k]
    return y


def score(brief: Brief, path: str, seconds: float) -> str:
    root, prog, use_drums, bpm = _MOODS.get(brief.mood, _MOODS["warm"])
    bar = SR * 4 * 60 // bpm
    n = int(seconds * SR) + bar
    mix = np.zeros(n)

    pos = 0
    ci = 0
    while pos < n - bar:
        chord = prog[ci % len(prog)]
        freqs = [_st(root, s) for s in chord]
        seg = min(bar, n - pos)
        prog_t = pos / n
        gain = 0.5 + 0.5 * min(1.0, prog_t / 0.25)          # intro-build
        gain *= 1.0 - max(0.0, (prog_t - 0.85) / 0.15)       # outro-fade
        mix[pos:pos + seg] += gain * _pad(freqs, seg)[:seg]
        if prog_t > 0.15:
            mix[pos:pos + seg] += gain * 0.7 * _arp(freqs, seg, bpm)[:seg]
        if prog_t > 0.08:
            mix[pos:pos + seg] += gain * _bass(freqs[0] / 2, seg, bpm)[:seg]
        if use_drums and prog_t > 0.22:
            mix[pos:pos + seg] += gain * 0.8 * _drums(seg, bpm)[:seg]
        pos += bar
        ci += 1

    mix = _reverb(mix)[: int(seconds * SR)]
    mix = np.tanh(mix * 1.4)                                  # zachte limiter
    mix = mix / (np.max(np.abs(mix)) + 1e-6) * 0.85
    stereo = np.stack([mix, np.roll(mix, 300)], axis=1)       # lichte breedte
    pcm = (stereo * 32767).astype(np.int16)

    raw = path + ".raw"
    pcm.tofile(raw)
    run([FFMPEG, "-y", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", raw,
         "-c:a", "aac", "-b:a", "160k", path])
    import os
    try:
        os.remove(raw)
    except OSError:
        pass
    return path
