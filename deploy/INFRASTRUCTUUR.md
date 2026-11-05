# Eigen infrastructuur op de VPS: wat er draait, en waarom zó

ZekerFlex draait volledig op één eigen server (TransIP, 5 cores, 8 GB, Ubuntu) met
Docker Compose en Caddy (`docker-compose.vps.yml`). Dit document legt de keuzes vast
voor de "zelf gehoste" bouwstenen die normaal als dure clouddienst worden afgenomen:
beveiliging (WAF), uitrollen (PaaS), code en controles (git/CI) en netwerk (mesh).
Alles is open source en kost geen abonnement; de prijs is beheer op de eigen server.

| Module | Oplossing hier | Status (5 nov 2026) |
|---|---|---|
| Aanvalsbescherming (WAF, DDoS-lite) | **CrowdSec** engine in de container `crowdsec` + firewall-bouncer op de host | Live; `deploy/crowdsec/README.md` |
| Uitrollen in eigen beheer (private PaaS) | De **live-zetter** (Admin → ZekerFlex AI → Live zetten, `deploy/bouwer/zf-live.py`) + `vps-update.sh`; de **Bouwer** als AI-programmeur | Live sinds 3 nov; Coolify bewust niet |
| Eigen code en controles (git + CI) | **Controle vóór uitrol** in de Bouwer-container (`deploy/bouwer/werker/controle.mjs`), poort in de live-zetter, uitslagen in Admin | Live; Forgejo bewust niet |
| Privé-netwerk tussen locaties (mesh) | **Headscale** met ingebouwde DERP (container `headscale`, `vpn.zekerflex.com`) als onderdeel van ZekerFlex Verbinding | Live; `deploy/netwerk/README.md` |

## 1. Aanvalsbescherming: CrowdSec

Wat het doet staat in `deploy/crowdsec/README.md`. Kort: Caddy schrijft een toegangslog
zonder cookies, sleutels of querystring; de engine leest dat log en het ssh-log, herkent
scanners, brute force en bekende aanvallers (ook via de blokkadelijst van de community) en
de firewall-bouncer op de host gooit die adressen weg op alle poorten (nftables, vóór ufw
en Docker). De app leest mee: Admin → Beveiliging (blokkades, meldingen, opheffen),
Admin → Systeem (component) en `/beveiliging` (openbare uitleg met live cijfers).

Waarom niet een "echte" WAF (ModSecurity/Coraza in Caddy)? Die inspecteert elke request
op patronen en vraagt per regel afstelling; voor een Next.js-app met eigen validatie,
CSP en inlogbescherming levert dat vooral valse meldingen op. CrowdSec kijkt naar gedrag
over tijd en deelt dreigingen met het netwerk; dat vangt wat er in de praktijk op een
server als deze binnenkomt. Een WAF-laag kan later altijd nog als Caddy-module.

## 2. Uitrollen: de live-zetter, geen Coolify

Coolify (of Portainer, Dokku) zou een tweede proxy op poort 80/443 willen en een eigen
beheer van containers, naast een pijplijn die al werkt en bewaakt is: GitHub main → de
live-zetter haalt de code, controleert migraties (proefdraaien in BEGIN … ROLLBACK, akkoord
per migratie), controleert de code (hieronder), bouwt het image, start, wacht op de
gezondheidscontrole en zet bij een storing zelf de vorige versie terug. Met één knop in
Admin, met log, geschiedenis en pushmeldingen. Dat ís de private PaaS; Coolify erbij zou
twee waarheden over "wat draait er" opleveren. Daarom bewust niet geïnstalleerd.

## 3. Code en controles: de Bouwer controleert, geen Forgejo

Forgejo/Gitea met een CI-runner vraagt een derde kopie van de codebase plus een runner
die `npm ci`, tsc (≥ 2 GB) en tests draait. Dat past niet naast app, Bouwer en
Android-bouwer in 8 GB, en het zou een tweede git-waarheid naast GitHub worden. De
Bouwer-container heeft al een werkkopie met node_modules en draait al tsc/eslint/tests
voor zijn eigen opdrachten. Daar is de controle vóór het live zetten bij gekomen:

- `deploy/bouwer/werker/controle.mjs`: een losse kopie in `/werk/controle/repo`; per
  vastlegging TypeScript op het hele project, eslint op de gewijzigde bestanden (sinds de
  live versie) en `vitest related` op diezelfde bestanden, op de demodatabase van het
  voorbeeld. Uitslag in `/werk/controle/uitslagen/<sha>.json` (60 bewaard). Eén zware stap
  tegelijk in de container (`zwaar.lock`), en buiten een uitrol om wacht hij op het slot.
- De **live-zetter** draait hem vóór het bouwen (`docker exec … controle.mjs --sha <doel>
  --vanaf <live> --geen-wacht`). Faalt hij, dan gaat de versie niet live; de knop
  "Zonder controle live zetten" in Admin zet hem toch live (met waarschuwing). Is de
  Bouwer er niet, dan gaat de uitrol gewoon door (de bouw controleert TypeScript toch).
- De **planner** vraagt elke 10 minuten een controle van de nieuwste main
  (`/api/internal/controles/tick`), zodat de uitslag er al ligt als iemand op Live zetten
  drukt. Admin → ZekerFlex AI → Live zetten toont de uitslag van main en de laatste
  uitslagen; Admin → Systeem heeft de component "Controle vóór uitrol".

De code zelf staat behalve op GitHub ook op de server: in `~/.zf-bron` (live-zetter), in
de werkkopie van de Bouwer en in de controle-kopie. Een volledige spiegel als back-up
buiten GitHub is er nog niet (bewuste restpunt; GitHub is de bron).

## 4. Mesh-netwerk: Headscale (ZekerFlex Verbinding)

Netbird vraagt een eigen identiteitsserver (Zitadel/Keycloak) naast management, signal,
relay en dashboard. Headscale doet hetzelfde (WireGuard-mesh, Tailscale-clients op elke
telefoon en laptop) met één container en een ingebouwde DERP-relay (STUN 3490/udp; 3478
is van coturn). Hij is gebouwd als onderdeel van het klantproduct ZekerFlex Verbinding
(wifi via RADIUS, VPN, 5G op aanvraag) en dient ook de eigen servers. Zie
`deploy/netwerk/README.md` en `lib/netwerk`.

## Waar je het ziet

- Admin → Beveiliging: aanvalsbescherming (blokkades, meldingen, opheffen).
- Admin → Systeem → Componenten: "Aanvalsbescherming (CrowdSec)" en "Controle vóór uitrol".
- Admin → ZekerFlex AI → Live zetten: controle van main, uitslagen, "Zonder controle".
- `/beveiliging`: de openbare uitleg met live cijfers; link in de voettekst en in het privacybeleid.
