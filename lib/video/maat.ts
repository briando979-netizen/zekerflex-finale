import { clipsOpSpoor, einde, maxDuur, rond, type AudioClip, type BeeldClip, type Clip, type Project } from "@/lib/video/model";

// ---------------------------------------------------------------------------
// Op de maat (13 nov 2026, zoals "beat sync" in CapCut): de maatslagen in muziek zoeken op de golfvorm (pieken per
// 1/60 s, lib/video/golf.ts), ze op de tijdlijn zetten (clips klikken eraan vast) en het hoofdspoor zo knippen dat elke
// clip op een maatslag wisselt. Puur: de editor (browser) en de tests gebruiken dit.
// ---------------------------------------------------------------------------

/** Een clip op de maat is minstens zo lang (anders flitst hij voorbij). */
const MIN_MAAT = 0.3;

/**
 * De maatslagen (seconden in de bron): plekken waar het geluid plots harder wordt dan net daarvoor, duidelijk boven
 * wat in de seconde eromheen gewoon is, en hooguit één per `minAfstand` seconden.
 */
export function maatslagen(pieken: Float32Array, perSeconde: number, opties: { minAfstand?: number; venster?: number; gevoeligheid?: number } = {}): number[] {
  const minAfstand = opties.minAfstand ?? 0.28;
  const venster = Math.max(1, Math.round((opties.venster ?? 1) * perSeconde));
  const gevoeligheid = opties.gevoeligheid ?? 1.4;
  const terug = Math.max(1, Math.round(0.1 * perSeconde));
  // hoeveel harder dan het gemiddelde van de 0,1 s ervoor
  const toename = new Float32Array(pieken.length);
  for (let i = 0; i < pieken.length; i++) {
    let som = 0;
    let n = 0;
    for (let j = Math.max(0, i - terug); j < i; j++) {
      som += pieken[j] ?? 0;
      n++;
    }
    toename[i] = Math.max(0, (pieken[i] ?? 0) - (n ? som / n : 0));
  }
  const uit: number[] = [];
  let vorige = -Infinity;
  for (let i = 1; i < toename.length - 1; i++) {
    const v = toename[i] ?? 0;
    if (v < 0.05 || v <= (toename[i - 1] ?? 0) || v < (toename[i + 1] ?? 0)) continue;
    const a = Math.max(0, i - venster);
    const b = Math.min(toename.length, i + venster + 1);
    let s = 0;
    let s2 = 0;
    for (let j = a; j < b; j++) {
      const f = toename[j] ?? 0;
      s += f;
      s2 += f * f;
    }
    const gem = s / (b - a);
    const spreiding = Math.sqrt(Math.max(0, s2 / (b - a) - gem * gem));
    if (v < gem + gevoeligheid * spreiding) continue;
    const t = i / perSeconde;
    if (t - vorige < minAfstand) continue;
    uit.push(Math.round(t * 1000) / 1000);
    vorige = t;
  }
  return uit;
}

/** Het tempo (slagen per minuut) uit de gewone afstand tussen maatslagen (de mediaan), of null bij te weinig slagen. */
export function tempoVan(slagen: readonly number[]): number | null {
  const afstanden = slagen
    .slice(1)
    .map((s, i) => s - (slagen[i] ?? s))
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const midden = afstanden[Math.floor(afstanden.length / 2)];
  return midden ? Math.round(60 / midden) : null;
}

/** De maatslagen van een muziekclip op de tijdlijn (alleen wat de clip laat horen). */
export function slagenOpLijn(c: Pick<AudioClip, "start" | "duur" | "inpunt" | "snelheid" | "slagen">): number[] {
  const s = c.snelheid > 0 ? c.snelheid : 1;
  const tot = einde(c);
  return (c.slagen ?? []).map((x) => rond(c.start + (x - c.inpunt) / s)).filter((t) => t >= c.start - 1e-6 && t <= tot + 1e-6);
}

/**
 * Het spoor `spoor` op de maat: de beeldclips sluiten op elkaar aan vanaf de eerste, en elke clip wisselt op een
 * maatslag (om de `elke` slagen). Een video die te kort is voor zijn slag, eindigt op de laatste slag die nog past (of
 * op zijn eigen einde). Clips na de laatste slag houden hun lengte. `aantal` = hoeveel clips nu op een slag wisselen.
 */
export function opDeMaat(p: Project, spoor: string, slagen: readonly number[], elke = 1): { project: Project; aantal: number } {
  const lijn = clipsOpSpoor(p, spoor).filter((c): c is BeeldClip => c.soort === "video" || c.soort === "foto" || c.soort === "kleur");
  const eerste = lijn[0];
  if (!eerste || slagen.length < 2) return { project: p, aantal: 0 };
  const stap = Math.max(1, Math.round(elke));
  const punten = [...slagen].sort((a, b) => a - b).filter((s) => s >= eerste.start - 1e-6).filter((_, i) => i % stap === 0);
  let cursor = eerste.start;
  let aantal = 0;
  const nieuw = new Map<string, Clip>();
  for (const c of lijn) {
    const max = maxDuur(c);
    const kandidaten = punten.filter((s) => s >= cursor + MIN_MAAT - 1e-6);
    const doel = kandidaten[0];
    let duur = c.duur;
    if (doel !== undefined) {
      if (doel - cursor <= max + 1e-6) {
        duur = doel - cursor;
        aantal++;
      } else {
        // te kort voor deze slag: de laatste slag die nog past, anders gewoon tot het einde van de video
        const past = kandidaten.filter((s) => s - cursor <= max + 1e-6).pop();
        duur = past !== undefined ? past - cursor : max;
        if (past !== undefined) aantal++;
      }
    }
    nieuw.set(c.id, { ...c, start: rond(cursor), duur: rond(duur) });
    cursor += duur;
  }
  return { project: { ...p, clips: p.clips.map((c) => nieuw.get(c.id) ?? c) }, aantal };
}
