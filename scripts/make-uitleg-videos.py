# -*- coding: utf-8 -*-
"""
Genereert de ZekerFlex uitlegfilmpjes als echte, afspeelbare MP4's.
Flat-design "neppe mensen" (Robin = werker, Sam = opdrachtgever), duidelijke
Nederlandse bijschriften die uitleggen wat het platform doet.

Output: <repo>/public/videos/<slug>.mp4  (H.264 / yuv420p, 1280x720, 24fps)
        + Nederlandse voice-over (edge-tts, stem nl-NL-MaartenNeural)
        + poster <slug>.jpg  + faststart

Vereist:  pip install Pillow imageio imageio-ffmpeg numpy edge-tts
Gebruik:  python scripts/make-uitleg-videos.py                # alle 5
          python scripts/make-uitleg-videos.py klus-plaatsen  # één
          python scripts/make-uitleg-videos.py --no-audio     # zonder stem
Windows-fonts (Segoe UI) worden hard gebruikt; pas F aan voor andere OS.
edge-tts doet een online call naar de Microsoft-stemmen (geen key nodig);
de gegenereerde MP3's worden lokaal in de video gemuxt.
"""
import os, math, sys, subprocess, hashlib, json, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg
import imageio.v2 as imageio

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "public", "videos")
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".tts-cache")
os.makedirs(OUT, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
os.environ["IMAGEIO_FFMPEG_EXE"] = FFMPEG

VOICE = "nl-NL-MaartenNeural"      # of nl-NL-ColetteNeural / nl-NL-FennaNeural
AUDIO = "--no-audio" not in sys.argv
LEAD_IN, TAIL = 0.45, 0.9          # stilte voor/na de zin binnen een scene

def _spoken(text):
    """caption -> voorleesbare zin"""
    t = re.sub(r"^(\d)\s+·\s+", r"Stap \1: ", text)   # "1 · ..." -> "Stap 1: ..."
    t = t.replace("’", "'").replace("×", " keer ").replace("→", " wordt ")
    t = t.replace(" + ", " plus ").replace(" = ", " is ")
    t = t.replace(" — ", ", ").replace("—", ", ").replace(" – ", ", ")
    t = t.replace(" · ", ", ").replace("·", ", ")
    t = t.replace("excl.", "exclusief").replace("incl.", "inclusief")
    t = re.sub(r"€\s*(\d+),(\d{2})", r"\1 euro \2", t)
    t = re.sub(r"€\s*(\d+)", r"\1 euro", t)
    t = re.sub(r"(\d+) euro 00\b", r"\1 euro", t)
    t = re.sub(r"\bZZP'er\b", "zzp'er", t)
    return re.sub(r"\s+", " ", t).strip()

def tts(text):
    """genereer (en cache) een MP3 voor deze zin; return pad of None"""
    if not AUDIO:
        return None
    key = hashlib.sha1((VOICE + "|" + text).encode("utf-8")).hexdigest()[:16]
    mp3 = os.path.join(CACHE, key + ".mp3")
    if not os.path.exists(mp3):
        try:
            subprocess.run([sys.executable, "-m", "edge_tts", "--voice", VOICE,
                            "--text", text, "--write-media", mp3],
                           check=True, capture_output=True, timeout=60)
        except Exception as e:
            print("   ! tts mislukt:", e)
            return None
    return mp3 if os.path.exists(mp3) and os.path.getsize(mp3) > 200 else None

def media_dur(path):
    out = subprocess.run([FFMPEG, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    return (int(m.group(1))*3600 + int(m.group(2))*60 + float(m.group(3))) if m else 0.0

W, H = 1280, 720
FPS = 24
STAGE_CY = 402          # verticale hartlijn van het "podium"
SAFE_BOTTOM = 548       # niets eronder (bijschriftbalk begint op 570)

# ---- palet (uit tailwind.config.ts) ---------------------------------------
INK      = (12, 14, 18)
INK_SOFT = (26, 31, 39)
INK_700  = (42, 49, 60)
PAPER    = (252, 252, 250)
PAPER_SOFT = (244, 245, 241)
BRAND500 = (14, 92, 74)
BRAND700 = (8, 58, 47)
BRAND300 = (95, 199, 168)
MINT     = (79, 224, 160)
NEUTRAL  = (150, 158, 170)
SKIN_A   = (245, 205, 174)
SKIN_B   = (214, 165, 130)

F = "C:/Windows/Fonts/"
def font(name, size): return ImageFont.truetype(F + name, size)

FONT_H1   = font("segoeuib.ttf", 60)
FONT_H2   = font("segoeuib.ttf", 42)
FONT_H3   = font("segoeuib.ttf", 30)
FONT_BODY = font("segoeui.ttf", 28)
FONT_SM   = font("segoeui.ttf", 23)
FONT_XS   = font("segoeui.ttf", 18)
FONT_TAG  = font("segoeuib.ttf", 19)
FONT_CAP  = font("segoeui.ttf", 28)
FONT_NUM  = font("segoeuib.ttf", 38)

def lerp(a, b, t): return a + (b - a) * t
def ease(t): return 1 - (1 - t) ** 3
def clamp(t, lo=0.0, hi=1.0): return max(lo, min(hi, t))
def mix(c1, c2, t): return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))
def bob(t, amp=6, sp=2.0): return math.sin(t*math.pi*sp) * amp

def rounded(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def tc(draw, cx, y, s, fnt, fill):
    w = draw.textlength(s, font=fnt)
    draw.text((cx - w/2, y), s, font=fnt, fill=fill)

def wrap(draw, s, fnt, maxw):
    words, lines, cur = s.split(), [], ""
    for wd in words:
        t = (cur + " " + wd).strip()
        if draw.textlength(t, font=fnt) <= maxw: cur = t
        else:
            if cur: lines.append(cur)
            cur = wd
    if cur: lines.append(cur)
    return lines

def typed(s, t, speed=1.6):
    return s[:int(len(s) * clamp(t*speed))]

# ---- echte mensen: foto-cast -------------------------------------------
# Bijgesneden portretten uit de bestaande sitefotografie (public/…).
PHOTO_DIR = os.path.join(REPO, "public")
CAST_SRC = {
    # key -> (bestand, crop als fracties l,t,r,b van het origineel)
    "robin":  ("shifts/zorg.jpg",                  (0.375, 0.04, 0.605, 0.82)),
    "sam":    ("marketing/employer-branch.jpg",    (0.27, 0.02, 0.75, 1.00)),
    "crew":   ("marketing/team-shift.jpg",         (0.04, 0.00, 0.98, 1.00)),
}
_CAST = {}
def cast(key):
    if key not in _CAST:
        fn, (l, t, r, b) = CAST_SRC[key]
        im = Image.open(os.path.join(PHOTO_DIR, fn)).convert("RGB")
        w0, h0 = im.size
        im = im.crop((int(l*w0), int(t*h0), int(r*w0), int(b*h0)))
        sc = 1300 / im.height
        im = im.resize((max(1, int(im.width*sc)), 1300), Image.LANCZOS)
        _CAST[key] = im
    return _CAST[key]

def _round_mask(size, rad):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=rad, fill=255)
    return m

def photo_card(d, cx, cy, w, h, key, t, label=None, pan=0.07):
    """foto-kaart met langzame Ken-Burns zoom, ronde hoeken, mint-rand, naamchip"""
    w, h = int(w), int(h)
    src = cast(key)
    ta = w / h
    # center-crop met juiste aspect, dan langzaam inzoomen + iets omhoog pannen
    if src.width / src.height > ta:
        sh = src.height; sw = int(sh * ta)
    else:
        sw = src.width;  sh = int(sw / ta)
    z = 1.0 - pan * ease(clamp(t))
    cw, ch = int(sw * z), int(sh * z)
    ox = (src.width - cw) // 2
    oy = int((src.height - ch) * (0.42 - 0.12 * ease(clamp(t))))
    crop = src.crop((ox, oy, ox+cw, oy+ch)).resize((w, h), Image.LANCZOS)
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    card.paste(crop, (0, 0))
    card.putalpha(_round_mask((w, h), 22))
    x0, y0 = int(cx - w/2), int(cy - h/2)
    d._image.alpha_composite(card, (x0, y0))
    rounded(d, [x0, y0, x0+w, y0+h], 22, outline=(*MINT, 230), width=3)
    if label:
        tw = d.textlength(label, font=FONT_TAG)
        chy = y0 + h - 40
        rounded(d, [x0+12, chy, x0+12+tw+26, chy+30], 15, fill=(12, 14, 18, 225))
        d.text((x0+25, chy+4), label, font=FONT_TAG, fill=PAPER)

# ---- personage (illustratie-fallback, ongebruikt) ---------------------
def person(draw, cx, cy, scale=0.9, shirt=MINT, skin=SKIN_A, hair=(38,38,46),
           wave=0.0, bob_t=0.0, label=None):
    s = scale
    cy += bob(bob_t)
    rounded(draw, [cx-58*s, cy+18*s, cx+58*s, cy+164*s], int(46*s), fill=shirt)
    draw.rectangle([cx-14*s, cy-8*s, cx+14*s, cy+30*s], fill=skin)
    draw.ellipse([cx-42*s, cy-78*s, cx+42*s, cy+6*s], fill=skin)
    draw.chord([cx-46*s, cy-92*s, cx+46*s, cy+8*s], 180, 360, fill=hair)
    draw.rectangle([cx-46*s, cy-46*s, cx-38*s, cy-12*s], fill=hair)
    draw.rectangle([cx+38*s, cy-46*s, cx+46*s, cy-12*s], fill=hair)
    draw.ellipse([cx-20*s, cy-40*s, cx-12*s, cy-32*s], fill=INK)
    draw.ellipse([cx+12*s, cy-40*s, cx+20*s, cy-32*s], fill=INK)
    draw.arc([cx-16*s, cy-34*s, cx+16*s, cy-8*s], 20, 160, fill=INK, width=max(2,int(3*s)))
    ang = -0.5 - wave * 0.9
    ax, ay = cx+50*s, cy+54*s
    ex, ey = ax + math.cos(ang)*66*s, ay + math.sin(ang)*66*s
    draw.line([ax, ay, ex, ey], fill=skin, width=int(19*s))
    draw.ellipse([ex-12*s, ey-12*s, ex+12*s, ey+12*s], fill=skin)
    draw.line([cx-50*s, cy+54*s, cx-58*s, cy+116*s], fill=skin, width=int(19*s))
    if label:
        w = draw.textlength(label, font=FONT_TAG)
        yb = cy + 176*s
        rounded(draw, [cx-w/2-13, yb, cx+w/2+13, yb+32], 15, fill=INK_700)
        draw.text((cx-w/2, yb+5), label, font=FONT_TAG, fill=PAPER)

def check(draw, cx, cy, r, col=INK, bg=MINT):
    if bg: draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=bg)
    draw.line([cx-r*0.42, cy+r*0.02, cx-r*0.04, cy+r*0.4], fill=col, width=max(3,int(r*0.17)))
    draw.line([cx-r*0.04, cy+r*0.4, cx+r*0.48, cy-r*0.38], fill=col, width=max(3,int(r*0.17)))

