#!/usr/bin/env python3
"""ZekerFlex live-zetter — draait op de VPS, buiten Docker (systemd: zf-live.service).

Admin → ZekerFlex AI → "Live zetten" legt een verzoek in de database (KV-sleutel
bouwer:live:verzoek). Deze dienst pakt het op en doet wat anders een ssh-sessie
deed, zonder Claude:

  1. de nieuwste GitHub-main ophalen (eigen git-kopie, openbare repo)
  2. controleren: staat de live versie op main? zijn er database-wijzigingen?
     Database-wijzigingen alleen met akkoord op precies die migraties, en pas
     na een geslaagde proef op de echte database in BEGIN … ROLLBACK.
  3. code uitpakken over ~/zekerflex en deploy/scripts/vps-update.sh draaien
     (bouwen, eventueel migreren vóór de start, starten, Caddy herladen)
  4. wachten tot de nieuwe app gezond is; zo niet, zelf de vorige terugzetten

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
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

ZF_DIR = os.environ.get("ZF_DIR", os.path.expanduser("~/zekerflex"))
SRC = os.environ.get("ZF_SRC", os.path.expanduser("~/.zf-bron"))
REPO = os.environ.get("ZF_REPO", "https://github.com/briando979-netizen/zekerflex-finale.git")
PG = os.environ.get("ZF_PG_CONTAINER", "zekerflex-postgres-1")
APP = os.environ.get("ZF_APP_CONTAINER", "zekerflex-app-1")
LOGBESTAND = "/tmp/zf-live.log"
COMPOSE = ["sudo", "docker", "compose", "-f", "docker-compose.vps.yml", "--env-file", ".env.production"]
VERSIE = 1

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
        self.stap("Nieuwste versie ophalen van GitHub")
        if not os.path.isdir(os.path.join(SRC, ".git")):
            code, out = run(["git", "clone", "--depth", "300", "--branch", "main", REPO, SRC], timeout=900)
            if code != 0:
                raise RuntimeError(f"git clone mislukt: {out[-300:]}")
        git("fetch", "--depth", "300", "origin", "main")
        doel = git("rev-parse", "FETCH_HEAD")
        onderwerp = git("log", "-1", "--format=%s", doel)
        self.zet(doel=doel, doelOnderwerp=onderwerp)
        self.schrijf(f"doel: {doel[:10]} {onderwerp}")

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
