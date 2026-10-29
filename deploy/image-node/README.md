# Eigen beeldgenerator (self-hosted Stable Diffusion) — geen credits, niemand nodig

Je eigen beeld-generator én -bewerker op je eigen machine, net als de AI-node en
de sovereign-stack. Geen Google "Nano Banana", geen OpenAI, geen credits: alles
draait lokaal. ZekerFlex praat ermee via de API van **AUTOMATIC1111 / Forge**
(`/sdapi/v1/txt2img` om te genereren, `/sdapi/v1/img2img` om te bewerken).

> **Belangrijk — soevereiniteitsgrendel.** De app weigert bewust een niet-lokale
> `IMAGE_BASE_URL` (zie `lib/ai/images.ts`): je beeld gaat nooit naar een
> cloud-server. De beeldserver moet dus bereikbaar zijn op **localhost of een
> privé-IP** (10.x / 192.168.x / 172.16-31.x) vanaf waar de app draait. Dat
> betekent: draai de app op dezelfde machine of hetzelfde LAN als deze server
> (de "Sovereign Box"-opzet). De publieke Vercel-deploy kan deze lokale server
> niet bereiken — beeldbewerking is dus voor je lokale/eigen-beheer-omgeving.

## Wat je nodig hebt

- Een machine met **Docker**. Een **NVIDIA-GPU** is sterk aanbevolen (een render
  duurt dan seconden); zonder GPU werkt het op CPU maar duurt een render minuten.
- ~10 GB schijf voor een fotorealistisch **SDXL-model** (bv. *RealVisXL*).

## Snelste, betrouwbaarste weg (aanbevolen)

Gebruik het goed onderhouden open-source project **AbdBarho/stable-diffusion-webui-docker**
(volledig zelf te hosten, geen account nodig):

```bash
git clone https://github.com/AbdBarho/stable-diffusion-webui-docker
cd stable-diffusion-webui-docker
docker compose --profile download up --build   # haalt eenmalig de basis binnen
docker compose --profile auto up -d             # start A1111 met --api op :7860
```

Zet daarna je eigen SDXL-model in `data/models/Stable-diffusion/` en herstart.

## Alternatief: de meegeleverde compose

`docker-compose.yml` in deze map draait een A1111-compatibele webui met de API
aan. Omdat image-tags verouderen, zet je zelf een bestaande image in `.env`
(`SD_IMAGE=`); de README van bovenstaand project noemt werkende images. Daarna:

```bash
cp .env.example .env     # zet SD_IMAGE + (optioneel) een model-naam
docker compose up -d
```

## Testen dat de API leeft

```bash
curl http://localhost:7860/sdapi/v1/sd-models   # moet een lijst modellen geven
```

## Koppelen aan ZekerFlex

Zet in de env van je app (lokaal `.env`, of je eigen-beheer-deploy):

```
IMAGE_ENABLED=true
IMAGE_BACKEND=a1111
IMAGE_BASE_URL=http://localhost:7860     # of http://<privé-IP>:7860 op je LAN
# optioneel:
IMAGE_MODEL=realvisxlV50_v50Bakedvae.safetensors
IMAGE_STEPS=28
```

Daarna in **Admin → Studio**:
- **Sjabloon / Eigen idee** → genereren (tekst → beeld).
- **Bewerk foto** → een bestaande foto bewerken met een instructie (img2img) —
  je eigen "Nano Banana", zonder credits.

## Eerlijk over de grenzen

- **GPU** maakt het verschil tussen seconden en minuten per beeld.
- De grendel houdt het lokaal; wil je het tóch over je LAN gebruiken, geef de
  server dan een privé-IP (geen publiek adres) en open poort 7860 alleen intern.
- Modellen zijn groot; de eerste download kost tijd en schijf. Daarna is alles
  van jou, offline bruikbaar, en kost het niets per beeld.
