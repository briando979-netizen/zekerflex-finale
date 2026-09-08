# ZekerFlex Video Studio

Een agent-gedreven videoproductiestudio in Python. Je instrueert het in gewoon
Nederlands; het onderzoekt het onderwerp, schrijft een script + storyboard,
genereert beeld, spreekt een voice-over in, componeert muziek, plakt
woord-voor-woord ondertitels erop en monteert alles met FFmpeg tot één `.mp4`.

```bash
python -m studio "maak een 60 seconden durende, Pixar-achtige animatiefilm over een eenzame banaan die een vriend vindt"
python -m studio "cinematische productadvertentie voor een neurale interface" --aspect 9:16
python -m studio "video over quantum computing" --reference https://youtu.be/VIDEO_ID
python -m studio --resume eenzame-banaan --stage script --force
python -m studio --caps
```

Output komt in `studio/projects/<slug>/out/final.mp4` (+ `poster.jpg`).
De volledige projecttoestand staat in `projects/<slug>/manifest.json` — elke run
slaat afgeronde fases over, dus je kunt losse stappen opnieuw draaien.

## Werkt out-of-the-box (100% lokaal, geen sleutels)

| Fase | Lokale backend |
|---|---|
| brief / research / script | **Ollama** (`llama3.1:8b`) |
| voice-over + woordtiming | **edge-tts** (Microsoft-stemmen, gratis, echte `WordBoundary`) |
| beeld | **procedureel** — motion-graphics per shot (PIL + numpy): cinematic / animation / kinetic / product / docu |
| muziek | **synth** — procedureel gecomponeerde bed op sfeer + tempo (numpy) |
| ondertitels | ASS-karaoke uit de VO-timing, ingebrand met libass |
| montage | **FFmpeg** (gebundeld via `imageio-ffmpeg`) — crossfades, VO + geduckte muziek, titel/eindkaart |
| referentie-analyse | lokale videobestanden |

## Schakelt automatisch op bij API-sleutels

Zet de sleutel in je omgeving; de studio detecteert het (`--caps` toont wat live is).

| Env var | Wat het inschakelt |
|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `LLM_BASE_URL` | betere modellen voor brief/script (`STUDIO_LLM_MODEL` om te kiezen) |
| `ELEVENLABS_API_KEY` (+ `ELEVENLABS_VOICE_ID`) | studiokwaliteit voice-over |
| `OPENAI_API_KEY` / `STABILITY_API_KEY` | AI-stills + Ken Burns i.p.v. motion-graphics |
| `REPLICATE_API_TOKEN` (+ `STUDIO_VIDEO_MODEL`) | echte AI-videoclips per shot |
| `FREESOUND_API_KEY` / `PIXABAY_API_KEY` | rechtenvrije muziek ophalen (met bronvermelding in `MUSIC_CREDIT.txt`) |
| `yt-dlp` op PATH of `pip install yt-dlp` | YouTube-URL's als `--reference` |

## Referentievideo ("dit tempo, ander onderwerp")

`--reference <url-of-bestand>` analyseert **alleen abstracte parameters** —
gemiddelde shotlengte, cut-frequentie, bewegingsenergie, kleurpalet,
loudness-curve, tempo (bpm). Nooit beeld of audio uit de bron. Die
`StyleProfile` stuurt vervolgens het aantal shots, het snijritme en het palet
van de nieuwe, originele video.

## Als agent aansturen

```python
from studio.agent import start, plan, set_brief, write_script, edit_shot, produce, status

p = start("30s uitlegvideo over composteren", aspect="9:16")
plan(p)                                   # brief bekijken
set_brief(p, mood="playful", cta="Begin vandaag met composteren")
write_script(p)                           # storyboard
edit_shot(p, 2, narration="Groente- en fruitresten gaan op de hoop.",
                visual="close-up of vegetable scraps falling onto a compost pile, golden hour")
produce(p)                                # voice + muziek + beeld + montage
status(p)
```

Of alles ineens: `from studio.agent import make; make("...", aspect="16:9", duration=45)`.

## Afhankelijkheden

```bash
pip install pillow numpy imageio imageio-ffmpeg edge-tts
# optioneel: pip install yt-dlp
# Ollama draaiend met een model:  ollama pull llama3.1:8b
```

Render-hoogte staat op 720p (`STUDIO_RENDER_HEIGHT`); de montage schaalt naar de
brief-resolutie (1080p). Op CPU-only Ollama duren de tekstfases enkele minuten —
zet `STUDIO_LLM_MODEL=llama3.2:3b` voor snellere tests of gebruik een API.