def gps_pin(draw, cx, cy, r, col=MINT):
    draw.pieslice([cx-r, cy-r, cx+r, cy+r], 40, 140, fill=col)
    draw.polygon([(cx-r*0.72, cy+r*0.34), (cx+r*0.72, cy+r*0.34), (cx, cy+r*1.4)], fill=col)
    draw.ellipse([cx-r*0.33, cy-r*0.33, cx+r*0.33, cy+r*0.33], fill=INK)

def pin_badge(draw, cx, cy, r=16):
    """locatie-marker die half over de hoek van een fotokaart valt"""
    draw.ellipse([cx-r-4, cy-r-4, cx+r+4, cy+r+4], fill=INK)
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=MINT)
    draw.polygon([(cx-r*0.6, cy+r*0.3), (cx+r*0.6, cy+r*0.3), (cx, cy+r*1.55)], fill=MINT)
    draw.ellipse([cx-r*0.34, cy-r*0.34, cx+r*0.34, cy+r*0.34], fill=INK)

# ---- achtergrond / chrome ---------------------------------------------
# B-roll: gedimde, wazige werkfoto's achter titel-/mensscenes.
BROLL_SRC = {
    "wat-is-zekerflex":       "shifts/logistiek.jpg",
    "klus-plaatsen":          "shifts/retail.jpg",
    "uitzenden-of-freelance": "shifts/kantoor.jpg",
    "uren-goedkeuren":        "shifts/logistiek.jpg",
    "kosten-en-facturen":     "shifts/kantoor.jpg",
    "intro":                  "marketing/team-shift.jpg",
    "bouw":                   "shifts/bouw.jpg",
    "horeca":                 "shifts/horeca.jpg",
}
_BG_CACHE = None
_BROLL = {}
_FADE_MASK = None

