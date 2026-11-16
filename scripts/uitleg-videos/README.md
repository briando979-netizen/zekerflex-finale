# De uitlegvideo's op /uitleg

Echte schermopnames van ZekerFlex met Nederlandse uitleg in onze eigen stem (Piper, `nl-vrouw`), ±1 MB per video (H.264, 720p).
Gemaakt op 16 nov 2026; de bestanden staan in `public/videos/` (in git, anders komen ze niet in de uitrol).

- `maak.cjs <slug>`: de scenes per video (pagina, zinnen, wat er op het scherm gebeurt). `lib.cjs`: stem, opname en samenvoegen.
- Nodig: Node met `playwright-core` en Microsoft Edge, ffmpeg (`FFMPEG_DIR`), en ssh naar de VPS voor de stem
  (`UITLEG_SSH_SLEUTEL`, `UITLEG_SSH_HOST`; Piper luistert alleen op 127.0.0.1:5000).
- De opname loopt via de screencast van de browser (geen extra download). De stem wordt per zin ingesproken; de acties op het
  scherm wachten op het begin van elke zin.
- `uren-goedkeuren` toont het beheer van een tijdelijk `.test`-bedrijf (één vestiging, geen diensten of krachten, dus geen
  meldingen) en een incheckterminal (`UITLEG_TERMINAL`, `UITLEG_SESSIE`). Zo'n bedrijf maak je aan en ruim je direct weer op; de
  schermlink en de sticker-link komen nergens in beeld.
- Geen persoonsgegevens: alleen openbare pagina's en verzonnen voorbeeldgegevens.
