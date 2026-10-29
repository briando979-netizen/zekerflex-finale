# Eigen sandbox — onvertrouwde code veilig draaien, zonder cloud-dienst

Draai code (bv. door AI gegenereerd, of een snippet van een onbekende) in een
**wegwerp-container met harde grenzen**, op je eigen machine. Geen Vercel
Sandbox, geen externe dienst — alleen Docker dat je zelf beheert.

## Wat het dichttimmert

`run-sandbox.sh` draait je commando met:

- `--network none` — **geen netwerk** (geen data naar buiten, geen downloads).
- `--read-only` + de huidige map **read-only** op `/work`; schrijven kan alleen
  in een tmpfs `/tmp` (256 MB), die na afloop verdwijnt.
- `--memory` / `--cpus` / `--pids-limit` — begrensd geheugen, CPU en processen.
- `--cap-drop ALL` + `--security-opt no-new-privileges` + non-root `--user`.
- `timeout` — de code wordt na X seconden hard gestopt (default 30).
- `--rm` — de container is weg zodra hij klaar is.
- **gVisor** (`runsc`) wordt automatisch gebruikt als het geïnstalleerd is, voor
  kernel-isolatie bovenop containers.

## Gebruik

```bash
chmod +x run-sandbox.sh

# een scriptbestand uit de huidige map draaien
./run-sandbox.sh python3 script.py

# code via stdin
echo 'print(1+1)' | ./run-sandbox.sh python3 -

# node, met eigen basis-image en 10s limiet
docker build -t zf-sandbox .
SANDBOX_IMAGE=zf-sandbox SANDBOX_TIMEOUT=10 ./run-sandbox.sh node app.js
```

Knoppen (env): `SANDBOX_IMAGE`, `SANDBOX_NETWORK` (default `none`), `SANDBOX_MEM`
(bv. `512m`), `SANDBOX_CPUS`, `SANDBOX_TIMEOUT` (seconden).

## Netwerk nodig?

Standaard staat het netwerk UIT. Moet de code iets ophalen, zet dan bewust
`SANDBOX_NETWORK=bridge` — maar besef dat de code dan naar buiten kan praten.

## Eerlijk over de grenzen

- Dit is **container-isolatie**, geen volledige VM. Voor echt vijandige code is
  gVisor (`runsc`) of een microVM (Firecracker) sterker — installeer gVisor en de
  runner pakt het automatisch op.
- `timeout` vereist coreutils in het image (Debian-images zoals `python:3.12-slim`
  of de meegeleverde `zf-sandbox` hebben dat; kale Alpine niet).
- Draai dit op je eigen box/VPS, niet in de serverless app (daar is geen Docker).