def _make_bg():
    img = Image.new("RGB", (W, H), INK)
    glow = Image.new("RGB", (W, H), INK)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W-520, -260, W+180, 260], fill=BRAND500)
    gd.ellipse([-260, H-160, 260, H+240], fill=(8, 58, 47))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    return Image.blend(img, glow, 0.5)

def _fade_mask():
    global _FADE_MASK
    if _FADE_MASK is None:
        col = Image.new("L", (1, H), 0)
        for y in range(H):
            col.putpixel((0, y), int(255 * clamp((y - (H-250)) / 210)))
        _FADE_MASK = col.resize((W, H))
    return _FADE_MASK

def _broll(key):
    if key not in _BROLL:
        im = Image.open(os.path.join(PHOTO_DIR, BROLL_SRC[key])).convert("RGB")
        tw, th = W, int(H * 1.16)
        s = max(tw / im.width, th / im.height)
        im = im.resize((int(im.width*s), int(im.height*s)), Image.LANCZOS)
        x = (im.width - tw) // 2; y = (im.height - th) // 2
        im = im.crop((x, y, x+tw, y+th)).filter(ImageFilter.GaussianBlur(9))
        im = Image.blend(im, Image.new("RGB", im.size, INK), 0.72)
        im = Image.blend(im, Image.new("RGB", im.size, BRAND700), 0.18)
        _BROLL[key] = im
    return _BROLL[key]

def base_frame(bg_key=None, t=0.0):
    global _BG_CACHE
    if bg_key and bg_key in BROLL_SRC:
        src = _broll(bg_key)
        dy = int((src.height - H) * (0.62 - 0.42 * ease(clamp(t))))   # trage pan
        img = src.crop((0, dy, W, dy + H)).copy()
        img.paste(Image.new("RGB", (W, H), INK), (0, 0), _fade_mask())
        return img, None
    if _BG_CACHE is None:
        _BG_CACHE = _make_bg()
    return _BG_CACHE.copy(), None

def chrome(d, tag):
    d.ellipse([56, 44, 78, 66], fill=MINT)
    d.text((90, 43), "ZekerFlex", font=FONT_TAG, fill=PAPER)
    w = d.textlength(tag, font=FONT_TAG)
    rounded(d, [W-56-w-28, 42, W-56, 74], 16, outline=(*MINT, 200), width=2)
    d.text((W-56-w-14, 46), tag, font=FONT_TAG, fill=MINT)

CAP_TOP = 570
def caption(d, lines, prog):
    if not lines:
        return
    d.rectangle([0, CAP_TOP-14, W, H], fill=INK)
    rounded(d, [56, CAP_TOP, W-56, H-44], 20, fill=INK_SOFT, outline=(255,255,255,26), width=2)
    rounded(d, [56, CAP_TOP, 64, H-44], 4, fill=MINT)
    ty = CAP_TOP + (14 if len(lines) > 1 else 26)
    for ln in lines:
        d.text((92, ty), ln, font=FONT_CAP, fill=PAPER)
        ty += 38
    d.rounded_rectangle([56, H-28, W-56, H-20], radius=4, fill=(255,255,255,26))
    d.rounded_rectangle([56, H-28, 56 + (W-112)*clamp(prog), H-20], radius=4, fill=MINT)

# ---- scene-systeem ---------------------------------------------------
_DUMMY = ImageDraw.Draw(Image.new("RGB", (10, 10)))
class Scene:
    def __init__(self, dur, tag, cap, painter, voice=None, bg=None, rise=True):
        self.dur, self.tag = dur, tag          # dur = minimale lengte
        self.cap = wrap(_DUMMY, cap, FONT_CAP, W-210) if cap else []
        self.painter = painter
        self.voice = voice if voice is not None else (_spoken(cap) if cap else None)
        self.bg = bg           # b-roll key of None (vlakke gradient)
        self.rise = rise       # inhoud schuift bij scene-start iets omhoog

