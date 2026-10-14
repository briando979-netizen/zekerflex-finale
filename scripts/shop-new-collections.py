# -*- coding: utf-8 -*-
"""Productillustraties voor de nieuwe winter-/zakelijke/kids-collectie —
zelfde vlakke silhouet-stijl als shop-ringer-tee.py, geen nepfoto's."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = r"c:\Users\pc\Documents\zekerflex finale\public\shop"
os.makedirs(OUT, exist_ok=True)

W = H = 1000
BG = (255, 255, 255)
INK = (17, 17, 19)
MINT = (26, 92, 64)

try:
    FZF = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 26)
except Exception:
    FZF = ImageFont.load_default()

CX = W // 2


def shadow(img, polygon, color=(214, 212, 206), blur=26, mix=0.5):
    sh = Image.new("RGB", (W, H), BG)
    ImageDraw.Draw(sh).polygon(polygon, fill=color)
    return Image.blend(img, sh.filter(ImageFilter.GaussianBlur(blur)), mix)


def zf_badge(d, x, y, r=28, ink=INK, text_fill=(250, 250, 248)):
    d.ellipse([x - r, y - r, x + r, y + r], fill=ink)
    tw = d.textlength("ZF", font=FZF)
    d.text((x - tw / 2, y - 15), "ZF", font=FZF, fill=text_fill)


def vest_polygon(sleeveless=True):
    """bodywarmer / fleece vest — mouwloos, rechte schouderband"""
    return [
        (CX - 150, 230), (CX - 150, 290), (CX - 230, 340), (CX - 215, 420),
        (CX - 170, 400), (CX - 150, 740), (CX + 150, 740), (CX + 170, 400),
        (CX + 215, 420), (CX + 230, 340), (CX + 150, 290), (CX + 150, 230),
    ]


def make_vest(fname, body, body_shadow, trim, quilted=True, zipper=True):
    img = Image.new("RGB", (W, H), BG)
    poly = vest_polygon()
    img = shadow(img, poly)
    d = ImageDraw.Draw(img)
    d.polygon(poly, fill=body)
    if quilted:
        for yy in range(320, 720, 60):
            d.line([(CX - 140, yy), (CX + 140, yy)], fill=body_shadow, width=4)
    if zipper:
        d.line([(CX, 240), (CX, 735)], fill=(40, 40, 42), width=10)
        for yy in range(250, 735, 22):
            d.line([(CX - 5, yy), (CX + 5, yy)], fill=(70, 70, 72), width=3)
    d.arc([CX - 55, 206, CX + 55, 270], 10, 170, fill=trim, width=22)
    d.polygon(poly, outline=trim, width=4)
    img = img.filter(ImageFilter.GaussianBlur(1))
    d = ImageDraw.Draw(img)
    zf_badge(d, CX + 80, 330, ink=trim if trim != body else INK)
    img.save(os.path.join(OUT, fname), quality=90)
    print("  ->", fname)


def trouser_polygon():
    return [
        (CX - 135, 220), (CX + 135, 220), (CX + 150, 460),
        (CX + 95, 760), (CX + 20, 760), (CX + 10, 470),
        (CX - 10, 470), (CX - 20, 760), (CX - 95, 760), (CX - 150, 460),
    ]


def make_trouser(fname, body, body_shadow, belt_loops=False, quilted=False):
    img = Image.new("RGB", (W, H), BG)
    poly = trouser_polygon()
    img = shadow(img, poly)
    d = ImageDraw.Draw(img)
    d.polygon(poly, fill=body)
    d.line([(CX, 220), (CX, 460)], fill=body_shadow, width=5)
    if quilted:
        for yy in range(260, 740, 55):
            d.line([(CX - 110, yy), (CX - 20, yy)], fill=body_shadow, width=3)
            d.line([(CX + 20, yy), (CX + 110, yy)], fill=body_shadow, width=3)
    if belt_loops:
        for xx in (-100, -40, 20, 80):
            d.rectangle([CX + xx - 6, 216, CX + xx + 6, 240], fill=body_shadow)
    d.rectangle([CX - 135, 212, CX + 135, 232], fill=body_shadow)
    d.polygon(poly, outline=(0, 0, 0, 0), width=0)
    img.save(os.path.join(OUT, fname), quality=90)
    print("  ->", fname)


def shirt_polygon(fitted=False):
    waist = 130 if fitted else 150
    return [
        (CX - 92, 235), (CX - 235, 300), (CX - 300, 430), (CX - 205, 470),
        (CX - 172, 380), (CX - waist, 760), (CX + waist, 760), (CX + 172, 380),
        (CX + 205, 470), (CX + 300, 430), (CX + 235, 300), (CX + 92, 235),
    ]


def make_shirt(fname, body, trim, fitted=False, buttons=True, badge_color=None):
    img = Image.new("RGB", (W, H), BG)
    poly = shirt_polygon(fitted)
    img = shadow(img, poly)
    d = ImageDraw.Draw(img)
    d.polygon(poly, fill=body)
    d.line([(CX, 250), (CX, 745)], fill=trim, width=3)
    if buttons:
        for yy in range(300, 720, 60):
            d.ellipse([CX - 5, yy - 5, CX + 5, yy + 5], fill=trim)
    d.polygon([(CX - 92, 235), (CX - 40, 290), (CX, 250), (CX + 40, 290), (CX + 92, 235),
               (CX + 60, 300), (CX, 260), (CX - 60, 300)], fill=(255, 255, 255))
    d.line([(CX - 92, 235), (CX - 40, 290), (CX, 250)], fill=trim, width=3)
    d.line([(CX + 92, 235), (CX + 40, 290), (CX, 250)], fill=trim, width=3)
    for s in (-1, 1):
        d.line([(CX + s * 300, 430), (CX + s * 205, 470)], fill=trim, width=14)
    img = img.filter(ImageFilter.GaussianBlur(1))
    d = ImageDraw.Draw(img)
    zf_badge(d, CX + 92, 352, ink=badge_color or MINT)
    img.save(os.path.join(OUT, fname), quality=90)
    print("  ->", fname)


def kids_tee():
    s = 0.72
    return [
        (CX - int(92 * s), 320), (CX - int(235 * s), 370), (CX - int(300 * s), 460),
        (CX - int(205 * s), 495), (CX - int(172 * s), 430), (CX - int(150 * s), 700),
        (CX + int(150 * s), 700), (CX + int(172 * s), 430), (CX + int(205 * s), 495),
        (CX + int(300 * s), 460), (CX + int(235 * s), 370), (CX + int(92 * s), 320),
    ]


def make_kids_tee(fname, body, trim):
    img = Image.new("RGB", (W, H), BG)
    poly = kids_tee()
    img = shadow(img, poly, blur=20, mix=0.4)
    d = ImageDraw.Draw(img)
    d.polygon(poly, fill=body)
    d.arc([CX - 66, 294, CX + 66, 360], 15, 165, fill=trim, width=20)
    zf_badge(d, CX, 470, r=46, ink=trim)
    img.save(os.path.join(OUT, fname), quality=90)
    print("  ->", fname)


# Winter 2026
make_vest("thermo-bodywarmer-1.jpg", body=(28, 28, 32), body_shadow=(14, 14, 17), trim=(26, 92, 64), quilted=True, zipper=True)
make_vest("fleece-vest-1.jpg", body=(58, 58, 62), body_shadow=(40, 40, 44), trim=(26, 92, 64), quilted=False, zipper=True)
make_trouser("thermo-broek-1.jpg", body=(26, 26, 30), body_shadow=(14, 14, 17), belt_loops=False, quilted=True)

# Zakelijk
make_shirt("business-overhemd-1.jpg", body=(252, 252, 250), trim=(205, 205, 200), fitted=False, buttons=True, badge_color=(26, 92, 64))
make_shirt("business-blouse-1.jpg", body=(223, 236, 240), trim=(190, 208, 214), fitted=True, buttons=False, badge_color=(26, 92, 64))
make_trouser("chino-broek-1.jpg", body=(196, 169, 120), body_shadow=(168, 142, 96), belt_loops=True, quilted=False)

# Kids
make_kids_tee("kids-tshirt-1.jpg", body=(236, 246, 240), trim=(26, 92, 64))

print("klaar")
