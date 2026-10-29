# Soevereine mail + DNS — draai het zelf, afhankelijk van niemand

Je eigen **authoritative DNS** en je eigen **mailserver** (SMTP/IMAP/POP3) op je **eigen VPS**. Geen TransIP, geen Google Workspace, geen Cloudflare-DNS. De waarden komen uit **Admin → Hosting & domein** (knop **"Exporteer config"** geeft je de DNS-zone + mail-aliassen).

## Eerlijk: wat je nooit zelf kunt doen (niemand kan dat)

1. **Domeinregistrar** — je móét je domein ergens registreren (ICANN-regel). Je kunt wel elke registrar nemen en daar alleen je eigen nameservers instellen.
2. **Vertrouwde SSL-CA** — browsers vertrouwen alleen erkende CA's. **Let's Encrypt** is gratis en soeverein-vriendelijk (geen vendor lock-in); een self-signed certificaat wordt geweigerd.
3. **Server + internet** — compute en connectiviteit (VPS of eigen hardware + ISP).

Al het andere hieronder draai je volledig zelf.

## Wat je nodig hebt

- Een **VPS** met een **vast publiek IPv4** en Docker.
- Bij je **registrar**: de nameservers van je domein op **jouw** CoreDNS zetten (een "glue record" / child-nameserver naar het IP van deze VPS).
- Bij je **VPS-provider**: een **PTR / reverse-DNS**-record van je IP naar `mail.jouwdomein.nl` (cruciaal voor mail-aflevering).
- Open poorten: 53 (DNS), 25/465/587 (SMTP), 993 (IMAP), 995 (POP3), 80/443 (SSL-certificaat).

## Stap voor stap

```bash
# 1. Zet deze map op je VPS en ga erin
scp -r deploy/sovereign root@<vps-ip>:/opt/zf-sovereign && ssh root@<vps-ip>
cd /opt/zf-sovereign

# 2. DNS: plaats je zone-bestand (uit Admin → Hosting & domein → Exporteer config)
mkdir -p dns && cp <jouwdomein>-sovereign-config.txt dns/db.jouwdomein.nl
#   maak dns/Corefile (voorbeeld onderaan deze README)

# 3. Mail: env + hostname aanpassen
cp mailserver.env.example mailserver.env   # vul domein/instellingen in
#   zet 'hostname:' in docker-compose.yml op mail.jouwdomein.nl

# 4. Starten
docker compose up -d

# 5. Mailbox aanmaken + DKIM-sleutel genereren
docker exec -ti zf-mailserver setup email add info@jouwdomein.nl
docker exec -ti zf-mailserver setup config dkim
#   -> print de DKIM TXT-record: zet die in je DNS-zone (+ SPF + DMARC, zie onder)
```

## DNS-records die je in je zone zet (naast wat de export al geeft)

- **MX** `@ IN MX 10 mail.jouwdomein.nl.`
- **A** `mail IN A <vps-ip>`
- **SPF** (TXT `@`): `v=spf1 mx -all`
- **DKIM**: de TXT die `setup config dkim` print
- **DMARC** (TXT `_dmarc`): `v=DMARC1; p=quarantine; rua=mailto:postmaster@jouwdomein.nl`

## Eerlijk over mail-aflevering

Zelf-gehoste mail **werkt**, maar aflevering is het lastigste deel: zonder correcte **PTR, SPF, DKIM en DMARC** belandt je mail in spam of wordt hij geweigerd. Verse VPS-IP's hebben soms een slechte reputatie. Reken op wat finetunen; de bovenstaande records zijn 90% van het werk. Alternatief, nog steeds zonder lock-in: een **SMTP-relay** voor uitgaande mail.

## SSL voor je website (Let's Encrypt, soeverein-vriendelijk)

Zet een reverse proxy met automatische certificaten vóór je app, bv. **Caddy** (zoals in `deploy/ai-node/setup.sh`): die haalt en vernieuwt Let's Encrypt-certificaten zelf. Geen betaalde CA nodig.

## Voorbeeld `dns/Corefile`

```
jouwdomein.nl {
    file /etc/coredns/db.jouwdomein.nl
    log
    errors
}
```

## Koppeling met het paneel

**Admin → Hosting & domein** is de bron: je beheert daar mailserver/poorten/aliassen, nameservers, DNS-records, DNSSEC, transfer-lock, SSL, VPS + SSH. De **Provider-API-sectie** (endpoint + token) is het haakje om dit later óók automatisch te laten toepassen vanuit de app. De **Exporteer-knop** geeft je nu al een werkende zone + aliassen voor deze stack.
