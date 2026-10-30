# Zelf doorbouwen aan ZekerFlex (zonder Claude)

Manieren om aan ZekerFlex te blijven werken met een **echte code-agent** (die
bestanden bewerkt, test en commit — niet zoals Jarvis, dat alleen *praat* over
code). Eerlijk vooraf: een gratis agent is prima voor kleine/duidelijke taken
(teksten, FAQ's, simpele fixes, nieuwe componenten op bestaande patronen), maar
voor zware architectuur of lastig debuggen (het soort root-cause-werk zoals de
keep_alive/quota/thinking-model-bugs) is een frontier-model echt nodig.

## 0. Gratis auto-coder op je Gemini-sleutel (AANBEVOLEN)

Draait **Aider** (code-agent met echte git/bestands-tools) op je gratis Gemini-
sleutel — beter in code dan een klein lokaal model, en gratis binnen Google's
gratis laag.

Eenmalig je sleutel zetten (PowerShell):
```powershell
$env:GEMINI_API_KEY = "jouw-sleutel-van-aistudio.google.com/apikey"
```

**Interactief** (jij stuurt, Aider bouwt + commit):
```powershell
powershell -ExecutionPolicy Bypass -File deploy\local-coder\start-gemini-coder.ps1
```

**Autonoom** (één taak -> zelf bouwen, typechecken, committen, eventueel pushen):
```powershell
powershell -ExecutionPolicy Bypass -File deploy\local-coder\auto-build.ps1 -Task "voeg een FAQ-sectie toe aan de prijzen-pagina"
# met direct pushen naar GitHub:
powershell -ExecutionPolicy Bypass -File deploy\local-coder\auto-build.ps1 -Task "..." -Push
```
`auto-build.ps1` draait Aider niet-interactief, laat het de wijziging zelf
typechecken en committen, doet daarna nog een harde `tsc`-eindcontrole en pusht
alleen als die schoon is. Live op de VPS zetten: `sudo bash deploy/scripts/deploy-vps.sh`.

Let op: de gratis Gemini-laag heeft quota/limieten (zwaar gebruik = 429). Voor
intensief autonoom werk is een betaalde laag of een sterke eigen GPU de weg.

## A. Volledig gratis & offline — lokale AI (geen enkele limiet)

Je laptop draait al Ollama. Deze launcher zet **Aider** (AI pair-programmer in de terminal) op je eigen model — **€0, geen limiet, offline**:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\local-coder\start-local-coder.ps1
```

- De eerste keer installeert hij Aider automatisch (via pip).
- Typ gewoon wat je wil, bv. *"voeg een FAQ-sectie toe aan app/(marketing)/prijzen/page.tsx"*. Met `/add <pad>` geef je Aider de bestanden; hij bewerkt ze en **commit zelf in git**.
- Stoppen: `Ctrl+C`. Pushen doe je zelf met `git push` als je tevreden bent.

**Beter in code** (eenmalig ~4.7 GB downloaden):
```powershell
powershell -ExecutionPolicy Bypass -File deploy\local-coder\start-local-coder.ps1 -Model qwen2.5-coder:7b
```

**Eerlijk:** 7–8B lokaal is duidelijk minder slim dan Claude — prima voor kleine edits, teksten en simpele fixes, niet voor zware architectuur. Het houdt de vaart erin tot je limiet reset.

## B. Claude-kwaliteit zónder weeklimiet — API-sleutel (betaald per gebruik)

Claude Code kan óók op een **Anthropic API-sleutel** draaien i.p.v. je abonnement. Dan is er **geen weeklimiet** — je betaalt per token, met een eigen uitgavenlimiet. Dit is de weg als je op volle Claude-kwaliteit door wil.

1. Maak een API-sleutel op https://console.anthropic.com
2. Log Claude Code uit en opnieuw in via **Console-billing** (API), of zet de sleutel in je omgeving. Zie de actuele Claude Code-docs (`/login`, forceLoginMethod `console`).

## C. Vanzelf hervatten

In `.claude/settings.local.json` staat `autoContinueAtUsageLimit: true`: als de limiet de sessie stopt, **hervat de taak vanzelf** zodra je venster reset (meestal binnen enkele uren). Je hoeft dan niks te doen.

---

**Samengevat:** limiet op? → draai `start-local-coder.ps1` (gratis, lokaal) om door te werken, of schakel naar een API-sleutel voor Claude-kwaliteit. En de autonome loop pakt zichzelf weer op na de reset.