def _run(args):
    subprocess.run(args, check=True, capture_output=True)

XF = 8   # crossfade-frames tussen scenes

def _intro_scene(slug, title):
    def p(d, t):
        # mint-punt tekent zich, wordmark verschijnt, titel eronder
        r = 16 * ease(clamp(t / 0.4))
        d.ellipse([W/2 - 150 - r, 300 - r, W/2 - 150 + r, 300 + r], fill=MINT)
        if t > 0.22:
            d.text((W/2 - 118, 276), "ZekerFlex", font=font("segoeuib.ttf", 52), fill=PAPER)
        if t > 0.5:
            aa = ease(clamp((t - 0.5) / 0.4))
            tc(d, W/2, 372, title, FONT_BODY, (*MINT, int(255 * aa)))
    return Scene(2.4, slug, "", p, voice=None, bg="intro", rise=False)

def _outro_scene(slug):
    def p(d, t):
        tc(d, W/2, 250, "Meer weten?", FONT_H2, PAPER)
        tc(d, W/2, 330, "zekerflex.com", FONT_H1, MINT)
        tc(d, W/2, 430, "freelance én uitzenden — één platform", FONT_SM, NEUTRAL)
    return Scene(3.0, slug, "", p,
                 voice="Wil je meer weten? Kijk op zekerflex punt com.",
                 bg="intro", rise=False)

def render_video(slug, scenes):
    tmpd = os.path.join(CACHE, "_" + slug)
    os.makedirs(tmpd, exist_ok=True)
    path = os.path.join(OUT, slug + ".mp4")
    silent = os.path.join(tmpd, "silent.mp4")
    title = SCENE_TITLES.get(slug, "ZekerFlex")
    scenes = [_intro_scene(slug, title)] + list(scenes) + [_outro_scene(slug)]

    # 1) narratie ophalen + scenelengtes bepalen (op frame afgerond)
    durs, mp3s = [], []
    for sc in scenes:
        mp3 = tts(sc.voice) if sc.voice else None
        adur = media_dur(mp3) if mp3 else 0.0
        eff = max(sc.dur, (LEAD_IN + adur + TAIL) if adur else sc.dur)
        nf = max(1, math.ceil(eff * FPS))
        durs.append(nf / FPS)
        mp3s.append(mp3)
    total = sum(durs)

    # 2) beeld renderen (met crossfade + inhoud die opkomt)
    writer = imageio.get_writer(silent, fps=FPS, codec="libx264", quality=8,
                                macro_block_size=8,
                                ffmpeg_params=["-pix_fmt", "yuv420p"])
    elapsed = 0.0
    prev_tail = None
    for si, (sc, sd) in enumerate(zip(scenes, durs)):
        nf = int(round(sd * FPS))
        for fi in range(nf):
            lt = fi / max(1, nf-1)
            gt = clamp((elapsed + fi/FPS) / total)
            img, _ = base_frame(sc.bg, lt)
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            sc.painter(ImageDraw.Draw(layer, "RGBA"), lt)
            a = ease(clamp(lt/0.14)) * (1 - ease(clamp((lt-0.94)/0.06)))
            if a < 0.999:
                layer.putalpha(layer.split()[3].point(lambda p, a=a: int(p*a)))
            dy = int(22 * (1 - ease(clamp(lt/0.4)))) if sc.rise else 0
            img = img.convert("RGBA")
            img.alpha_composite(layer, (0, dy))
            img = img.convert("RGB")
            d = ImageDraw.Draw(img, "RGBA")
            chrome(d, sc.tag)
            caption(d, sc.cap, gt)
            frame = np.asarray(img)
            if si > 0 and fi < XF and prev_tail is not None:
                k = (fi + 1) / (XF + 1)
                frame = (prev_tail * (1 - k) + frame * k).astype(np.uint8)
            writer.append_data(frame)
            if fi == nf - 1:
                prev_tail = np.asarray(img).astype(np.float32)
        elapsed += sd
    writer.close()

    have_audio = any(mp3s)
    if have_audio:
        # 3) per scene een wav-blok van exact de scenelengte
        listf = os.path.join(tmpd, "list.txt")
        with open(listf, "w", encoding="utf-8") as lf:
            for i, (mp3, sd) in enumerate(zip(mp3s, durs)):
                wav = os.path.join(tmpd, f"s{i:02d}.wav")
                if mp3:
                    ms = int(LEAD_IN * 1000)
                    _run([FFMPEG, "-y", "-i", mp3, "-af",
                          f"adelay={ms}|{ms},apad", "-t", f"{sd:.3f}",
                          "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", wav])
                else:
                    _run([FFMPEG, "-y", "-f", "lavfi", "-i",
                          "anullsrc=r=44100:cl=stereo", "-t", f"{sd:.3f}",
                          "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", wav])
                lf.write(f"file '{wav.replace(chr(92), '/')}'\n")
        full = os.path.join(tmpd, "full.wav")
        _run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", listf, "-c", "copy", full])
        # 4) muxen + faststart
        _run([FFMPEG, "-y", "-i", silent, "-i", full, "-c:v", "copy",
              "-c:a", "aac", "-b:a", "144k", "-movflags", "+faststart",
              "-shortest", path])
    else:
        _run([FFMPEG, "-y", "-i", silent, "-c", "copy", "-movflags", "+faststart", path])

    # 5) poster
    _run([FFMPEG, "-y", "-ss", "1.6", "-i", path, "-frames:v", "1", "-q:v", "3",
          os.path.join(OUT, slug + ".jpg")])
    print("  ->", os.path.relpath(path, REPO),
          f"({total:.0f}s, {'met NL voice-over' if have_audio else 'zonder audio'})")

