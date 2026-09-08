# -*- coding: utf-8 -*-
"""Genereert twee productfoto's van de biologische mesh boodschappentas."""
import os, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = r"c:\Users\pc\Documents\zekerflex finale\public\shop"
os.makedirs(OUT, exist_ok=True)

W = H = 1000
CREAM      = (238, 230, 212)
CREAM_DARK = (222, 212, 190)
CREAM_RIM  = (231, 222, 202)
INK        = (18, 18, 20)
BG         = (255, 255, 255)

try:
    FZF = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 34)
except Exception:
    FZF = ImageFont.load_default()


def bag_mask(cx, body_top, body_bot, half_w):
    """ronde net-body als 'L' masker"""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    # licht afgeplatte cirkel/ei-vorm
    d.ellipse([cx - half_w, body_top, cx + half_w, body_bot], fill=255)
    d.rectangle([cx - half_w + 10, body_top - 40, cx + half_w - 10, body_top + 60], fill=255)
    return m


def draw_handles(d, cx, rim_y, loop_top):
    strap_w = 34
    lx, rx = cx - 70, cx + 70
    for x in (lx, rx):
        d.line([(x, rim_y), (x, loop_top + 40)], fill=CREAM, width=strap_w)
    # bovenlus
    d.arc([cx - 70 - strap_w // 2, loop_top - 70, cx + 70 + strap_w // 2, loop_top + 70],
          180, 360, fill=CREAM, width=strap_w)
    # binnenrand lus (gat)
    d.arc([cx - 70 + strap_w // 2, loop_top - 70 + strap_w, cx + 70 - strap_w // 2, loop_top + 70 - strap_w],
          180, 360, fill=BG, width=6)


def net(canvas, mask, cx, top, bot, half_w):
    """diagonaal netpatroon binnen het masker"""
    layer = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(layer)
    step = 22
    # twee diagonale richtingen -> ruitjes; 'gaten' = achtergrondkleur
    for off in range(-H, W + H, step):
        d.line([(off, 0), (off + H, H)], fill=(250, 248, 242), width=7)
        d.line([(off + W, 0), (off + W - H, H)], fill=(250, 248, 242), width=7)
    # knooppunten
    for gy in range(int(top) - 20, int(bot) + 20, step):
        for gx in range(int(cx - half_w) - 20, int(cx + half_w) + 20, step):
            d.ellipse([gx - 3, gy - 3, gx + 3, gy + 3], fill=CREAM_DARK)
    canvas.paste(layer, (0, 0), mask)


def make(fname, badge_shape):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    cx = W // 2
    loop_top = 210
    rim_y = 430
    body_top, body_bot = 400, 760
    half_w = 210

    # schaduw
    sh = Image.new("RGB", (W, H), BG)
    ImageDraw.Draw(sh).ellipse([cx - 190, body_bot - 30, cx + 190, body_bot + 40], fill=(224, 222, 216))
    img = Image.blend(img, sh.filter(ImageFilter.GaussianBlur(22)), 0.6)
    d = ImageDraw.Draw(img)

    draw_handles(d, cx, rim_y, loop_top)

    # massieve bovenrand van de tas (volgt de bolling)
    rim_hw = 150
    d.rounded_rectangle([cx - rim_hw, rim_y - 24, cx + rim_hw, rim_y + 26], radius=22, fill=CREAM_RIM)

    # net-body
    mask = bag_mask(cx, body_top, body_bot, half_w)
    net(img, mask, cx, body_top, body_bot, half_w)
    d = ImageDraw.Draw(img)
    # subtiele contour
    d.arc([cx - half_w, body_top, cx + half_w, body_bot], 0, 360, fill=CREAM_DARK, width=3)

    # ZF-label op het katoenen paneel
    bx, by, r = cx, rim_y + 4, 34
    if badge_shape == "square":
        d.rounded_rectangle([bx - r, by - r, bx + r, by + r], radius=12, fill=INK)
    else:
        d.ellipse([bx - r, by - r, bx + r, by + r], fill=INK)
    tw = d.textlength("ZF", font=FZF)
    d.text((bx - tw / 2, by - 20), "ZF", font=FZF, fill=(250, 250, 248))

    img.save(os.path.join(OUT, fname), quality=90)
    print("  ->", fname)


make("mesh-boodschappentas-1.jpg", "square")
make("mesh-boodschappentas-2.jpg", "circle")
print("klaar")
