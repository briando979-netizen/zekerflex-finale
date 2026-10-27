# Doorwerken als je Claude-limiet op is

Twee manieren om aan ZekerFlex te blijven werken wanneer Claude Code hier geblokkeerd is.

## A. Gratis & onbeperkt — lokale AI (aanbevolen als eerste redmiddel)

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