# =====================================================================
#  1. WAT IS ZEKERFLEX
# =====================================================================
def v_wat():
    def s1(d, t):
        tc(d, W/2, 88, "Wat is ZekerFlex?", FONT_H2, PAPER)
        tc(d, W/2, 150, "Eén platform voor freelance- en uitzendkrachten", FONT_SM, MINT)
        photo_card(d, W/2-172, 374, 296, 350, "robin", t, label="Robin · werker")
        photo_card(d, W/2+172, 374, 296, 350, "sam", t, label="Sam · opdrachtgever")
    def s2(d, t):
        tc(d, W/2, 100, "Geen bureau ertussen", FONT_H2, PAPER)
        photo_card(d, W/2-176, 380, 288, 336, "robin", t, label="Robin")
        photo_card(d, W/2+176, 380, 288, 336, "sam", t, label="Sam")
        check(d, W/2, 380, 24, col=INK, bg=MINT)
    def s3(d, t):
        tc(d, W/2, 128, "Kies per klus", FONT_H2, PAPER)
        for i,(tt,ss,col) in enumerate([
            ("UITZENDEN", "loonstrook · vakantiegeld · pensioen", MINT),
            ("FREELANCE", "eigen factuur · btw of KOR", BRAND300)]):
            x0 = 120 + i*530
            rv = ease(clamp((t-0.14*i)/0.5))
            rounded(d, [x0, 210, x0+490, 430], 22, fill=(255,255,255,int(15*rv)),
                    outline=(*col,int(210*rv)), width=2)
            d.text((x0+32, 240), tt, font=FONT_H3, fill=col)
            for j,ln in enumerate(wrap(d, ss, FONT_SM, 420)):
                d.text((x0+32, 296+j*32), ln, font=FONT_SM, fill=PAPER)
        tc(d, W/2, 470, "Het systeem bepaalt de vorm — de werker kiest niets", FONT_SM, NEUTRAL)
    def s4(d, t):
        tc(d, W/2, 150, "Alles automatisch", FONT_H2, PAPER)
        for i,it in enumerate(["Contract", "Uren", "Betaling", "Facturen"]):
            on = t > 0.12*i + 0.1
            cx = 250 + i*260
            check(d, cx, 320, 32, col=INK if on else INK_700, bg=MINT if on else INK_SOFT)
            tc(d, cx, 372, it, FONT_SM, PAPER if on else NEUTRAL)
        tc(d, W/2, 470, "Contract, uren, betaling en facturen lopen vanzelf", FONT_SM, NEUTRAL)
    def s5(d, t):
        tc(d, W/2, 205, "Klaar in minuten.", FONT_H1, PAPER)
        tc(d, W/2, 300, "Dat is ZekerFlex.", FONT_H1, MINT)
        tc(d, W/2, 420, "zekerflex.com", FONT_BODY, NEUTRAL)
    return [
        Scene(4.6, "wat-is-zekerflex", "ZekerFlex is één platform voor freelance- én uitzendkrachten.", s1, bg="wat-is-zekerflex"),
        Scene(4.8, "wat-is-zekerflex", "Geen uitzendbureau ertussen: opdrachtgever en werker regelen alles direct.", s2, bg="wat-is-zekerflex"),
        Scene(5.4, "wat-is-zekerflex", "Kies per klus: uitzendkracht mét loonstrook, of ZZP'er met eigen factuur.", s3),
        Scene(5.0, "wat-is-zekerflex", "Contract, uren, betaling en facturen gaan automatisch.", s4),
        Scene(3.6, "wat-is-zekerflex", "Klaar in minuten. Dat is ZekerFlex.", s5, bg="wat-is-zekerflex"),
    ]

# =====================================================================
#  2. KLUS PLAATSEN
# =====================================================================
def form_row(d, x, y, w, label, value, active=False):
    rounded(d, [x, y, x+w, y+56], 12, fill=(255,255,255,18),
            outline=(*MINT,220) if active else (255,255,255,45), width=2)
    d.text((x+18, y+5), label, font=FONT_XS, fill=NEUTRAL)
    d.text((x+18, y+24), value, font=FONT_SM, fill=PAPER)

def panel(d, step, rows, active_idx=-1, note=None):
    px, pw = 370, 540
    rounded(d, [px, 140, px+pw, 520], 22, fill=(255,255,255,13), outline=(255,255,255,45), width=2)
    d.text((px+28, 162), f"Nieuwe klus  ·  stap {step}/4", font=FONT_TAG, fill=MINT)
    for i,(lb,vl) in enumerate(rows):
        form_row(d, px+28, 210+i*72, pw-56, lb, vl, active=(i==active_idx))
    if note:
        d.text((px+28, 210+len(rows)*72+12), note, font=FONT_SM, fill=MINT)

