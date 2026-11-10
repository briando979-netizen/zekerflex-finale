#!/usr/bin/env python3
"""ZekerFlex live-zetter — draait op de VPS, buiten Docker (systemd: zf-live.service).

Admin → ZekerFlex AI → "Live zetten" legt een verzoek in de database (KV-sleutel
bouwer:live:verzoek). Deze dienst pakt het op en doet wat anders een ssh-sessie
deed, zonder Claude:

  1. de nieuwste main ophalen (eigen git-kopie): eerst bij onze eigen Git-server
     (Forgejo), met GitHub als reserve; bij een verschil wint de nieuwste
  2. controleren: staat de live versie op main? zijn er database-wijzigingen?
     Database-wijzigingen alleen met akkoord op precies die migraties, en pas
     na een geslaagde proef op de echte database in BEGIN … ROLLBACK.
  3. de controle vóór het bouwen: TypeScript, eslint en tests op precies die
     vastlegging, in de Bouwer-container (deploy/bouwer/werker/controle.mjs).
     Faalt die, dan gaat de versie niet live, tenzij "zonder controle" is gevraagd.
  4. code uitpakken over ~/zekerflex en deploy/scripts/vps-update.sh draaien
     (bouwen, eventueel migreren vóór de start, starten, Caddy herladen)
  5. wachten tot de nieuwe app gezond is; zo niet, zelf de vorige terugzetten

Stap, uitkomst en log schrijft hij terug naar de KV (bouwer:live:status/log), en
elke 30 s een hartslag. Alleen standaardbibliotheek; praat met Postgres via
`docker exec psql`, zodat er geen poort of wachtwoord nodig is.

Installeren: sudo bash deploy/bouwer/installeer-live.sh
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

ZF_DIR = os.environ.get("ZF_DIR", os.path.expanduser("~/zekerflex"))
SRC = os.environ.get("ZF_SRC", os.path.expanduser("~/.zf-bron"))
REPO = os.environ.get("ZF_REPO", "https://github.com/briando979-netizen/zekerflex-finale.git")
# Onze eigen Git-server (deploy/forgejo): een privé spiegel van GitHub. Het leestoken
# (gebruiker bouwer-lezen, alleen lezen) staat alleen in een bestand van root (600).
FORGEJO = os.environ.get("ZF_FORGEJO_REPO", "https://git.37-97-226-24.sslip.io/zekerflex/zekerflex-finale.git")
FORGEJO_TOKEN_BESTAND = os.environ.get("ZF_FORGEJO_TOKEN_BESTAND", "/root/forgejo-lezen.token")
PG =os.environ.get("ZF_PG_CONTAINER", "zekerflex-postgres-1")
APP = os.environ.get("ZF_APP_CONTAINER", "zekerflex-app-1")
BOUWER = os.environ.get("ZF_BOUWER_CONTAINER", "zekerflex-bouwer-1")
LOGBESTAND = "/tmp/zf-live.log"
COMPOSE = ["sudo", "docker", "compose", "-f", "docker-compose.vps.yml", "--env-file", ".env.production"]
VERSIE = 2

# Namen van de onderdelen van de controle (controle.mjs) in de melding naar de eigenaar.
CONTROLE_NAAM = {"tsc": "TypeScript", "eslint": "eslint", "tests": "de tests"}

K_VERZOEK = "bouwer:live:verzoek"
K_STATUS = "bouwer:live:status"
K_LOG = "bouwer:live:log"
K_HARTSLAG = "bouwer:live:hartslag"

# Serveronderhoud: alleen deze diensten mag de knop herstarten (database en redis bewust niet).
ONDERHOUD_HERSTART = {"herstart-app": "app", "herstart-bouwer": "bouwer", "herstart-caddy": "caddy", "herstart-cron": "cron"}

# Een migratie die data of kolommen weggooit vraagt een extra, expliciet akkoord.
DESTRUCTIEF = re.compile(
    r"\b(DROP\s+(TABLE|COLUMN|SCHEMA|INDEX|TYPE)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE)\b",
    re.IGNORECASE,
)
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


def nu() -> str:
    return datetime.now(timezone.utc).isoformat()


def meld(tekst: str) -> None:
    print(f"[zf-live] {tekst}", flush=True)


# ---- Postgres-KV via docker exec ------------------------------------------------

def sql(query: str, **variabelen: str) -> str:
    """psql met variabelen (:'naam' in de query wordt veilig gequote)."""
    args = ["docker", "exec", "-i", PG, "psql", "-U", "zekerflex", "-d", "zekerflex", "-v", "ON_ERROR_STOP=1", "-qtA"]
    for k, v in variabelen.items():
        args += ["-v", f"{k}={v}"]
    r = subprocess.run(args, input=query, capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        raise RuntimeError(f"psql: {r.stderr.strip()[:300]}")
    return r.stdout.strip()


def kv_zet(key: str, waarde: object) -> None:
    sql(
        """INSERT INTO "KeyValueStore"(key, value, "createdAt", "updatedAt")
           VALUES (:'k', :'v'::jsonb, now(), now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();""",
        k=key,
        v=json.dumps(waarde, ensure_ascii=False),
    )


def kv_pak(key: str) -> dict | None:
    """Lees én wis in één stap, zodat een verzoek nooit twee keer wordt uitgevoerd."""
    raw = sql("""DELETE FROM "KeyValueStore" WHERE key = :'k' RETURNING value::text;""", k=key)
    return json.loads(raw) if raw else None


# ---- shell-hulpjes -----------------------------------------------------------------

def run(args: list[str], cwd: str | None = None, timeout: int = 600, env: dict | None = None) -> tuple[int, str]:
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
    return r.returncode, (r.stdout + r.stderr).strip()


def git(*args: str, timeout: int = 300) -> str:
    code, out = run(["git", "-C", SRC, *args], timeout=timeout)
    if code != 0:
        raise RuntimeError(f"git {' '.join(args[:2])}: {out[-300:]}")
    return out


# ---- waar de code vandaan komt ------------------------------------------------------
# Eerst onze eigen Git-server, met GitHub als reserve. Er wordt nog naar GitHub gepusht
# en de spiegel loopt tot 10 minuten achter: voor main halen we bij allebei op en
# kiezen we de nieuwste; ligt er één plat, dan de andere. Het token gaat via een
# credential helper uit de omgeving van alleen dat git-proces: nooit in een URL, een
# opdrachtregel of het log.

BRONNEN = (("forgejo", FORGEJO), ("github", REPO))
BRON_NAAM = {"forgejo": "onze eigen Git-server", "github": "GitHub"}


def forgejo_token() -> str | None:
    try:
        r = subprocess.run(["sudo", "-n", "cat", FORGEJO_TOKEN_BESTAND], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return None
    t = r.stdout.strip() if r.returncode == 0 else ""
    return t or None


def bron_git(bron: str, url: str, args: list[str], cwd: str | None, timeout: int) -> tuple[int, str]:
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    opties: list[str] = []
    if bron == "forgejo":
        token = forgejo_token()
        if token:
            host = re.match(r"https://[^/]+", url)
            if host:
                env["ZF_FORGEJO_TOKEN"] = token
                helper = "!f() { if [ \"$1\" = get ]; then printf 'username=bouwer-lezen\\npassword=%s\\n' \"$ZF_FORGEJO_TOKEN\"; fi; }; f"
                opties = ["-c", f"credential.{host.group(0)}.helper=", "-c", f"credential.{host.group(0)}.helper={helper}"]
    return run(["git", *opties, *args], cwd=cwd, timeout=timeout, env=env)


def kloon_bron() -> str:
    """Eerste keer klonen: eerst Forgejo, anders GitHub. origin wijst daarna altijd naar GitHub."""
    fouten = []
    for bron, url in BRONNEN:
        # een half gelukte kloon van de vorige poging weg; alleen onze eigen map zonder .git
        if SRC.endswith(".zf-bron") and os.path.isdir(SRC) and not os.path.isdir(os.path.join(SRC, ".git")):
            shutil.rmtree(SRC, ignore_errors=True)
        code, out = bron_git(bron, url, ["clone", "-q", "--depth", "300", "--branch", "main", url, SRC], None, 900)
        if code == 0:
            run(["git", "-C", SRC, "remote", "set-url", "origin", REPO], timeout=30)
            return bron
        fouten.append(f"{BRON_NAAM[bron]}: {out[-160:]}")
    raise RuntimeError("git clone mislukt bij allebei: " + " | ".join(fouten))


def haal_main() -> tuple[str, str, list[str]]:
    """Main bij Forgejo en GitHub; geeft (sha van de nieuwste, bron, meldingen)."""
    gevonden: dict[str, str] = {}
    meldingen: list[str] = []
    for bron, url in BRONNEN:
        code, out = bron_git(bron, url, ["-C", SRC, "fetch", "-q", "--depth", "300", url, f"+refs/heads/main:refs/remotes/{bron}/main"], None, 600)
        if code == 0:
            gevonden[bron] = git("rev-parse", f"refs/remotes/{bron}/main")
        else:
            meldingen.append(f"main ophalen bij {BRON_NAAM[bron]} mislukte: {out[-160:]}")
    f, g = gevonden.get("forgejo"), gevonden.get("github")
    if not f and not g:
        raise RuntimeError("Main is niet op te halen: onze eigen Git-server en GitHub zijn allebei niet bereikbaar. " + " | ".join(meldingen))
    sha, bron = (f, "forgejo") if f else (g, "github")
    # de spiegel loopt achter (of ze lopen uit elkaar): dan wint GitHub, waar gepusht wordt
    if f and g and f != g and run(["git", "-C", SRC, "merge-base", "--is-ancestor", g, f], timeout=30)[0] != 0:
        sha, bron = g, "github"
    git("update-ref", "refs/remotes/origin/main", sha)
    return sha, bron, meldingen


class Uitrol:
    def __init__(self, verzoek: dict):
        self.v = verzoek
        self.status = {
            "id": str(verzoek.get("id", "")),
            "actie": verzoek.get("actie", "uitrollen"),
            "staat": "bezig",
            "stap": "Verzoek opgepakt",
            "bericht": "",
            "door": str(verzoek.get("door", "")),
            "begon": nu(),
            "bijgewerkt": nu(),
            "migraties": [],
        }
        self.log = open(LOGBESTAND, "w", encoding="utf-8")
        self._klaar = threading.Event()
        self._laatste_log = ""

    # -- voortgang naar de app --
    def zet(self, **velden: object) -> None:
        self.status.update(velden)
        self.status["bijgewerkt"] = nu()
        if self.status["staat"] != "bezig":
            self.status["klaar"] = nu()
        kv_zet(K_STATUS, self.status)

    def stap(self, tekst: str) -> None:
        self.schrijf(f"==> {tekst}")
        self.zet(stap=tekst)

    def schrijf(self, regel: str) -> None:
        self.log.write(ANSI.sub("", regel).rstrip() + "\n")
        self.log.flush()

    def _log_pomp(self) -> None:
        # ook de hartslag: de hoofdlus staat stil zolang de uitrol loopt
        slag = 0.0
        while not self._klaar.wait(3):
            self._duw_log()
            if time.time() - slag > 30:
                try:
                    hartslag(bezig=True)
                except Exception as e:
                    meld(f"hartslag mislukt: {e}")
                slag = time.time()
        self._duw_log()

    def _duw_log(self) -> None:
        try:
            with open(LOGBESTAND, encoding="utf-8", errors="replace") as f:
                regels = f.read().splitlines()[-200:]
            tekst = "\n".join(regels)
            if tekst != self._laatste_log:
                kv_zet(K_LOG, {"id": self.status["id"], "regels": regels})
                self._laatste_log = tekst
        except Exception as e:  # log mag de uitrol nooit breken
            meld(f"log niet bijgewerkt: {e}")

    def stroom(self, args: list[str], env_extra: dict | None = None, timeout: int = 2400) -> tuple[int, str]:
        """Draai een commando en schrijf de uitvoer regel voor regel in het log."""
        env = {**os.environ, **(env_extra or {})}
        p = subprocess.Popen(args, cwd=ZF_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        staart: list[str] = []
        begin = time.time()
        assert p.stdout is not None
        for regel in p.stdout:
            self.schrijf(regel)
            staart = (staart + [regel.rstrip()])[-40:]
            if time.time() - begin > timeout:
                p.kill()
                self.schrijf("!! afgebroken: duurde te lang")
                break
        return p.wait(), "\n".join(staart)

    # -- de stappen --
    def uitvoeren(self) -> None:
        pomp = threading.Thread(target=self._log_pomp, daemon=True)
        pomp.start()
        # zelfde vergrendeling als vps-update.sh; de Bouwer leest hem om te wachten
        os.makedirs(os.path.join(ZF_DIR, ".zf-slot"), exist_ok=True)
        slot = open(os.path.join(ZF_DIR, ".zf-slot", "deploy.lock"), "w")
        try:
            try:
                fcntl.flock(slot, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                self.zet(staat="mislukt", bericht="Er loopt al een andere uitrol op de server. Probeer het over een paar minuten opnieuw.")
                return
            if self.status["actie"] == "terug":
                self.terugzetten(automatisch=False)
            elif self.status["actie"] == "onderhoud":
                self.onderhoud(str(self.v.get("taak", "")))
            else:
                self.uitrollen()
        except Exception as e:
            self.schrijf(f"!! {e}")
            self.zet(staat="mislukt", bericht=f"Onverwachte fout: {e}"[:400])
        finally:
            fcntl.flock(slot, fcntl.LOCK_UN)
            slot.close()
            self._klaar.set()
            pomp.join(timeout=10)
            self.log.close()

    def live_sha(self) -> str | None:
        code, out = run(["docker", "exec", APP, "cat", "/app/VERSIE"], timeout=20)
        eerste = out.splitlines()[0].strip() if code == 0 and out else ""
        return eerste if re.fullmatch(r"[0-9a-f]{40}", eerste) else None

    def uitrollen(self) -> None:
        self.stap("Nieuwste versie ophalen (eigen Git-server, GitHub als reserve)")
        if not os.path.isdir(os.path.join(SRC, ".git")):
            self.schrijf(f"eerste kopie via {BRON_NAAM[kloon_bron()]}")
        doel, bron, meldingen = haal_main()
        for m in meldingen:
            self.schrijf(m)
        onderwerp = git("log", "-1", "--format=%s", doel)
        self.zet(doel=doel, doelOnderwerp=onderwerp)
        self.schrijf(f"doel: {doel[:10]} {onderwerp} (via {BRON_NAAM[bron]})")

        live = self.live_sha()
        forceer = bool(self.v.get("forceer"))
        self.schrijf(f"live: {live[:10] if live else 'onbekend'}")
        if live == doel and not forceer:
            self.zet(staat="klaar", stap="Niets te doen", bericht="De live versie is al de nieuwste.", kanForceren=True)
            return
        if live and not forceer:
            bekend = run(["git", "-C", SRC, "cat-file", "-e", f"{live}^{{commit}}"])[0] == 0
            voorouder = bekend and run(["git", "-C", SRC, "merge-base", "--is-ancestor", live, doel])[0] == 0
            if not voorouder:
                self.zet(
                    staat="mislukt",
                    stap="Gestopt voor de zekerheid",
                    bericht="De live versie bevat wijzigingen die (nog) niet op GitHub main staan. Iemand rolde waarschijnlijk uit zonder eerst te pushen. Push die eerst, of zet toch live (dan verdwijnen die wijzigingen van de site).",
                    kanForceren=True,
                )
                return

        self.stap("Database-wijzigingen controleren")
        wachtend, half = self.migratie_stand(doel)
        if half:
            self.zet(
                staat="mislukt",
                bericht=f"Een eerdere database-wijziging is half mislukt ({', '.join(half)}). Die moet eerst met de hand worden opgelost.",
            )
            return
        migraties = []
        for naam in wachtend:
            code, inhoud = run(["git", "-C", SRC, "show", f"{doel}:prisma/migrations/{naam}/migration.sql"])
            inhoud = inhoud if code == 0 else ""
            migraties.append({"naam": naam, "destructief": bool(DESTRUCTIEF.search(inhoud)), "sql": inhoud[:6000]})
        self.zet(migraties=migraties)
        if migraties:
            akkoord = sorted(self.v.get("migraties") or []) == sorted(wachtend)
            destructief_ok = bool(self.v.get("destructiefAkkoord")) or not any(m["destructief"] for m in migraties)
            if not (akkoord and destructief_ok):
                self.zet(
                    staat="wacht-op-akkoord",
                    stap="Wacht op akkoord",
                    bericht=f"Deze versie wijzigt de database ({len(migraties)} wijziging{'en' if len(migraties) != 1 else ''}). Bekijk ze en geef akkoord om live te zetten.",
                )
                return
            self.schrijf(f"akkoord voor {len(migraties)} database-wijziging(en): {', '.join(wachtend)}")
            self.stap("Database-wijzigingen proefdraaien")
            fout = self.proefdraai(doel, wachtend)
            if fout:
                self.zet(
                    staat="mislukt",
                    bericht=f"De database-wijziging zou mislukken, dus er is niets veranderd en de vorige versie draait gewoon door. {fout}",
                )
                return

        self.stap("Controleren vóór het bouwen (TypeScript, eslint, tests)")
        uitslag = self.controle(doel, live)
        if uitslag is None:
            self.schrijf("controle overgeslagen; de bouw controleert TypeScript nog wel")
        else:
            kort = {
                "ok": bool(uitslag.get("ok")),
                "sha": str(uitslag.get("sha") or doel),
                "duurSec": uitslag.get("duurSec"),
                "tsc": bool((uitslag.get("tsc") or {}).get("ok", True)),
                "eslint": bool((uitslag.get("eslint") or {}).get("ok", True)),
                "tests": bool((uitslag.get("tests") or {}).get("ok", True)),
            }
            self.zet(controle=kort)
            if kort["ok"]:
                self.schrijf(f"controle schoon ({kort['duurSec'] if kort['duurSec'] is not None else '?'} s)")
            else:
                falen = [CONTROLE_NAAM[n] for n in ("tsc", "eslint", "tests") if not kort[n]]
                if self.v.get("zonderControle"):
                    self.schrijf(f"!! controle faalt op {', '.join(falen)}, maar 'zonder controle' is gevraagd door {self.status['door']}")
                else:
                    self.zet(
                        staat="mislukt",
                        stap="Controle faalt",
                        bericht=(
                            f"Niet live gezet: de controle faalt op {', '.join(falen)}. De vorige versie draait gewoon door. "
                            "Bekijk de uitslag bij Controles, los het op (of laat de Bouwer het oplossen) en zet dan live. "
                            "Toch live zetten kan met 'Zonder controle live zetten'."
                        ),
                        kanZonderControle=True,
                    )
                    return

        self.stap("Code klaarzetten op de server")
        archief = subprocess.Popen(["git", "-C", SRC, "archive", doel], stdout=subprocess.PIPE)
        tar = subprocess.run(["tar", "xf", "-", "-C", ZF_DIR, "--no-same-owner"], stdin=archief.stdout, capture_output=True, text=True)
        if archief.stdout:
            archief.stdout.close()
        if archief.wait() != 0 or tar.returncode != 0:
            raise RuntimeError(f"uitpakken mislukt: {tar.stderr[-300:]}")
        # git archive voegt toe maar wist niets: achterblijvers naar quarantaine
        self.opruimen(doel)

        self.stap("Bouwen en starten (enkele minuten)" + (" met database-wijzigingen" if migraties else ""))
        env = {"ZF_DEPLOY_LOCKED": "1"}
        if migraties:
            env["ZF_MIGREER"] = "1"
        code, staart = self.stroom(["bash", "deploy/scripts/vps-update.sh"], env_extra=env)
        if code != 0 or "DEPLOY_EXIT=0" not in staart:
            reden = "de database-wijziging mislukte" if "MIGRATIE_MISLUKT" in staart else "het bouwen mislukte"
            self.zet(staat="mislukt", bericht=f"Niet live gezet: {reden}. De vorige versie draait gewoon door. Zie het log.")
            return

        self.stap("Controleren of de nieuwe versie gezond is")
        if not self.gezond():
            self.schrijf("!! nieuwe versie niet gezond, vorige versie terugzetten")
            self.terugzetten(automatisch=True)
            return
        nieuw = self.live_sha()
        self.zet(
            staat="klaar",
            stap="Live",
            bericht=f"Live: {onderwerp}" + (" (versie kon niet worden bevestigd)" if nieuw != doel else ""),
        )

    def controle(self, doel: str, live: str | None) -> dict | None:
        """TypeScript, eslint en tests op precies deze vastlegging, in de Bouwer-container
        (deploy/bouwer/werker/controle.mjs). Voortgang komt regel voor regel in het log, de
        uitslag als JSON. None = de controle kon niet draaien (Bouwer niet geïnstalleerd of
        het script ontbreekt nog): dan gaat de uitrol door, met een regel in het log.
        Dit proces houdt de uitrol-vergrendeling vast, dus --geen-wacht."""
        args = ["docker", "exec", BOUWER, "node", "/opt/bouwer/controle.mjs", "--sha", doel, "--geen-wacht", "--door", "live-zetter"]
        if live:
            args += ["--vanaf", live]
        try:
            p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        except OSError as e:
            self.schrijf(f"controle overgeslagen: {e}")
            return None

        def pomp() -> None:
            assert p.stderr is not None
            for regel in p.stderr:
                self.schrijf(regel.rstrip())

        t = threading.Thread(target=pomp, daemon=True)
        t.start()
        assert p.stdout is not None
        uit = p.stdout.read()
        code = p.wait()
        t.join(timeout=5)
        if code == 2 or not uit.strip():
            self.schrijf("controle overgeslagen: " + (uit.strip()[-300:] or "geen uitslag (Bouwer niet geïnstalleerd of nog de oude versie)"))
            return None
        try:
            return json.loads(uit.strip().splitlines()[-1])
        except (ValueError, IndexError):
            self.schrijf("controle overgeslagen: uitslag niet te lezen")
            return None

    def opruimen(self, doel: str) -> None:
        """Achterblijvers naar quarantaine, met hetzelfde script als de handmatige uitrollen."""
        lijst = subprocess.run(
            ["git", "-C", SRC, "-c", "core.quotePath=false", "ls-tree", "-r", "-z", "--name-only", doel],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if lijst.returncode != 0:
            self.schrijf("!! achterblijvers niet gecontroleerd: git ls-tree mislukte")
            return
        r = subprocess.run(
            [sys.executable, os.path.join(ZF_DIR, "deploy", "scripts", "achterblijvers.py")],
            input=lijst.stdout,
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, "ZF_DIR": ZF_DIR},
        )
        for regel in (r.stdout + r.stderr).splitlines():
            self.schrijf(regel)

    def proefdraai(self, doel: str, wachtend: list[str]) -> str | None:
        """Alle wachtende migraties samen op de echte database in BEGIN … ROLLBACK.

        Mislukt er een, dan zou het echte migreren half blijven steken (Prisma noteert
        hem als mislukt en dan moet iemand het met de hand oplossen). Zo weten we het
        vooraf, zonder iets te veranderen. Geeft de fout terug, of None als het lukt.
        """
        delen = []
        for naam in wachtend:
            code, inhoud = run(["git", "-C", SRC, "show", f"{doel}:prisma/migrations/{naam}/migration.sql"])
            if code != 0:
                return f"Migratie {naam} is niet te lezen."
            # eigen transacties of CONCURRENTLY passen niet in één proef-transactie
            if re.search(r"\b(BEGIN|COMMIT|ROLLBACK|END)\s*;|\bCONCURRENTLY\b", inhoud, re.IGNORECASE):
                self.schrijf(f"proefdraaien overgeslagen: {naam} regelt zelf transacties")
                return None
            delen.append(f"-- {naam}\n{inhoud}")
        script = "BEGIN;\nSET LOCAL lock_timeout = '10s';\nSET LOCAL statement_timeout = '120s';\n" + "\n".join(delen) + "\nROLLBACK;\n"
        r = subprocess.run(
            ["docker", "exec", "-i", PG, "psql", "-U", "zekerflex", "-d", "zekerflex", "-v", "ON_ERROR_STOP=1", "-qtA"],
            input=script,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if r.returncode == 0:
            self.schrijf(f"proefdraaien gelukt ({len(wachtend)} migratie(s), teruggedraaid)")
            return None
        melding = " ".join(r.stderr.split())[:400]
        self.schrijf(f"!! proefdraaien mislukt: {melding}")
        return f"Foutmelding van de database: {melding}"

    def migratie_stand(self, doel: str) -> tuple[list[str], list[str]]:
        mappen = git("ls-tree", "-d", "--name-only", doel, "prisma/migrations/").splitlines()
        in_code = sorted(os.path.basename(m) for m in mappen if m.strip())
        rijen = sql(
            """SELECT migration_name || '|' || (finished_at IS NOT NULL)::text || '|' || (rolled_back_at IS NOT NULL)::text
               FROM _prisma_migrations;"""
        ).splitlines()
        toegepast, half = set(), []
        for r in rijen:
            naam, klaar, teruggedraaid = (r.split("|") + ["", "", ""])[:3]
            if klaar == "true" and teruggedraaid != "true":
                toegepast.add(naam)
            elif klaar != "true" and teruggedraaid != "true":
                half.append(naam)
        return [m for m in in_code if m not in toegepast], half

    def gezond(self, wacht: int = 180) -> bool:
        eind = time.time() + wacht
        while time.time() < eind:
            code, out = run(["docker", "inspect", "-f", "{{.State.Health.Status}}", APP], timeout=20)
            stand = out.strip() if code == 0 else "?"
            if stand == "healthy":
                self.schrijf("app is gezond")
                return True
            if stand == "unhealthy":
                return False
            time.sleep(5)
        return False

    def onderhoud(self, taak: str) -> None:
        """Vaste onderhoudstaken (Live zetten → Serveronderhoud); nooit een vrij commando."""
        if taak == "status":
            self.stap("Serverstand bekijken")
            for titel, args in (
                ("diensten", [*COMPOSE, "ps", "--format", "{{.Service}}: {{.Status}}"]),
                ("schijf", ["df", "-h", "/"]),
                ("geheugen", ["free", "-m"]),
                ("docker-opslag", ["sudo", "docker", "system", "df"]),
                ("belasting", ["uptime"]),
            ):
                code, out = run(args, cwd=ZF_DIR, timeout=60)
                self.schrijf(f"--- {titel}")
                for regel in out.splitlines()[:40]:
                    self.schrijf(regel)
            self.zet(staat="klaar", stap="Serverstand", bericht="De stand van de server staat in het log hieronder.")
            return
        if taak in ONDERHOUD_HERSTART:
            dienst = ONDERHOUD_HERSTART[taak]
            self.stap(f"{dienst} herstarten")
            code, _ = self.stroom([*COMPOSE, "restart", dienst], timeout=300)
            ok = code == 0 and (self.gezond() if dienst == "app" else True)
            self.zet(
                staat="klaar" if ok else "mislukt",
                stap=f"{dienst} herstart",
                bericht=f"{dienst} is herstart." if ok else f"Herstarten van {dienst} lukte niet of hij meldt zich niet gezond. Kijk in het log.",
            )
            return
        if taak in ("backup-nu", "backup-verifieer"):
            # de back-updienst doet het werk (deploy/backup/entrypoint.sh); de uitkomst
            # staat daarna in Admin → Systeem → Back-ups (status.json / verify.json)
            nu_backup = taak == "backup-nu"
            self.stap("Back-up maken" if nu_backup else "Hersteltest van de back-up")
            code, staart = self.stroom([*COMPOSE, "exec", "-T", "backup", "bash", "/backup.sh", "now" if nu_backup else "verify"], timeout=3600)
            gelukt = code == 0 and ("ok=true" in staart)
            self.zet(
                staat="klaar" if gelukt else "mislukt",
                stap="Back-up gemaakt" if nu_backup else "Hersteltest klaar",
                bericht=("De back-up is gemaakt en proef-teruggezet." if nu_backup else "De hersteltest is geslaagd: de back-up is compleet terug te zetten.")
                if gelukt
                else ("De back-up is niet in orde. Kijk in het log en in Admin → Systeem → Back-ups." if nu_backup else "De hersteltest vond een probleem. Kijk in het log en in Admin → Systeem → Back-ups."),
            )
            return
        if taak == "opruimen":
            self.stap("Schijfruimte vrijmaken")
            voor = vrije_ruimte()
            # dezelfde opruiming als na elke uitrol (vps-update.sh): geen draaiende images of volumes
            self.stroom(["sudo", "docker", "image", "prune", "-f"], timeout=600)
            self.stroom(["sudo", "docker", "builder", "prune", "-af", "--filter", "until=2h"], timeout=900)
            na = vrije_ruimte()
            self.zet(staat="klaar", stap="Opgeruimd", bericht=f"Vrije schijfruimte: eerst {voor}, nu {na}.")
            return
        self.zet(staat="mislukt", bericht=f"Onbekende onderhoudstaak: {taak[:40]}")

    def terugzetten(self, automatisch: bool) -> None:
        self.stap("Vorige versie terugzetten")
        code, out = run(["sudo", "docker", "tag", "zekerflex-app:rollback", "zekerflex-app:latest"])
        if code != 0:
            self.zet(staat="mislukt", bericht=f"Terugzetten lukte niet: {out[-200:]}")
            return
        code, staart = self.stroom([*COMPOSE, "up", "-d", "app"], timeout=600)
        ok = code == 0 and self.gezond()
        bericht = (
            "De nieuwe versie startte niet gezond, dus de vorige draait weer." if automatisch else "De vorige versie draait weer."
        ) + (" Database-wijzigingen blijven staan." if self.status.get("migraties") else "")
        if not ok:
            bericht = "Terugzetten is gestart, maar de app meldt zich nog niet gezond. Kijk in het log."
        self.zet(staat="teruggezet" if ok else "mislukt", stap="Vorige versie", bericht=bericht)


def vrije_ruimte() -> str:
    code, out = run(["df", "-h", "--output=avail", "/"], timeout=20)
    regels = out.splitlines()
    return regels[-1].strip() if code == 0 and len(regels) > 1 else "?"


def hartslag(bezig: bool = False) -> None:
    kv_zet(K_HARTSLAG, {"op": nu(), "host": socket.gethostname(), "versie": VERSIE, "bezig": bezig})


def main() -> None:
    os.chdir(ZF_DIR)
    meld(f"gestart (versie {VERSIE}) in {ZF_DIR}")
    laatste_slag = 0.0
    while True:
        try:
            if time.time() - laatste_slag > 30:
                hartslag()
                laatste_slag = time.time()
            verzoek = kv_pak(K_VERZOEK)
            if verzoek:
                meld(f"verzoek {verzoek.get('id')} ({verzoek.get('actie')}) van {verzoek.get('door')}")
                hartslag(bezig=True)
                Uitrol(verzoek).uitvoeren()
                hartslag()
                if verzoek.get("actie") == "uitrollen":
                    # Na een uitrol kan dit script zelf vernieuwd zijn: herstart met de nieuwe versie.
                    os.execv(sys.executable, [sys.executable, os.path.abspath(__file__)])
        except Exception as e:
            meld(f"fout: {e}")
            time.sleep(15)
        time.sleep(4)


if __name__ == "__main__":
    main()
