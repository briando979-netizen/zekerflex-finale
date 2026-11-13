import { FORMATEN, MIN_DUUR, einde, nieuweTekstClip, rond, type Project } from "@/lib/video/model";

// ---------------------------------------------------------------------------
// Ondertitels uit spraak (13 nov 2026, eigenaar: "de beste video-editor"): onze eigen Whisper geeft elk woord met zijn
// tijd in het bronbestand (app/api/admin/video/ondertitel). Hier wordt dat korte regels op de tijdlijn, precies waar de
// clip het bronstuk laat horen (inpunt, snelheid), en licht elk woord op als het klinkt (karaoke met woordTijden).
// Puur: de editor (browser) en de tests gebruiken dit.
// ---------------------------------------------------------------------------

/** Eén gesproken woord met zijn tijd in het bronbestand (seconden), zoals lib/asr/transcribe.ts het teruggeeft. */
export interface GesprokenWoord {
  woord: string;
  start: number;
  eind: number;
}

/** Eén ondertitelregel op de tijdlijn; woordTijden in seconden na het begin van de regel (leeg = onbekend). */
export interface SpraakRegel {
  tekst: string;
  start: number;
  duur: number;
  woordTijden: number[];
}

/** Het stuk bron dat een clip laat horen. */
export interface ClipBereik {
  start: number;
  duur: number;
  inpunt: number;
  snelheid: number;
}

/** Zo kort staat een regel minstens in beeld (als de volgende er niet eerder is). */
const MIN_REGEL = 0.6;
/** Zo lang blijft een regel nog staan na het laatste woord. */
const NASTAAN = 0.25;

/** Het bestand-id uit het adres van een clip ("/api/admin/video/bestand/<id>"), anders null. */
export function bestandIdUitBron(bron: string): string | null {
  const m = /^\/api\/admin\/video\/bestand\/(v[a-z0-9]{10,30})(?:[?#].*)?$/.exec(bron);
  return m?.[1] ?? null;
}

/**
 * Van woorden in de bron naar ondertitelregels op de tijdlijn. Alleen wat de clip laat horen telt; een nieuwe regel na
 * `maxWoorden` woorden, boven `maxTekens` tekens, na een stilte langer dan `maxPauze` seconden of na een punt,
 * vraagteken of uitroepteken. Een regel loopt nooit over de volgende of over het einde van de clip heen.
 */
export function spraakRegels(
  woorden: readonly GesprokenWoord[],
  clip: ClipBereik,
  opties: { maxWoorden?: number; maxTekens?: number; maxPauze?: number } = {},
): SpraakRegel[] {
  const maxWoorden = Math.max(1, opties.maxWoorden ?? 6);
  const maxTekens = opties.maxTekens ?? 34;
  const maxPauze = opties.maxPauze ?? 0.7;
  const snelheid = clip.snelheid > 0 ? clip.snelheid : 1;
  const eindClip = clip.start + clip.duur;
  const opLijn = woorden
    .map((w) => ({
      woord: w.woord.replace(/\s+/g, " ").trim(),
      start: clip.start + (w.start - clip.inpunt) / snelheid,
      eind: clip.start + (w.eind - clip.inpunt) / snelheid,
    }))
    .filter((w) => w.woord && w.eind > clip.start && w.start < eindClip)
    .map((w) => ({ ...w, start: Math.max(clip.start, w.start), eind: Math.min(eindClip, Math.max(w.start, w.eind)) }));

  const groepen: (typeof opLijn)[] = [];
  let huidig: typeof opLijn = [];
  for (const w of opLijn) {
    const vorige = huidig[huidig.length - 1];
    const tekens = huidig.reduce((n, x) => n + x.woord.length + 1, 0) + w.woord.length;
    if (vorige && (huidig.length >= maxWoorden || tekens > maxTekens || w.start - vorige.eind > maxPauze || /[.!?\u2026]$/.test(vorige.woord))) {
      groepen.push(huidig);
      huidig = [];
    }
    huidig.push(w);
  }
  if (huidig.length) groepen.push(huidig);

  const regels: SpraakRegel[] = [];
  groepen.forEach((g, i) => {
    const eerste = g[0];
    const laatste = g[g.length - 1];
    if (!eerste || !laatste) return;
    const volgende = groepen[i + 1]?.[0];
    const grens = Math.min(volgende ? volgende.start : eindClip, eindClip);
    const eind = Math.min(grens, Math.max(laatste.eind + NASTAAN, eerste.start + MIN_REGEL));
    regels.push({
      tekst: g.map((w) => w.woord).join(" "),
      start: rond(eerste.start),
      duur: rond(Math.max(MIN_DUUR, eind - eerste.start)),
      woordTijden: g.map((w) => rond(Math.max(0, w.start - eerste.start))),
    });
  });
  return regels;
}

/** Het spoor voor ondertitels: "Ondertiteling" als dat er is, anders het eerste tekstspoor, anders null. */
export function ondertitelSpoor(p: Pick<Project, "sporen">): string | null {
  return p.sporen.find((s) => s.id === "s-onder" && s.soort === "tekst")?.id ?? p.sporen.find((s) => s.soort === "tekst")?.id ?? null;
}

/**
 * Zet de ondertitels van één clip op het ondertitelspoor. Wat daar binnen het bereik van de clip al stond, gaat eruit
 * (opnieuw maken vervangt, stapelt niet); andere sporen en tekst buiten dat bereik blijven staan. Zelfde stijl als de
 * ondertitels van de AI-video (lib/video/auto-bouw.ts).
 */
export function metSpraakOndertitels(p: Project, spoor: string, clip: { start: number; duur: number }, regels: readonly SpraakRegel[]): Project {
  const staand = FORMATEN[p.formaat].h > FORMATEN[p.formaat].w;
  const van = clip.start;
  const tot = einde(clip);
  const blijft = p.clips.filter((c) => !(c.spoor === spoor && c.soort === "tekst" && c.start < tot && einde(c) > van));
  const nieuw = regels.map((r) =>
    nieuweTekstClip({
      spoor,
      start: r.start,
      duur: r.duur,
      tekst: r.tekst,
      grootte: staand ? 56 : 38,
      y: staand ? 0.76 : 0.84,
      stijl: "kader",
      achtergrond: "",
      animatieIn: "geen",
      animatieUit: "geen",
      karaoke: true,
      ...(r.woordTijden.length ? { woordTijden: r.woordTijden } : {}),
    }),
  );
  return { ...p, clips: [...blijft, ...nieuw] };
}
