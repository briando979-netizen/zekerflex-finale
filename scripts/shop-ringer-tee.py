# -*- coding: utf-8 -*-
"""Productfoto's: slim fit contrast-T-shirt (ringer tee) heren, bio-katoen."""
import os, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = r"c:\Users\pc\Documents\zekerflex finale\public\shop"
os.makedirs(OUT, exist_ok=True)

W = H = 1000
CREAM   = (243, 238, 224)
CREAM_S = (232, 226, 209)   # schaduwvouw
GREEN   = (26, 92, 64)      # brand-500-achtig contrast
GREEN_D = (18, 68, 48)
INK     = (17, 17, 19)
BG      = (255, 255, 255)

try:
    FZF = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 30)
except Exception:
    FZF = ImageFont.load_default()

CX = W // 2


def tee_polygon():
    """front-silhouet van een slim-fit T-shirt"""
    return [
        (CX - 92, 235),   # linker schouder (hals)
        (CX - 235, 300),  # linker schouderpunt
        (CX - 300, 430),  # linker mouwhoek onder
        (CX - 205, 470),  # mouw binnenkant
        (CX - 172, 380),  # oksel
        (CX - 150, 760),  # linker zoom
        (CX + 150, 760),  # rechter zoom
        (CX + 172, 380),
        (CX + 205, 470),
        (CX + 300, 430),
        (CX + 235, 300),
        (CX + 92, 235),
    ]


def neck_arc(d, color, width):
    d.arc([CX - 92, 200, CX + 92, 300], 20, 160, fill=color, width=width)


def make(fname, back=False):
    img = Image.new("RGB", (W, H), BG)

    # schaduw
    sh = Image.new("RGB", (W, H), BG)
    ImageDraw.Draw(sh).polygon(tee_polygon(), fill=(214, 212, 206))
    img = Image.blend(img, sh.filter(ImageFilter.GaussianBlur(26)), 0.5)
    d = ImageDraw.Draw(img)

    # romp
    d.polygon(tee_polygon(), fill=CREAM)

    # zachte vouwen
    for x, w in [(-78, 26), (72, 22)]:
        d.line([(CX + x, 360), (CX + x + 12, 730)], fill=CREAM_S, width=w)
    img = img.filter(ImageFilter.GaussianBlur(9))
    d = ImageDraw.Draw(img)
    d.polygon(tee_polygon(), fill=None, outline=(228, 222, 206), width=3)
    d.polygon(tee_polygon(), fill=None, outline=(226, 220, 204), width=2)

    # groene mouwboorden
    for s in (-1, 1):
        d.line([(CX + s * 300, 430), (CX + s * 205, 470)], fill=GREEN, width=26)
        d.line([(CX + s * 300, 430), (CX + s * 205, 470)], fill=GREEN_D, width=8)

    # groene halsboord
    neck_arc(d, GREEN, 30)
    if back:
        # achterkant: dichte, hogere halslijn
        d.arc([CX - 92, 214, CX + 92, 286], 15, 165, fill=GREEN, width=26)
        d.arc([CX - 92, 214, CX + 92, 286], 15, 165, fill=CREAM, width=4)
    else:
        # voorkant: iets diepere ronding, binnenkant zichtbaar
        d.arc([CX - 78, 226, CX + 78, 300], 8, 172, fill=(214, 208, 191), width=6)
        neck_arc(d, GREEN, 26)

    # merklabel-strookje onderaan zijnaad
    d.rectangle([CX + 150 - 6, 690, CX + 150 + 2, 726], fill=INK)

    if not back:
        # ZF-badge linkerborst
        bx, by, r = CX + 92, 352, 30
        d.ellipse([bx - r, by - r, bx + r, by + r], fill=INK)
        tw = d.textlength("ZF", font=FZF)
        d.text((bx - tw / 2, by - 17), "ZF", font=FZF, fill=(250, 250, 248))

    img.save(os.path.join(OUT, fname), quality=90)
    print("  ->", fname)


make("ringer-tee-1.jpg", back=False)
make("ringer-tee-2.jpg", back=True)
print("klaar")
