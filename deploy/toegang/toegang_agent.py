#!/usr/bin/env python3
"""
ZekerFlex Toegang op kenteken: het kastje bij de slagboom.

Leest de camera (RTSP) uit, herkent kentekens met fast-alpr (vrije software,
draait op het kastje zelf), vraagt ZekerFlex of de auto nu het terrein op mag en
zet dan het relais van de slagboom open. Haalt ook elke 2 seconden op of een
beheerder op "Open slagboom" drukte.

Instellen via omgevingsvariabelen (zie .env.example):
  ZEKERFLEX_URL     https://zekerflex.com
  TOEGANG_TOKEN     het token van deze vestiging (Werkgever → Op locatie → Toegang)
  CAMERA_URL        rtsp://gebruiker:wachtwoord@192.168.1.20:554/stream1  (of 0 voor een usb-camera)
  CAMERA_NAAM       Inrit noord
  RELAIS            gpio:17 | usbrelay:1 | http://192.168.1.30/relay/0?turn=on | geen
  HERKENNING_DREMPEL 0.8    (zekerheid van de herkenning, 0–1)
  HERHAAL_SECONDEN  20      (hetzelfde kenteken niet vaker dan eens per zoveel seconden melden)
  APPARAAT          naam van dit kastje in ZekerFlex (standaard de hostnaam)

Geen camera of fast-alpr bij de hand? Start met PROEF=1: dan typ je kentekens
in de terminal en gebeurt verder alles hetzelfde (handig om het token en het
relais te testen).
"""
from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request

URL = os.environ.get("ZEKERFLEX_URL", "https://zekerflex.com").rstrip("/")
TOKEN = os.environ.get("TOEGANG_TOKEN", "")
CAMERA = os.environ.get("CAMERA_URL", "0")
CAMERA_NAAM = os.environ.get("CAMERA_NAAM", "camera")
RELAIS = os.environ.get("RELAIS", "geen")
DREMPEL = float(os.environ.get("HERKENNING_DREMPEL", "0.8"))
HERHAAL = int(os.environ.get("HERHAAL_SECONDEN", "20"))
APPARAAT = os.environ.get("APPARAAT", socket.gethostname())
PROEF = os.environ.get("PROEF", "") == "1"


def log(*delen: object) -> None:
    print(time.strftime("%H:%M:%S"), *delen, flush=True)


