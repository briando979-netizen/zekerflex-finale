"""
ZekerFlex Jarvis voor je laptop — Nederlandse spraakassistent.

Zeg "Jarvis, ..." en hij antwoordt hardop. Vragen over ZekerFlex (briefing,
voorstellen van de AI-teams, storingen, bezoekers, klussen, uren) gaan via een
persoonlijke sleutel naar ZekerFlex; simpele dingen (tijd, datum, taken,
websites openen) doet hij zelf, zonder internet.

Starten:  python jarvis.py            (spraak, wekwoord "Jarvis")
          python jarvis.py --tekst    (typen in plaats van praten)
Instellingen staan in .env (zie .env.example).
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
TASKS = HERE / "taken.txt"
WAKE = ("jarvis", "javis", "jervis", "service")  # speech-to-text hears "Jarvis" in many ways
TEXT_MODE = "--tekst" in sys.argv

# The Windows console is often cp1252: never crash on "→", "€" or emoji.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except Exception:
        pass


# ---------------------------------------------------------------- settings
def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    f = HERE / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return {**env, **{k: v for k, v in os.environ.items() if k.startswith("ZEKERFLEX_")}}


ENV = load_env()
BASE = ENV.get("ZEKERFLEX_URL", "https://www.zekerflex.com").rstrip("/")
TOKEN = ENV.get("ZEKERFLEX_TOKEN", "")


# ---------------------------------------------------------------- voice out
_engine = None


def speak(text: str) -> None:
    print(f"\nJarvis: {text}\n")
    if TEXT_MODE:
        return
    global _engine
    try:
        if _engine is None:
            import pyttsx3

            _engine = pyttsx3.init()
            _engine.setProperty("rate", 175)
            for v in _engine.getProperty("voices"):
                ident = f"{v.id} {v.name} {getattr(v, 'languages', '')}".lower()
                if "dutch" in ident or "nl-nl" in ident or "nl_nl" in ident or "frank" in ident or "colette" in ident:
                    _engine.setProperty("voice", v.id)
                    break
        _engine.say(text)
        _engine.runAndWait()
    except Exception as exc:  # no audio device etc. — text is already printed
        print(f"(spraak niet beschikbaar: {exc})")


# ---------------------------------------------------------------- voice in
_recognizer = None


def listen(prompt: str = "Ik luister…") -> str:
    if TEXT_MODE:
        try:
            return input("Jij: ").strip()
        except EOFError:
            return "stop"
    global _recognizer
    import speech_recognition as sr

    if _recognizer is None:
        _recognizer = sr.Recognizer()
        _recognizer.pause_threshold = 0.8
    with sr.Microphone() as source:
        print(prompt)
        _recognizer.adjust_for_ambient_noise(source, duration=0.4)
        audio = _recognizer.listen(source, phrase_time_limit=12)
    try:
        text = _recognizer.recognize_google(audio, language="nl-NL")
        print(f"Jij: {text}")
        return text
    except Exception:
        return ""


# ---------------------------------------------------------------- ZekerFlex
def ask_zekerflex(text: str) -> dict:
    if not TOKEN:
        return {"text": "Ik ben nog niet gekoppeld. Maak een sleutel aan in ZekerFlex, onder Admin, Laptop-Jarvis, en zet die in het bestand punt env."}
    req = urllib.request.Request(
        f"{BASE}/api/companion/ask",
        data=json.dumps({"text": text}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {"text": "Mijn sleutel werkt niet meer. Maak een nieuwe aan in ZekerFlex onder Laptop-Jarvis."}
        return {"text": f"ZekerFlex gaf een fout terug, code {e.code}."}
    except Exception:
        return {"text": "Ik kan ZekerFlex nu niet bereiken. Controleer je internetverbinding."}


# ---------------------------------------------------------------- local skills (from the old JARVIS)
SITES = {
    "zekerflex": BASE,
    "admin": f"{BASE}/admin",
    "voorstellen": f"{BASE}/admin/ai-teams",
    "analytics": f"{BASE}/admin/analytics",
    "youtube": "https://www.youtube.com",
    "spotify": "https://open.spotify.com",
    "gmail": "https://mail.google.com",
}


def local_skill(q: str) -> str | None:
    now = dt.datetime.now()
    if "hoe laat" in q or q in ("tijd", "de tijd"):
        return f"Het is {now:%H:%M}."
    if "datum" in q or "welke dag" in q:
        dagen = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]
        maanden = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
        return f"Het is {dagen[now.weekday()]} {now.day} {maanden[now.month - 1]} {now.year}."
    if q.startswith(("nieuwe taak", "taak toevoegen", "onthoud")):
        task = q.split(" ", 2)[-1] if q.startswith(("nieuwe taak", "taak toevoegen")) else q.replace("onthoud", "", 1)
        task = task.strip(" :,")
        if not task:
            return "Welke taak? Zeg bijvoorbeeld: nieuwe taak bel de accountant."
        with TASKS.open("a", encoding="utf-8") as f:
            f.write(task + "\n")
        return f"Genoteerd: {task}."
    if "taken wissen" in q or "wis mijn taken" in q:
        TASKS.unlink(missing_ok=True)
        return "Je eigen takenlijst is leeg gemaakt."
    if "mijn taken" in q or "lees mijn taken" in q:
        if not TASKS.exists() or not TASKS.read_text(encoding="utf-8").strip():
            return "Je hebt geen eigen taken genoteerd."
        items = [t for t in TASKS.read_text(encoding="utf-8").splitlines() if t.strip()]
        return f"Je hebt {len(items)} {'taak' if len(items) == 1 else 'taken'}: " + "; ".join(items) + "."
    if q.startswith("open "):
        target = q[5:].strip()
        for name, url in SITES.items():
            if name in target:
                webbrowser.open(url)
                return f"Ik open {name}."
        webbrowser.open(f"https://www.google.com/search?q={urllib.request.quote(target)}")
        return f"Ik zoek {target} op."
    if q.startswith(("zoek ", "google ")):
        term = q.split(" ", 1)[1]
        webbrowser.open(f"https://www.google.com/search?q={urllib.request.quote(term)}")
        return f"Ik zoek {term} op Google."
    return None


# ---------------------------------------------------------------- main loop
def strip_wake(text: str) -> str | None:
    t = text.lower().strip()
    for w in WAKE:
        if t.startswith(w):
            return t[len(w):].lstrip(" ,!.")
    return None


def handle(q: str) -> bool:
    """Returns False when Jarvis should stop."""
    if q in ("stop", "stoppen", "slaap", "ga slapen", "afsluiten", "tot ziens", "doei"):
        speak("Tot later.")
        return False
    reply = local_skill(q)
    if reply:
        speak(reply)
        return True
    res = ask_zekerflex(q)
    speak(res.get("text") or res.get("error", {}).get("message") or "Daar heb ik geen antwoord op.")
    if res.get("awaitingConfirm"):
        answer = listen("Zeg ja of nee…").lower()
        speak(ask_zekerflex(answer or "nee").get("text", "Oké."))
    return True


def main() -> None:
    hour = dt.datetime.now().hour
    groet = "Goedemorgen" if hour < 12 else "Goedemiddag" if hour < 18 else "Goedenavond"
    speak(f"{groet}. Jarvis staat klaar." + (" Typ je vraag." if TEXT_MODE else " Zeg Jarvis, gevolgd door je vraag."))
    if "--briefing" in sys.argv:
        handle("briefing")
    while True:
        heard = listen()
        if not heard:
            continue
        q = heard.lower().strip() if TEXT_MODE else strip_wake(heard)
        if q is None:
            continue  # not addressed to Jarvis
        if not q:
            speak("Ja?")
            q = listen().lower().strip()
            if not q:
                continue
        if not handle(q):
            break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nTot later.")
