// ---------------------------------------------------------------------------
// Kleine, pure hulpjes voor audio: ruwe PCM (zoals Gemini-TTS die teruggeeft)
// in een WAV-kop zetten, en de duur van een WAV aflezen. Geen afhankelijkheden,
// dus bruikbaar op de server en in tests.
// ---------------------------------------------------------------------------

/** 16-bit mono PCM → WAV-bestand. */
export function pcmNaarWav(pcm: Buffer, rate = 24000, kanalen = 1, bits = 16): Buffer {
  const kop = Buffer.alloc(44);
  const blok = (kanalen * bits) / 8;
  kop.write("RIFF", 0, "ascii");
  kop.writeUInt32LE(36 + pcm.length, 4);
  kop.write("WAVE", 8, "ascii");
  kop.write("fmt ", 12, "ascii");
  kop.writeUInt32LE(16, 16);
  kop.writeUInt16LE(1, 20); // PCM
  kop.writeUInt16LE(kanalen, 22);
  kop.writeUInt32LE(rate, 24);
  kop.writeUInt32LE(rate * blok, 28);
  kop.writeUInt16LE(blok, 32);
  kop.writeUInt16LE(bits, 34);
  kop.write("data", 36, "ascii");
  kop.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([kop, pcm]);
}

/** Duur in seconden van een WAV (null als het geen leesbare WAV is). */
export function wavDuur(wav: Buffer): number | null {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") return null;
  let pos = 12;
  let byteRate = 0;
  while (pos + 8 <= wav.length) {
    const id = wav.toString("ascii", pos, pos + 4);
    const grootte = wav.readUInt32LE(pos + 4);
    if (id === "fmt ") byteRate = wav.readUInt32LE(pos + 16);
    if (id === "data") return byteRate > 0 ? Math.min(grootte, wav.length - pos - 8) / byteRate : null;
    pos += 8 + grootte + (grootte % 2);
  }
  return null;
}