def vraag(pad: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        URL + pad,
        data=data,
        method="POST" if body is not None else "GET",
        headers={"Content-Type": "application/json", "x-toegang-token": TOKEN, "x-apparaat": APPARAAT, "User-Agent": "zekerflex-toegang/1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            return {"ok": False, "reden": f"http-{e.code}"}
    except Exception as e:  # netwerk weg: de slagboom blijft dicht, we proberen het later weer
        return {"ok": False, "reden": f"verbinding: {e}"}


# ─────────────────────────── het relais ───────────────────────────

def relais_open(seconden: float) -> None:
    """Zet het relais zoveel seconden aan. gpio:<pin> (Raspberry Pi), usbrelay:<nummer>, http://… of geen."""
    if RELAIS == "geen":
        log(f"[relais] zou {seconden:.0f} s open gaan (RELAIS=geen)")
        return
    if RELAIS.startswith("gpio:"):
        pin = int(RELAIS.split(":", 1)[1])
        try:
            import RPi.GPIO as GPIO  # type: ignore

            GPIO.setmode(GPIO.BCM)
            GPIO.setup(pin, GPIO.OUT)
            GPIO.output(pin, GPIO.HIGH)
            time.sleep(seconden)
            GPIO.output(pin, GPIO.LOW)
        except Exception as e:
            log("[relais] gpio mislukt:", e)
        return
    if RELAIS.startswith("usbrelay:"):
        nummer = RELAIS.split(":", 1)[1]
        os.system(f"usbrelay {nummer}=1 >/dev/null 2>&1")
        time.sleep(seconden)
        os.system(f"usbrelay {nummer}=0 >/dev/null 2>&1")
        return
    if RELAIS.startswith("http"):
        # een netwerkrelais (Shelly, Tasmota): aan-adres in RELAIS, uit = zelfde adres met off
        try:
            urllib.request.urlopen(RELAIS, timeout=4).read()
            time.sleep(seconden)
            urllib.request.urlopen(RELAIS.replace("turn=on", "turn=off").replace("Power%20On", "Power%20Off"), timeout=4).read()
        except Exception as e:
            log("[relais] http mislukt:", e)
        return
    log("[relais] onbekende instelling:", RELAIS)


# ─────────────────────────── opdrachten van de beheerder ───────────────────────────

def opdrachten_lus() -> None:
    while True:
        d = vraag("/api/toegang/opdrachten")
        for o in d.get("opdrachten", []) if d.get("ok") else []:
            log(f"[open] handmatig door {o.get('door')} ({o.get('seconden', 3)} s)")
            relais_open(float(o.get("seconden", 3)))
        time.sleep(2)


# ─────────────────────────── kentekens ───────────────────────────

laatst_gemeld: dict[str, float] = {}


def meld_kenteken(kenteken: str) -> None:
    nu = time.time()
    k = "".join(ch for ch in kenteken.upper() if ch.isalnum())
    if not k or nu - laatst_gemeld.get(k, 0) < HERHAAL:
        return
    laatst_gemeld[k] = nu
    d = vraag("/api/toegang/kenteken", {"kenteken": k, "camera": CAMERA_NAAM, "apparaat": APPARAAT})
    if not d.get("ok"):
        log(f"[kenteken] {k}: fout {d.get('reden')} {d.get('tekst', '')}")
        return
    if d.get("open"):
        log(f"[kenteken] {d.get('kenteken', k)} → OPEN ({d.get('naam', '')}, {d.get('tekst')})")
        relais_open(float(d.get("seconden", 3)))
    else:
        log(f"[kenteken] {d.get('kenteken', k)} → dicht ({d.get('tekst')})")


def camera_lus() -> None:
    try:
        import cv2  # type: ignore
        from fast_alpr import ALPR  # type: ignore
    except Exception as e:
        log("fast-alpr of opencv ontbreekt (pip install -r requirements.txt):", e)
        log("Start met PROEF=1 om zonder camera te testen.")
        sys.exit(1)
    alpr = ALPR(detector_model="yolo-v9-t-384-license-plate-end2end", ocr_model="european-plates-mobile-vit-v2-model")
    bron = int(CAMERA) if CAMERA.isdigit() else CAMERA
    while True:
        cap = cv2.VideoCapture(bron)
        if not cap.isOpened():
            log("camera niet bereikbaar, opnieuw over 10 s:", CAMERA)
            time.sleep(10)
            continue
        log("camera verbonden:", CAMERA_NAAM)
        teller = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                log("beeld weggevallen, camera opnieuw verbinden")
                break
            teller += 1
            if teller % 5:  # 1 op 5 beelden is ruim genoeg voor een auto die aanrijdt
                continue
            try:
                for r in alpr.predict(frame):
                    ocr = getattr(r, "ocr", None)
                    if ocr and getattr(ocr, "confidence", 0) >= DREMPEL and getattr(ocr, "text", ""):
                        meld_kenteken(ocr.text)
            except Exception as e:
                log("herkenning mislukt:", e)
        cap.release()
        time.sleep(2)


def proef_lus() -> None:
    log("PROEF: typ een kenteken en druk op Enter (Ctrl+C om te stoppen).")
    for regel in sys.stdin:
        regel = regel.strip()
        if regel:
            laatst_gemeld.clear()
            meld_kenteken(regel)


def main() -> None:
    if not TOKEN:
        log("TOEGANG_TOKEN ontbreekt. Maak een token onder Werkgever → Op locatie → Toegang.")
        sys.exit(1)
    d = vraag("/api/toegang/kenteken")
    if not d.get("ok"):
        log("token afgewezen:", d.get("tekst") or d.get("reden"))
        sys.exit(1)
    log(f"gekoppeld aan {d.get('bedrijf')} · {d.get('vestiging')} · module {'aan' if d.get('moduleAan') else 'UIT (zet aan in ZekerFlex)'}")
    threading.Thread(target=opdrachten_lus, daemon=True).start()
    if PROEF:
        proef_lus()
    else:
        camera_lus()


if __name__ == "__main__":
    main()