def v_klus():
    def s1(d, t):
        tc(d, W/2, 96, "Zo plaats je een klus", FONT_H2, PAPER)
        tc(d, W/2, 156, "In een paar minuten live", FONT_SM, MINT)
        photo_card(d, W/2, 374, 300, 348, "sam", t, label="Sam · opdrachtgever")
    def s2(d, t):
        panel(d, 1, [("Functie", typed("Magazijnmedewerker", t, 2.4)),
                     ("Vestiging", "Distributiecentrum Zwolle" if t > .5 else "")], 0)
    def s3(d, t):
        panel(d, 2, [("Datum", "wo 10 sep 2026"),
                     ("Tijd", "09:00 – 17:00" if t > .35 else "09:00 – "),
                     ("Pauze", "30 min" if t > .7 else "")], 1)
    def s4(d, t):
        val = 1620 + int(ease(clamp(t*1.4))*180)
        panel(d, 3, [("Uurtarief (bruto)", f"€ {val/100:.2f}".replace(".", ",")),
                     ("Minimum", "€ 16,20 per uur")], 0,
              note="ZekerFlex bewaakt het minimumtarief")
    def s5(d, t):
        tc(d, W/2, 96, "Zet live → automatisch matchen", FONT_H3, PAPER)
        for k in range(3):
            r = (t*220 + k*74) % 220
            d.ellipse([326-r, 366-r, 326+r, 366+r],
                      outline=(*MINT, int(150*(1-r/220))), width=3)
        photo_card(d, 326, 366, 250, 300, "sam", t, label="Sam")
        photo_card(d, W-360, 366, 380, 300, "crew", t, label="Beschikbare krachten")
    def s6(d, t):
        tc(d, W/2, 120, "Kandidaat reageert → jij kiest", FONT_H3, PAPER)
        for i,lb in enumerate(["Reactie binnen", "Jij kiest de kracht", "Contract ondertekend"]):
            on = t > 0.2*i + 0.1
            y = 210 + i*84
            check(d, 360, y, 22, col=INK if on else INK_700, bg=MINT if on else INK_SOFT)
            d.text((404, y-16), lb, font=FONT_BODY, fill=PAPER if on else NEUTRAL)
        tc(d, W/2, 500, "De modelovereenkomst wordt automatisch door beiden getekend", FONT_SM, NEUTRAL)
    return [
        Scene(3.8, "klus-plaatsen", "Een klus plaatsen doe je in een paar minuten.", s1, bg="klus-plaatsen"),
        Scene(5.0, "klus-plaatsen", "1 · Kies de functie en de vestiging.", s2),
        Scene(4.6, "klus-plaatsen", "2 · Vul datum, begin- en eindtijd en pauze in.", s3),
        Scene(4.6, "klus-plaatsen", "3 · Stel het uurtarief in — minimaal € 16,20 bruto.", s4),
        Scene(5.0, "klus-plaatsen", "4 · Zet de klus live; ZekerFlex matcht automatisch krachten.", s5, bg="klus-plaatsen"),
        Scene(5.0, "klus-plaatsen", "Een kandidaat reageert, jij kiest, en het contract staat er meteen.", s6),
    ]

# =====================================================================
#  3. UITZENDEN OF FREELANCE
# =====================================================================
def v_verschil():
    def col(d, x0, title, items, c):
        rounded(d, [x0, 150, x0+500, 540], 22, fill=(255,255,255,12), outline=(*c,210), width=2)
        d.text((x0+32, 176), title, font=FONT_H3, fill=c)
        for j,it in enumerate(items):
            yy = 250 + j*66
            check(d, x0+48, yy, 15, col=INK, bg=c)
            for k,ln in enumerate(wrap(d, it, FONT_SM, 400)):
                d.text((x0+80, yy-14+k*28), ln, font=FONT_SM, fill=PAPER)
    def s1(d, t):
        tc(d, W/2, 88, "Uitzenden of freelance?", FONT_H2, PAPER)
        tc(d, W/2, 150, "Het verschil in het kort", FONT_SM, MINT)
        photo_card(d, W/2-172, 374, 296, 348, "robin", t, label="Robin")
        photo_card(d, W/2+172, 374, 296, 348, "sam", t, label="Sam")
    def s2(d, t):
        col(d, 120, "UITZENDEN", [
            "Loonstrook elke week via de payroll",
            "Vakantiegeld en vakantie-uren gereserveerd",
            "Pensioen (StiPP) en cao-toeslagen automatisch",
            "Loonheffing wordt voor je afgedragen"], MINT)
    def s3(d, t):
        col(d, W-620, "FREELANCE (ZZP)", [
            "Eigen factuur met btw of KOR-regeling",
            "Geen loonheffing — zelf reserveren",
            "Zelf verzekerd en zelf pensioen opbouwen",
            "Direct uitbetaald na goedkeuring"], BRAND300)
    def s4(d, t):
        tc(d, W/2, 100, "Automatische rol-switch", FONT_H2, PAPER)
        photo_card(d, W/2, 336, 300, 300, "robin", t)
        tc(d, W/2, 505, "Het systeem bepaalt per klus welke vorm past — de werker kiest niets", FONT_SM, NEUTRAL)
    def s5(d, t):
        tc(d, W/2, 210, "Jij ziet één tarief.", FONT_H1, PAPER)
        tc(d, W/2, 305, "De rest regelt ZekerFlex.", FONT_H2, MINT)
    return [
        Scene(3.8, "uitzenden-of-freelance", "Uitzenden of freelance — wat is het verschil?", s1, bg="uitzenden-of-freelance"),
        Scene(5.6, "uitzenden-of-freelance", "Uitzenden: loonstrook, vakantiegeld, pensioen en cao-toeslagen via de payroll.", s2),
        Scene(5.6, "uitzenden-of-freelance", "Freelance: een ZZP'er met eigen factuur, btw of KOR, en zelf verzekerd.", s3),
        Scene(4.8, "uitzenden-of-freelance", "Het systeem bepaalt automatisch de vorm per klus — de werker kiest niets.", s4, bg="uitzenden-of-freelance"),
        Scene(3.4, "uitzenden-of-freelance", "Jij ziet één tarief. De rest regelt ZekerFlex.", s5, bg="uitzenden-of-freelance"),
    ]

