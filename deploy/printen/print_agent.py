#!/usr/bin/env python3
"""
ZekerFlex printagent: haalt de labelwachtrij van het bedrijf op en print via het
printsysteem van deze computer (CUPS op Linux en Mac, de gewone printer op
Windows). Geen printsoftware van een ander nodig.

Twee manieren:
  ESC/POS (bonprinters, goedkope labelprinters): de ruwe bytes van ZekerFlex
     rechtstreeks naar de printer (lp -o raw, of een netwerkprinter op poort 9100).
  Afdrukpagina (Brother QL, Dymo, Zebra met driver): de agent opent per label de
     afdrukpagina van ZekerFlex in een headless browser en print die als PDF.
     Daarvoor is Chromium nodig; zonder Chromium gebruikt de agent ESC/POS.

Instellen via omgevingsvariabelen (zie .env.example):
  ZEKERFLEX_URL   https://zekerflex.com
  PRINT_TOKEN     het token van de agent (Werkgever → Op locatie → Badges en labels)
  PRINTER         de printernaam in CUPS (lpstat -p) of host:9100 voor een netwerkprinter; leeg = standaardprinter
  ROL             58 of 80 (mm, voor ESC/POS)
  WIJZE           escpos | pagina
  INTERVAL        seconden tussen twee keer ophalen (standaard 3)
"""
from __future__ import annotations

import base64
import json
import os
import platform
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

URL = os.environ.get("ZEKERFLEX_URL", "https://zekerflex.com").rstrip("/")
TOKEN = os.environ.get("PRINT_TOKEN", "")
PRINTER = os.environ.get("PRINTER", "")
ROL = os.environ.get("ROL", "58")
WIJZE = os.environ.get("WIJZE", "escpos")
INTERVAL = int(os.environ.get("INTERVAL", "3"))


def log(*delen: object) -> None:
    print(time.strftime("%H:%M:%S"), *delen, flush=True)


def vraag(pad: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        URL + pad,
        data=data,
        method="POST" if body is not None else "GET",
        headers={"Content-Type": "application/json", "x-print-token": TOKEN, "x-printer": PRINTER or "standaard", "x-rol": ROL, "User-Agent": "zekerflex-printagent/1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            return {"ok": False, "reden": f"http-{e.code}"}
    except Exception as e:
        return {"ok": False, "reden": f"verbinding: {e}"}


def print_escpos(bytes_: bytes) -> str:
    """Ruwe bytes naar de printer: netwerk (host:9100) of via CUPS/lp -o raw."""
    if ":" in PRINTER and not PRINTER.startswith("/"):
        host, poort = PRINTER.rsplit(":", 1)
        with socket.create_connection((host, int(poort)), timeout=10) as s:
            s.sendall(bytes_)
        return PRINTER
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        f.write(bytes_)
        pad = f.name
    try:
        if platform.system() == "Windows":
            # Windows: kopieer de ruwe bytes naar de gedeelde printer (\\localhost\naam)
            doel = PRINTER if PRINTER.startswith("\\\\") else f"\\\\localhost\\{PRINTER}"
            subprocess.run(["cmd", "/c", "copy", "/b", pad, doel], check=True, capture_output=True)
            return PRINTER
        cmd = ["lp", "-o", "raw", pad] if not PRINTER else ["lp", "-d", PRINTER, "-o", "raw", pad]
        subprocess.run(cmd, check=True, capture_output=True)
        return PRINTER or "standaardprinter"
    finally:
        try:
            os.unlink(pad)
        except OSError:
            pass


def print_pagina(opdracht_id: str, formaat: dict) -> str:
    """De afdrukpagina van ZekerFlex als PDF via Chromium, dan naar de printer op labelformaat."""
    chromium = next((c for c in ["chromium", "chromium-browser", "google-chrome", "chrome"] if subprocess.run(["which", c], capture_output=True).returncode == 0), None)
    if not chromium:
        raise RuntimeError("geen Chromium gevonden; gebruik WIJZE=escpos")
    pdf = tempfile.mktemp(suffix=".pdf")
    # de afdrukpagina staat achter de login; de agent heeft geen sessie, dus deze wijze werkt alleen
    # met een ingelogde browserprofielmap (CHROME_PROFIEL), zie README
    profiel = os.environ.get("CHROME_PROFIEL", "")
    args = [chromium, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={pdf}"]
    if profiel:
        args.append(f"--user-data-dir={profiel}")
    args.append(f"{URL}/werkgever/op-locatie/print/{opdracht_id}")
    subprocess.run(args, check=True, capture_output=True, timeout=60)
    b, h = formaat.get("breedte", 62), formaat.get("hoogte", 100) or 100
    media = f"Custom.{b}x{h}mm"
    cmd = ["lp", "-o", f"media={media}", "-o", "fit-to-page", pdf] if not PRINTER else ["lp", "-d", PRINTER, "-o", f"media={media}", "-o", "fit-to-page", pdf]
    subprocess.run(cmd, check=True, capture_output=True)
    return PRINTER or "standaardprinter"


def main() -> None:
    if not TOKEN:
        log("PRINT_TOKEN ontbreekt. Maak een token onder Werkgever → Op locatie → Badges en labels.")
        sys.exit(1)
    log(f"printagent gestart · {URL} · printer {PRINTER or 'standaard'} · {WIJZE} · rol {ROL} mm")
    geprint: set[str] = set()
    while True:
        d = vraag("/api/printen/agent")
        if not d.get("ok"):
            log("ophalen mislukt:", d.get("tekst") or d.get("reden"))
            time.sleep(max(INTERVAL, 10))
            continue
        if d.get("moduleAan") is False:
            log("de module Badges en labels staat uit in ZekerFlex; niets te printen")
            time.sleep(30)
            continue
        for o in d.get("opdrachten", []):
            oid = o["id"]
            if oid in geprint:
                continue
            try:
                if WIJZE == "pagina":
                    printer = print_pagina(oid, o.get("formaat", {}))
                else:
                    printer = print_escpos(base64.b64decode(o["escpos"]))
                geprint.add(oid)
                log(f"geprint: {o['inhoud'].get('kop')} ({o['inhoud'].get('soort')}) op {printer}")
                vraag("/api/printen/agent", {"id": oid, "status": "geprint", "printer": printer})
            except Exception as e:
                log(f"mislukt: {o['inhoud'].get('kop')}: {e}")
                vraag("/api/printen/agent", {"id": oid, "status": "mislukt", "fout": str(e)[:280]})
                geprint.add(oid)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
