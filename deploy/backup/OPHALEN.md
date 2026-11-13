# Back-up naar de pc van de eigenaar

De nachtelijke back-up (`deploy/backup/entrypoint.sh`) staat op dezelfde schijf als de database. Gaat de server verloren, dan zijn de back-ups dat ook. Met dit voorstel haalt de pc van de eigenaar elke dag een **versleutelde** kopie op. Er is geen dienst van buiten nodig en het kost niets.

**Stand (13 nov 2026): voorbereid, niet aangezet.** Er is niets geïnstalleerd: geen sleutel, geen wachtwoordzin, geen taak. Eerst moet de eigenaar ja zeggen.

## Zo werkt het

1. **Versleutelen op de server.** Is `BACKUP_PASSPHRASE` gezet, dan zet de back-up naast elk bestand een `.enc`-kopie (AES-256-CBC, PBKDF2 met 210.000 rondes).
   - Een volledige set van één nacht is:
     - `db/zekerflex-<ts>.dump.enc`;
     - `storage/storage-<ts>.tar.gz.enc` (uploads);
     - `forgejo/forgejo-<ts>.tar.gz.enc` (de eigen Git-server).
   - De wekelijkse hersteltest ontcijfert de `.enc` van de dump en vergelijkt hem met het origineel.
2. **Eén beperkte sleutel.** De pc krijgt een eigen ssh-sleutel. Die mag op de server alleen het vaste commando `ophalen.sh` starten (`restrict,command=…`): geen shell, geen terminal, geen tunnels, geen scp of sftp. Het commando kent drie verzoeken:
   - `lijst`: de nieuwste volledige set, met grootte en sha256 per bestand. Een nacht die nog versleuteld wordt, of die `status.json` mislukt noemt, telt niet mee.
   - `haal <naam>`: één `.enc`-bestand. Alleen back-upnamen, nooit een pad, nooit de onversleutelde dump, geen symbolische koppeling.
   - `klaar <set>`: de pc heeft de set binnen en gecontroleerd. Dit schrijft `backups/ophaal/laatst.json`.
3. **Ophalen op de pc.** `deploy/scripts/backup-naar-pc.sh` (Git Bash) werkt zo:
   - hij haalt elk bestand eerst naar `C:\Users\pc\ZekerFlex-backups\.bezig-<set>`;
   - hij controleert de grootte en de sha256 van de server;
   - pas als alles klopt, hernoemt hij de map naar `<set>`;
   - de nieuwste **7** sets blijven bewaard;
   - elke keer komt er één regel in `C:\Users\pc\ZekerFlex-backups\ophalen.log`;
   - hij kijkt vooraf of er genoeg ruimte is.
4. **Hartslag.** Beheer → Systeem → Back-ups toont `Kopie op de pc: laatst <datum>`.
   - Komt er langer dan 3 dagen niets binnen, dan krijgt de eigenaar een waarschuwing (`backup:ophaal`).
   - Is er nog nooit opgehaald, dan geldt het als "niet ingesteld" en komt er geen alarm.
   - De eigenaar-taak "Versleutelde kopie van de back-ups buiten de server" vinkt zichzelf af zodra de pc versleuteld ophaalt.

## Aanzetten (pas na ja van de eigenaar)

Op de server, door 86:

```bash
# 1. wachtwoordzin (lang, willekeurig). Bewaar hem óók in de wachtwoordmanager van de eigenaar:
#    zonder deze zin is elke kopie waardeloos. Nooit in een bestand op de pc naast de back-ups.
sudo cp -p ~/zekerflex/.env.production ~/zekerflex/.env.production.bak-$(date +%Y%m%d)
#    … BACKUP_PASSPHRASE=… toevoegen (sudo), dan (net als vps-update.sh, mét het env-bestand):
cd ~/zekerflex && sudo docker compose -f docker-compose.vps.yml --env-file .env.production up -d --no-deps backup

# 2. het vaste commando BUITEN de repo: een latere git pull kan dan niet veranderen wat de sleutel mag
sudo install -m 755 -o root -g root ~/zekerflex/deploy/backup/ophalen.sh /usr/local/bin/zf-backup-ophalen

# 3. de map voor de markering (de back-upmap zelf is van root)
sudo install -d -m 755 -o briando -g briando ~/zekerflex/backups/ophaal
```

