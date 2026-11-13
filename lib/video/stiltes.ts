import { MIN_DUUR, einde, nieuwId, rond, type AudioClip, type BeeldClip, type Clip, type Project } from "@/lib/video/model";
import type { GesprokenWoord } from "@/lib/video/spraak-ondertitels";

// ---------------------------------------------------------------------------
// Stiltes weghalen (13 nov 2026, de "jump cut" van CapCut): de woorden met hun tijd uit onze eigen Whisper (zie
// spraak-ondertitels.ts) laten zien waar er gesproken wordt. Een stilte langer dan `minStilte` gaat eruit: de clip
// wordt stukken die direct op elkaar aansluiten, en alles erna schuift naar voren, op alle sporen. Wat binnen de clip
// begint (ondertitels, een overlay) schuift mee met het moment waar het bij hoort. Puur: de editor en de tests.
// ---------------------------------------------------------------------------

/** Een stuk van het bronbestand (seconden). */
export interface BronStuk {
  van: number;
  tot: number;
}

/**
 * Waar in de bron gesproken wordt, met `marge` seconden ruimte om elk woord (anders klinkt een knip afgekapt). Twee
 * woorden met minder dan `minStilte` stilte ertussen (na de marge) horen bij hetzelfde stuk. Alleen binnen `bron`.
 */
export function spraakStukken(woorden: readonly GesprokenWoord[], bron: BronStuk, opties: { minStilte?: number; marge?: number } = {}): BronStuk[] {
  const minStilte = opties.minStilte ?? 0.6;
  const marge = opties.marge ?? 0.12;
  const stukken: BronStuk[] = [];
  for (const w of [...woorden].sort((a, b) => a.start - b.start)) {
    if (w.eind <= bron.van || w.start >= bron.tot) continue;
    const van = Math.max(bron.van, w.start - marge);
    const tot = Math.min(bron.tot, Math.max(w.start, w.eind) + marge);
    const vorige = stukken[stukken.length - 1];
    if (vorige && van - vorige.tot < minStilte) vorige.tot = Math.max(vorige.tot, tot);
    else stukken.push({ van, tot });
  }
  return stukken.filter((s) => s.tot - s.van >= MIN_DUUR).map((s) => ({ van: rond(s.van), tot: rond(s.tot) }));
}

/**
 * Knip de stiltes uit één video- of geluidsclip: alleen `stukken` blijft over, direct achter elkaar vanaf het begin
 * van de clip. `weg` = hoeveel seconden het geheel korter wordt; `stiltes` = hoeveel stiltes eruit gingen (ook aan
 * het begin of het einde). Niets te doen (geen stukken, geen winst): het project blijft zoals het is.
 */
export function knipStiltesWeg(p: Project, clipId: string, stukken: readonly BronStuk[]): { project: Project; weg: number; stiltes: number } {
  const niets = { project: p, weg: 0, stiltes: 0 };
  const c = p.clips.find((x) => x.id === clipId);
  if (!c || (c.soort !== "video" && c.soort !== "audio") || !stukken.length) return niets;
  const s = c.snelheid > 0 ? c.snelheid : 1;
  const bronVan = c.inpunt;
  const bronTot = c.inpunt + c.duur * s;
  const binnen = stukken
    .map((st) => ({ van: Math.max(bronVan, st.van), tot: Math.min(bronTot, st.tot) }))
    .filter((st) => st.tot - st.van >= MIN_DUUR * s)
    .sort((a, b) => a.van - b.van);
  if (!binnen.length) return niets;

  /** Waar een tijdstip binnen de oude clip nu komt; in een weggehaalde stilte: het begin van het volgende stuk. */
  const naar = (t: number): number => {
    const b = bronVan + (t - c.start) * s;
    let op = c.start;
    for (const st of binnen) {
      if (b < st.van) return op;
      if (b <= st.tot) return op + (b - st.van) / s;
      op += (st.tot - st.van) / s;
    }
    return op;
  };

  let cursor = c.start;
  const delen: (BeeldClip | AudioClip)[] = binnen.map((st, i) => {
    const duur = rond((st.tot - st.van) / s);
    const deel = { ...c, id: i === 0 ? c.id : nieuwId(), start: rond(cursor), duur, inpunt: rond(st.van) } as BeeldClip | AudioClip;
    cursor += duur;
    // in- en uitvagen en de overgang horen bij de echte randen, niet bij een knip
    if (i > 0) {
      deel.vervagenIn = 0;
      if (deel.soort === "video") deel.overgang = "geen";
    }
    if (i < binnen.length - 1) deel.vervagenUit = 0;
    // sleutelbeelden schuiven mee met het moment waar ze bij horen, net als ondertitels
    if (deel.soort === "video" && deel.sleutelbeelden) {
      const begin = deel.start;
      deel.sleutelbeelden = deel.sleutelbeelden.map((k) => ({ ...k, t: rond(naar(c.start + k.t) - begin) }));
    }
    return deel;
  });
  const oudEinde = einde(c);
  const weg = rond(oudEinde - cursor);
  if (weg < MIN_DUUR / 2) return niets;

  const clips: Clip[] = [];
  for (const x of p.clips) {
    if (x.id === c.id) continue;
    if (x.start >= oudEinde - 1e-6) {
      clips.push({ ...x, start: rond(Math.max(0, x.start - weg)) });
    } else if (x.start >= c.start - 1e-6) {
      const start = naar(x.start);
      if (x.soort === "tekst" && einde(x) <= oudEinde + 1e-6) {
        // tekst binnen de clip (ondertitels): begin, einde en woordtijden schuiven mee met de spraak
        const duur = Math.max(MIN_DUUR, naar(einde(x)) - start);
        const tijden = x.woordTijden?.map((wt) => rond(Math.max(0, naar(x.start + wt) - start)));
        clips.push({ ...x, start: rond(start), duur: rond(duur), ...(tijden ? { woordTijden: tijden } : {}) });
      } else {
        clips.push({ ...x, start: rond(start) });
      }
    } else {
      clips.push(x);
    }
  }
  const eerste = binnen[0];
  const laatste = binnen[binnen.length - 1];
  const stiltes = binnen.length - 1 + (eerste && eerste.van > bronVan + 0.05 ? 1 : 0) + (laatste && laatste.tot < bronTot - 0.05 ? 1 : 0);
  return { project: { ...p, clips: [...clips, ...delen] }, weg, stiltes };
}
