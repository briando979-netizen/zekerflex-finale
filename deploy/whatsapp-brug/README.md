# WhatsApp-brug voor spoedoproepen

Een klein containertje met een **eigen WhatsApp-nummer**, zodat een spoedoproep
(Werkgever → Dienst → Spoedoproep) ook per WhatsApp bij krachten aankomt en
hun antwoord ("1" = ik neem aan, "2" = nee, STOP = geen berichten meer) terug
in de app komt. Gebruikt Baileys (het open WhatsApp Web-protocol); er is geen
Meta-account of betaalde API voor nodig.

Zonder deze brug werkt de spoedoproep gewoon: melding in de app, en sms als
Twilio is ingericht (`TWILIO_SMS_FROM`).

## Eerlijk over de risico's

- WhatsApp staat dit officieel niet toe. Bij veel berichten naar onbekende
  nummers kan WhatsApp het nummer **blokkeren**. Gebruik daarom een **apart
  prepaid nummer**, nooit het eigen zakelijke nummer.
- Krachten krijgen alleen een bericht als ze een telefoonnummer in hun profiel
  hebben en de schakelaar "Spoedoproepen per sms of WhatsApp" aan staat
  (Account). Met STOP zetten ze hem zelf uit.
- Baileys is gemeenschapssoftware; na een WhatsApp-update kan het even stuk
  zijn tot er een nieuwe versie is (`package.json`).

## Aanzetten (eenmalig, op de VPS)

```bash
cd /opt/zekerflex            # de map met docker-compose.vps.yml
bash deploy/whatsapp-brug/installeer.sh
```

Het script zet `WHATSAPP_BRUG_TOKEN` en `WHATSAPP_BRUG_URL` in
`.env.production`, bouwt en start de container, herstart de app en laat het
log zien. Scan de QR-code uit dat log met WhatsApp op de telefoon met het
aparte nummer: Instellingen → Gekoppelde apparaten → Apparaat koppelen.

Daarna meldt Admin → Te doen "WhatsApp ingericht" en staat WhatsApp aan in
het spoedoproep-paneel.

## Controleren

```bash
docker compose -f docker-compose.vps.yml -f docker-compose.whatsapp.yml --env-file .env.production logs --tail 50 whatsapp-brug
docker compose -f docker-compose.vps.yml exec app wget -qO- --header "Authorization: Bearer $WHATSAPP_BRUG_TOKEN" http://whatsapp-brug:3900/gezond
```

`/gezond` geeft `{ ok, verbonden, nummer, wachtOpQr }`; `/qr` geeft de
huidige QR-code als tekst (alleen zolang er nog niet is gekoppeld).

## Opnieuw koppelen

Heeft WhatsApp het apparaat uitgelogd (staat in het log), verwijder dan de
sessie en koppel opnieuw:

```bash
docker compose -f docker-compose.vps.yml -f docker-compose.whatsapp.yml --env-file .env.production down whatsapp-brug
docker volume rm zekerflex_whatsapp-auth
bash deploy/whatsapp-brug/installeer.sh
```

## Hoe het aan de app hangt

- Versturen: de app doet `POST http://whatsapp-brug:3900/stuur` met
  `{ naar, tekst }` (`lib/spoed/kanalen.ts`).
- Inkomend: de brug doet `POST /api/whatsapp/inkomend` op de app met
  `{ van, tekst }` en stuurt het antwoord dat terugkomt (`lib/spoed/oproep.ts`).
- Beide kanten controleren dezelfde sleutel (`WHATSAPP_BRUG_TOKEN`); de brug
  is alleen op het interne Docker-netwerk bereikbaar.