# =====================================================================
#  4. UREN GOEDKEUREN
# =====================================================================
def v_uren():
    def s1(d, t):
        tc(d, W/2, 96, "Uren goedkeuren", FONT_H2, PAPER)
        tc(d, W/2, 156, "in 30 seconden", FONT_SM, MINT)
        photo_card(d, W/2, 374, 300, 348, "sam", t, label="Sam · opdrachtgever")
    def s2(d, t):
        tc(d, W/2, 100, "1 · Check-in op locatie", FONT_H3, PAPER)
        photo_card(d, 340, 372, 290, 320, "robin", t, label="Robin · de kracht")
        pin_badge(d, 340-145+26, 372-160+22)
        rounded(d, [560, 320, 968, 452], 18, fill=(255,255,255,15), outline=(*MINT,200), width=2)
        d.text((588, 342), "GPS geverifieerd", font=FONT_SM, fill=MINT)
        d.text((588, 378), "Distributiecentrum Zwolle", font=FONT_XS, fill=PAPER)
        d.text((588, 406), "09:01 · binnen geofence", font=FONT_XS, fill=NEUTRAL)
    def s3(d, t):
        tc(d, W/2, 120, "2 · Uren en pauze ingevuld", FONT_H3, PAPER)
        for i,(a,b) in enumerate([("Gewerkt", "09:00 – 17:06"), ("Pauze", "30 min"),
                                  ("Totaal", typed("7 u 36 m", t, 2.6))]):
            y = 200 + i*80
            rounded(d, [360, y, 920, y+62], 12, fill=(255,255,255,15), outline=(255,255,255,45), width=2)
            d.text((382, y+18), a, font=FONT_SM, fill=NEUTRAL)
            d.text((720, y+14), b, font=FONT_H3, fill=PAPER)
    def s4(d, t):
        tc(d, W/2, 116, "3 · Urenbriefje + GPS + signalen", FONT_H3, PAPER)
        rounded(d, [300, 176, W-300, 470], 20, fill=(255,255,255,13), outline=(255,255,255,45), width=2)
        d.text((330, 200), "Robin de Vries · Magazijn", font=FONT_SM, fill=PAPER)
        for i,ln in enumerate(["GPS check-in klopt", "Uren binnen planning", "Geen fraudesignalen"]):
            check(d, 352, 270+i*52, 16, col=INK, bg=MINT)
            d.text((386, 254+i*52), ln, font=FONT_SM, fill=PAPER)
        tc(d, W/2, 500, "Bij een signaal blokkeert ZekerFlex de goedkeuring", FONT_SM, NEUTRAL)
    def s5(d, t):
        tc(d, W/2, 150, "4 · Eén tik: Goedkeuren", FONT_H2, PAPER)
        p = (math.sin(t*3)+1)/2
        rounded(d, [W/2-180, 300, W/2+180, 380], 40, fill=mix(BRAND500, MINT, p))
        tc(d, W/2, 322, "Uren goedkeuren", FONT_H3, INK)
        cx = W/2 + 120 - ease(clamp(t*1.4))*120
        d.ellipse([cx, 344, cx+16, 360], fill=PAPER)
    def s6(d, t):
        tc(d, W/2, 116, "Daarna: automatisch", FONT_H3, PAPER)
        for i,(tt,ss,c) in enumerate([
            ("ZZP'er", "reverse-billing factuur|+ directe uitbetaling", BRAND300),
            ("Uitzendkracht", "verloning via payroll|+ voorschot binnen 1 min", MINT)]):
            x0 = 150 + i*520
            rounded(d, [x0, 190, x0+480, 450], 20, fill=(255,255,255,12), outline=(*c,210), width=2)
            d.text((x0+30, 216), tt, font=FONT_H3, fill=c)
            for j,ln in enumerate(ss.split("|")):
                d.text((x0+30, 284+j*36), ln, font=FONT_SM, fill=PAPER)
    return [
        Scene(3.6, "uren-goedkeuren", "Uren goedkeuren kost je zo'n 30 seconden.", s1, bg="uren-goedkeuren"),
        Scene(4.8, "uren-goedkeuren", "1 · De kracht checkt op locatie in met GPS-verificatie.", s2),
        Scene(4.6, "uren-goedkeuren", "2 · Na de dienst staan de gewerkte uren en pauze klaar.", s3),
        Scene(5.0, "uren-goedkeuren", "3 · Jij ziet het urenbriefje, de GPS-check en eventuele signalen.", s4),
        Scene(4.2, "uren-goedkeuren", "4 · Eén tik op Goedkeuren en het urenbriefje is akkoord.", s5),
        Scene(5.0, "uren-goedkeuren", "Daarna loopt facturatie (ZZP) of verloning (uitzend) automatisch.", s6, bg="uren-goedkeuren"),
    ]

