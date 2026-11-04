// ---------------------------------------------------------------------------
// Achtergrondmuziek zonder rechten: de browser componeert een loopje (akkoorden,
// bas, drums, arpeggio) met Web Audio en levert een WAV. Geen bestanden van
// derden, dus vrij te gebruiken in reclame. Alleen in de browser.
// ---------------------------------------------------------------------------

export type Stemming = "vrolijk" | "rustig" | "zakelijk" | "stoer" | "luxe";

export const STEMMINGEN: { id: Stemming; label: string }[] = [
  { id: "vrolijk", label: "Vrolijk en fris" },
  { id: "zakelijk", label: "Zakelijk en modern" },
  { id: "rustig", label: "Rustig en warm" },
  { id: "stoer", label: "Stoer met beat" },
  { id: "luxe", label: "Luxe en zacht" },
];

interface Recept {
  bpm: number;
  akkoorden: number[][]; // MIDI-noten
  drums: "geen" | "licht" | "vol";
  arpeggio: boolean;
  padHelderheid: number; // Hz van het laagdoorlaatfilter
}

const RECEPTEN: Record<Stemming, Recept> = {
  vrolijk: { bpm: 112, akkoorden: [[60, 64, 67], [67, 71, 74], [69, 72, 76], [65, 69, 72]], drums: "vol", arpeggio: true, padHelderheid: 2200 },
  zakelijk: { bpm: 100, akkoorden: [[62, 65, 69], [58, 62, 65], [65, 69, 72], [60, 64, 67]], drums: "licht", arpeggio: true, padHelderheid: 1600 },
  rustig: { bpm: 78, akkoorden: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], drums: "geen", arpeggio: true, padHelderheid: 1100 },
  stoer: { bpm: 124, akkoorden: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 50, 54]], drums: "vol", arpeggio: false, padHelderheid: 2600 },
  luxe: { bpm: 88, akkoorden: [[65, 69, 72, 76], [64, 67, 71, 74], [62, 65, 69, 72], [60, 64, 67, 71]], drums: "licht", arpeggio: false, padHelderheid: 1300 },
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function ruis(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function omhulsel(g: GainNode, t: number, aan: number, piek: number, houd: number, uit: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(piek, t + aan);
  g.gain.setValueAtTime(piek, t + aan + houd);
  g.gain.exponentialRampToValueAtTime(0.0001, t + aan + houd + uit);
}

/** Componeer `seconden` muziek in een stemming. Geeft een WAV-bestand. */
export async function maakMuziek(stemming: Stemming, seconden: number): Promise<Blob> {
  const r = RECEPTEN[stemming];
  const rate = 44100;
  const duur = Math.max(4, Math.min(300, seconden));
  const ctx = new OfflineAudioContext(2, Math.ceil(duur * rate), rate);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.exponentialRampToValueAtTime(0.8, 1.2);
  master.gain.setValueAtTime(0.8, Math.max(1.3, duur - 2.5));
  master.gain.linearRampToValueAtTime(0.0001, duur);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  const tel = 60 / r.bpm;
  const maat = tel * 4;
  const ruisBuf = ruis(ctx);

  // Galm-achtige ruimte: een korte vertraging met terugkoppeling.
  const echo = ctx.createDelay(1);
  echo.delayTime.value = tel * 0.75;
  const terug = ctx.createGain();
  terug.gain.value = 0.28;
  const nat = ctx.createGain();
  nat.gain.value = 0.22;
  echo.connect(terug).connect(echo);
  echo.connect(nat).connect(master);

  for (let m = 0, t = 0; t < duur; m++, t += maat) {
    const akkoord = r.akkoorden[m % r.akkoorden.length] ?? [60, 64, 67];
    // Pad: zachte zaagtand door een filter, twee licht ontstemde stemmen.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = r.padHelderheid;
    const padGain = ctx.createGain();
    omhulsel(padGain, t, 0.5, 0.07, maat - 0.9, 0.6);
    filter.connect(padGain).connect(master);
    padGain.connect(echo);
    for (const noot of akkoord) {
      for (const ontstem of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(noot);
        o.detune.value = ontstem;
        o.connect(filter);
        o.start(t);
        o.stop(t + maat + 0.2);
      }
    }
    // Bas op tel 1 en 3.
    const grond = (akkoord[0] ?? 60) - 24;
    for (const b of [0, 2]) {
      const tb = t + b * tel;
      if (tb >= duur) continue;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz(grond);
      const g = ctx.createGain();
      omhulsel(g, tb, 0.01, 0.32, tel * 1.2, 0.3);
      o.connect(g).connect(master);
      o.start(tb);
      o.stop(tb + tel * 2);
    }
    // Arpeggio in achtsten, een octaaf hoger.
    if (r.arpeggio) {
      for (let s = 0; s < 8; s++) {
        const ta = t + s * (tel / 2);
        if (ta >= duur) continue;
        const noot = (akkoord[s % akkoord.length] ?? 60) + 12;
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = hz(noot);
        const g = ctx.createGain();
        omhulsel(g, ta, 0.005, 0.05, 0.02, tel * 0.45);
        o.connect(g).connect(master);
        g.connect(echo);
        o.start(ta);
        o.stop(ta + tel);
      }
    }
    // Drums.
    if (r.drums !== "geen") {
      for (let s = 0; s < 4; s++) {
        const tk = t + s * tel;
        if (tk >= duur) continue;
        if (r.drums === "vol" || s % 2 === 0) {
          const o = ctx.createOscillator();
          o.frequency.setValueAtTime(150, tk);
          o.frequency.exponentialRampToValueAtTime(42, tk + 0.12);
          const g = ctx.createGain();
          omhulsel(g, tk, 0.002, r.drums === "vol" ? 0.75 : 0.45, 0.02, 0.2);
          o.connect(g).connect(master);
          o.start(tk);
          o.stop(tk + 0.3);
        }
        // Hi-hat op de tussentel.
        const th = tk + tel / 2;
        if (th < duur) {
          const n = ctx.createBufferSource();
          n.buffer = ruisBuf;
          const hp = ctx.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.value = 7000;
          const g = ctx.createGain();
          omhulsel(g, th, 0.001, r.drums === "vol" ? 0.12 : 0.07, 0.01, 0.06);
          n.connect(hp).connect(g).connect(master);
          n.start(th, Math.random() * 0.5, 0.1);
        }
        // Klap op 2 en 4 (alleen vol).
        if (r.drums === "vol" && s % 2 === 1) {
          const n = ctx.createBufferSource();
          n.buffer = ruisBuf;
          const bp = ctx.createBiquadFilter();
          bp.type = "bandpass";
          bp.frequency.value = 1800;
          const g = ctx.createGain();
          omhulsel(g, tk, 0.002, 0.3, 0.01, 0.14);
          n.connect(bp).connect(g).connect(master);
          n.start(tk, Math.random() * 0.5, 0.2);
        }
      }
    }
  }
  return audioNaarWav(await ctx.startRendering());
}

/** AudioBuffer → 16-bit WAV. */
export function audioNaarWav(buf: AudioBuffer): Blob {
  const kanalen = buf.numberOfChannels;
  const lengte = buf.length * kanalen * 2;
  const uit = new DataView(new ArrayBuffer(44 + lengte));
  const schrijf = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) uit.setUint8(o + i, s.charCodeAt(i));
  };
  schrijf(0, "RIFF");
  uit.setUint32(4, 36 + lengte, true);
  schrijf(8, "WAVE");
  schrijf(12, "fmt ");
  uit.setUint32(16, 16, true);
  uit.setUint16(20, 1, true);
  uit.setUint16(22, kanalen, true);
  uit.setUint32(24, buf.sampleRate, true);
  uit.setUint32(28, buf.sampleRate * kanalen * 2, true);
  uit.setUint16(32, kanalen * 2, true);
  uit.setUint16(34, 16, true);
  schrijf(36, "data");
  uit.setUint32(40, lengte, true);
  const data = Array.from({ length: kanalen }, (_, k) => buf.getChannelData(k));
  let o = 44;
  for (let i = 0; i < buf.length; i++) {
    for (let k = 0; k < kanalen; k++) {
      const v = Math.max(-1, Math.min(1, data[k]?.[i] ?? 0));
      uit.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([uit.buffer], { type: "audio/wav" });
}