Op de pc (Git Bash):

```bash
# 4. een eigen sleutel, zonder wachtwoord: de taak draait zonder iemand erbij. Hij mag alleen versleutelde bestanden halen.
ssh-keygen -t ed25519 -N "" -C "zekerflex-pc-ophalen" -f ~/.ssh/zekerflex-ophalen

# 5. op de server zetten MET de beperking. Niet met ssh-copy-id: dat zet hem er zonder beperking bij.
printf 'restrict,command="/usr/local/bin/zf-backup-ophalen" %s\n' "$(cat ~/.ssh/zekerflex-ophalen.pub)" \
  | ssh -i ~/.ssh/transip briando@37.97.226.24 'cat >> ~/.ssh/authorized_keys'

# 6. proberen
ssh -i ~/.ssh/zekerflex-ophalen -o IdentitiesOnly=yes briando@37.97.226.24 lijst    # toont "set <ts>" en de bestanden
ssh -i ~/.ssh/zekerflex-ophalen -o IdentitiesOnly=yes briando@37.97.226.24 ls       # moet weigeren
bash "/c/Users/pc/Documents/zekerflex finale/deploy/scripts/backup-naar-pc.sh"; tail -n 3 /c/Users/pc/ZekerFlex-backups/ophalen.log
```

## De taak in Taakplanner (PowerShell, als de eigenaar zelf)

Elke dag om 08:00, ná de back-up van 03:30 Nederlandse tijd. Stond de pc uit, dan draait hij zodra het kan, ook op de accu. Er verschijnt dan kort een venster.

```powershell
$actie = New-ScheduledTaskAction -Execute "C:\Program Files\Git\bin\bash.exe" -Argument '--login "/c/Users/pc/Documents/zekerflex finale/deploy/scripts/backup-naar-pc.sh"'
$wanneer = New-ScheduledTaskTrigger -Daily -At 08:00
$instellingen = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "ZekerFlex back-up ophalen" -Action $actie -Trigger $wanneer -Settings $instellingen -Description "Haalt elke dag de versleutelde back-up van de server naar C:\Users\pc\ZekerFlex-backups (deploy/backup/OPHALEN.md)"
```

## Terugzetten vanaf de pc

```bash
cd /c/Users/pc/ZekerFlex-backups/<set>
openssl enc -d -aes-256-cbc -md sha256 -pbkdf2 -iter 210000 -in zekerflex-<set>.dump.enc -out zekerflex-<set>.dump   # vraagt de wachtwoordzin
# idem voor storage-…tar.gz.enc en forgejo-…tar.gz.enc; daarna verder volgens deploy/DISASTER-RECOVERY.md
```

## Goed om te weten

- **Ruimte op de server.** Met `BACKUP_PASSPHRASE` staan de `.enc`-kopieën naast de originelen en worden ze net zo lang bewaard (`BACKUP_KEEP`, 14). De back-upmap wordt dan ±2× zo groot. Omdat de pc er 7 bewaart, is het voorstel om voor `.enc` een kortere termijn te nemen (bijv. 3). Dat is een wijziging in `entrypoint.sh` en dus voor 86.
- **Ruimte op de pc.** Een set is nu ±340 MB, dus 7 sets ±2,4 GB, en dat groeit mee met de database. Het script stopt met een FOUT-regel als er te weinig ruimte is.
- **Intrekken.** Haal de regel met `zekerflex-pc-ophalen` uit `~/.ssh/authorized_keys` op de server. Gaat de pc verloren, dan heeft de vinder alleen versleutelde bestanden, en met de sleutel kan hij alleen versleutelde bestanden ophalen.
- **Wijzigt `ophalen.sh` in de repo?** Installeer hem dan opnieuw (stap 2). Tot dan draait de oude versie. Dat is bewust.
- **Tests.** `tests/backup-ophalen.test.ts` draait het vaste commando en het pc-script echt, met een nep-ssh:
  - het commando weigert paden, platte dumps, symbolische koppelingen, extra woorden en meerdere regels;
  - het pc-script gooit een beschadigd bestand weg en bewaart alleen de nieuwste sets.
