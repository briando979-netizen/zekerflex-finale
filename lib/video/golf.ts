// ---------------------------------------------------------------------------
// Golfvormen en kleine beelden op de tijdlijn van de video-editor (13 nov 2026): zien waar het hard en zacht is, en
// wat er in een videoclip gebeurt, zonder af te spelen. Puur: de tijdlijn (browser) en de tests gebruiken dit.
// ---------------------------------------------------------------------------

/** Pieken per seconde bron: genoeg voor de grootste zoom van de tijdlijn. */
export const PIEKEN_PER_SECONDE = 60;

/** Hoogstens zoveel staafjes in één golfvorm (een heel lange clip op grote zoom blijft licht). */
const MAX_STAAFJES = 1500;

/** De hoogste uitslag per stukje van 1/perSeconde s (alle kanalen samen), 0..1 ten opzichte van de luidste plek. */
export function piekenUit(kanalen: readonly Float32Array[], sampleRate: number, perSeconde = PIEKEN_PER_SECONDE): Float32Array {
  const lengte = kanalen[0]?.length ?? 0;
  const stap = Math.max(1, Math.round(sampleRate / perSeconde));
  const n = Math.ceil(lengte / stap);
  const uit = new Float32Array(n);
  let hoogste = 0;
  for (let i = 0; i < n; i++) {
    const van = i * stap;
    const tot = Math.min(lengte, van + stap);
    let m = 0;
    for (const kanaal of kanalen) {
      for (let j = van; j < tot; j++) {
        const v = Math.abs(kanaal[j] ?? 0);
        if (v > m) m = v;
      }
    }
    uit[i] = m;
    if (m > hoogste) hoogste = m;
  }
  if (hoogste > 0) for (let i = 0; i < n; i++) uit[i] = (uit[i] ?? 0) / hoogste;
  return uit;
}

/**
 * Een SVG-pad voor het stuk bron [van, tot] (seconden) in `breedte` x `hoogte` pixels: staafjes om het midden, één per
 * 2 px (hooguit 1500). Stilte blijft een dun streepje, zodat je ziet dat de clip er is.
 */
export function golfPad(pieken: Float32Array, perSeconde: number, van: number, tot: number, breedte: number, hoogte: number): string {
  if (breedte < 2 || hoogte <= 0 || tot <= van || !pieken.length) return "";
  const staafjes = Math.min(MAX_STAAFJES, Math.max(1, Math.floor(breedte / 2)));
  const midden = hoogte / 2;
  const delen: string[] = [];
  for (let i = 0; i < staafjes; i++) {
    const a = van + ((tot - van) * i) / staafjes;
    const b = van + ((tot - van) * (i + 1)) / staafjes;
    const ia = Math.max(0, Math.floor(a * perSeconde));
    const ib = Math.min(pieken.length, Math.max(ia + 1, Math.ceil(b * perSeconde)));
    let m = 0;
    for (let j = ia; j < ib; j++) m = Math.max(m, pieken[j] ?? 0);
    const h = Math.max(0.5, m * midden * 0.95);
    const x = (i * breedte) / staafjes;
    delen.push(`M${x.toFixed(1)} ${(midden - h).toFixed(1)}V${(midden + h).toFixed(1)}`);
  }
  return delen.join("");
}

/** Op welke momenten (seconden bron) de tijdlijn een klein beeld uit een video haalt: één per 2 s, hooguit `max`. */
export function miniatuurMomenten(bronDuur: number, max = 12): number[] {
  if (!(bronDuur > 0)) return [];
  const n = Math.min(max, Math.max(1, Math.ceil(bronDuur / 2)));
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * bronDuur * 1000) / n) / 1000);
}

/** Voor elk vakje van de clip (het stuk bron [van, tot]) het dichtstbijzijnde kleine beeld (index in `momenten`). */
export function kiesMiniaturen(momenten: readonly number[], van: number, tot: number, vakken: number): number[] {
  if (!momenten.length || vakken < 1) return [];
  return Array.from({ length: Math.floor(vakken) }, (_, n) => {
    const t = van + ((tot - van) * (n + 0.5)) / vakken;
    let beste = 0;
    momenten.forEach((m, i) => {
      if (Math.abs(m - t) < Math.abs((momenten[beste] ?? m) - t)) beste = i;
    });
    return beste;
  });
}