# =====================================================================
#  5. KOSTEN EN FACTUREN
# =====================================================================
def v_kosten():
    def s1(d, t):
        tc(d, W/2, 96, "Wat kost het?", FONT_H2, PAPER)
        tc(d, W/2, 156, "En hoe zit het met facturen?", FONT_SM, MINT)
        photo_card(d, W/2, 374, 300, 348, "sam", t, label="Sam · opdrachtgever")
    def s2(d, t):
        tc(d, W/2, 190, "€ 3,50", FONT_H1, MINT)
        tc(d, W/2, 280, "platformkosten per gewerkt uur", FONT_BODY, PAPER)
        tc(d, W/2, 360, "Geen abonnement, geen verrassingen", FONT_SM, NEUTRAL)
    def s3(d, t):
        tc(d, W/2, 110, "Rekenvoorbeeld · 8 uur", FONT_H3, PAPER)
        for i,(a,b,c) in enumerate([("Loon", "8 u  ×  € 18,00", "€ 144,00"),
                                    ("Platform", "8 u  ×  € 3,50", "€ 28,00"),
                                    ("Totaal excl. btw", "", "€ 172,00")]):
            on = t > 0.22*i + 0.05
            y = 180 + i*88
            last = i == 2
            rounded(d, [280, y, W-280, y+72], 14,
                    fill=(*MINT,26) if last else (255,255,255,13),
                    outline=(*MINT,220) if last else (255,255,255,45), width=2)
            d.text((305, y+22), a, font=FONT_SM, fill=PAPER if on else INK_700)
            d.text((560, y+22), b, font=FONT_SM, fill=NEUTRAL if on else INK_700)
            tw = d.textlength(c, font=FONT_NUM)
            d.text((W-305-tw, y+16), c if on else "", font=FONT_NUM, fill=MINT if last else PAPER)
    def s4(d, t):
        tc(d, W/2, 130, "Eén heldere factuur per week", FONT_H2, PAPER)
        rounded(d, [W/2-230, 210, W/2+230, 460], 18, fill=(255,255,255,15), outline=(255,255,255,55), width=2)
        d.text((W/2-200, 238), "ZekerFlex B.V.", font=FONT_SM, fill=PAPER)
        d.text((W/2-200, 276), "Week 37 · 1 klus", font=FONT_XS, fill=NEUTRAL)
        d.line([W/2-200, 316, W/2+200, 316], fill=(255,255,255,60), width=2)
        d.text((W/2-200, 332), "Te voldoen", font=FONT_XS, fill=NEUTRAL)
        d.text((W/2-200, 362), "€ 172,00", font=FONT_NUM, fill=MINT)
        tc(d, W/2, 500, "De betaaltermijn kies je zelf", FONT_SM, NEUTRAL)
    def s5(d, t):
        tc(d, W/2, 140, "Bij uitzenden", FONT_H2, PAPER)
        for i,ln in enumerate(["Cao-loon en jeugdloon automatisch",
                               "Nacht-, weekend- en feestdagtoeslag",
                               "Payroll, pensioen en afdracht inbegrepen"]):
            on = t > 0.18*i + 0.1
            check(d, 340, 250+i*66, 19, col=INK if on else INK_700, bg=MINT if on else INK_SOFT)
            d.text((384, 232+i*66), ln, font=FONT_SM, fill=PAPER if on else NEUTRAL)
        tc(d, W/2, 500, "Het zit allemaal in het uurtarief dat jij ziet", FONT_SM, NEUTRAL)
    return [
        Scene(3.6, "kosten-en-facturen", "Wat kost ZekerFlex, en hoe werken de facturen?", s1, bg="kosten-en-facturen"),
        Scene(4.4, "kosten-en-facturen", "€ 3,50 platformkosten per gewerkt uur. Meer niet.", s2),
        Scene(5.6, "kosten-en-facturen", "Voorbeeld: 8 uur × € 18,00 loon + 8 × € 3,50 platform = € 172 excl. btw.", s3),
        Scene(4.8, "kosten-en-facturen", "Eén heldere factuur per week; de betaaltermijn kies je zelf.", s4),
        Scene(5.2, "kosten-en-facturen", "Bij uitzenden zitten cao-loon, toeslagen en payroll al in het tarief.", s5, bg="kosten-en-facturen"),
    ]

JOBS = {
    "wat-is-zekerflex": v_wat,
    "klus-plaatsen": v_klus,
    "uitzenden-of-freelance": v_verschil,
    "uren-goedkeuren": v_uren,
    "kosten-en-facturen": v_kosten,
}
SCENE_TITLES = {
    "wat-is-zekerflex":       "Wat is ZekerFlex?",
    "klus-plaatsen":          "Zo plaats je een klus",
    "uitzenden-of-freelance": "Uitzenden of freelance",
    "uren-goedkeuren":        "Uren goedkeuren",
    "kosten-en-facturen":     "Kosten & facturen",
}

def build_master():
    """Plakt de vijf filmpjes achter elkaar tot één volledige uitleg."""
    order = list(JOBS)
    parts = [os.path.join(OUT, s + ".mp4") for s in order]
    if not all(os.path.exists(p) for p in parts):
        print("master overgeslagen — niet alle delen bestaan"); return
    listf = os.path.join(CACHE, "master.txt")
    with open(listf, "w", encoding="utf-8") as f:
        for p in parts:
            f.write(f"file '{p.replace(chr(92), '/')}'\n")
    out = os.path.join(OUT, "zekerflex-uitleg-compleet.mp4")
    _run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", listf,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
          "-c:a", "aac", "-b:a", "144k", "-pix_fmt", "yuv420p",
          "-movflags", "+faststart", out])
    _run([FFMPEG, "-y", "-ss", "1.2", "-i", out, "-frames:v", "1", "-q:v", "3",
          os.path.join(OUT, "zekerflex-uitleg-compleet.jpg")])
    print("  ->", os.path.relpath(out, REPO), "(volledige uitleg)")

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    only = args or list(JOBS)
    if "--master-only" not in sys.argv:
        for slug in only:
            if slug not in JOBS:
                print("onbekend:", slug); continue
            print("Render:", slug)
            render_video(slug, JOBS[slug]())
    if not args or "--master" in sys.argv or "--master-only" in sys.argv:
        print("Master:")
        build_master()
    print("Klaar.")
