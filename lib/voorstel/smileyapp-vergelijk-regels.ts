import { BLOG, FUNCTIES, HERO, JOIN, KERNWOORDEN, PAKKETTEN, STAPPEN, VIDEO } from "@/lib/voorstel/smileyapp";

// ---------------------------------------------------------------------------
// "Smileyapp of een papieren enquête?" in het SmileyApp-voorstel (deel 6b): een
// eerlijke tabel. In de kolom Smileyapp staat per rij een zin die letterlijk in
// lib/voorstel/smileyapp.ts staat (de teksten van smileyapp.nl): de rij wijst
// naar die zin en `bron` zegt waar hij staat, zodat een test het kan bewaken
// (tests/voorstel-smileyapp-deel6b.test.ts). In de kolom papier staat alleen
// hoe een papieren formulier werkt: vanzelfsprekend, zonder cijfers en zonder
// iets over een merk of een concurrent. Het team kan in het beheer eigen rijen
// toevoegen en standaardrijen verbergen (lib/voorstel/smileyapp-vergelijken.ts).
// Puur bestand.
// ---------------------------------------------------------------------------

/** De zin uit hun blogbericht "3 Manieren om klantonderzoek te doen" (BLOG, laatste bericht), letterlijk. */
export const ANONIEM_ZIN = "Daarnaast is er ruimte voor (anonieme) feedback op gepersonaliseerde vragen.";

export interface StandaardRij {
  id: string;
  kenmerk: string;
  /** letterlijk een zin uit lib/voorstel/smileyapp.ts */
  smileyapp: string;
  /** hoe het met een papieren formulier gaat: vanzelfsprekend en zonder cijfers */
  papier: string;
  /** waar de zin van Smileyapp staat in lib/voorstel/smileyapp.ts */
  bron: string;
}

export const STANDAARD_RIJEN: readonly StandaardRij[] = [
  { id: "invullen", kenmerk: "Invullen", smileyapp: STAPPEN[0].tekst, papier: "Mensen vullen het formulier met een pen in.", bron: "STAPPEN[0].tekst (Meten)" },
  { id: "resultaten", kenmerk: "Resultaten bekijken", smileyapp: STAPPEN[1].tekst, papier: "Je telt de antwoorden met de hand.", bron: "STAPPEN[1].tekst (Weten)" },
  { id: "maken", kenmerk: "Vragenlijst maken", smileyapp: FUNCTIES.punten[0], papier: "Je moet formulieren printen en verzamelen.", bron: "FUNCTIES.punten[0]" },
  { id: "rapport", kenmerk: "Rapport", smileyapp: FUNCTIES.punten[3], papier: "Een rapport maak je zelf van de getelde antwoorden.", bron: "FUNCTIES.punten[3]" },
  { id: "huisstijl", kenmerk: "Huisstijl", smileyapp: FUNCTIES.punten[2], papier: "De opmaak van het formulier maak je zelf.", bron: "FUNCTIES.punten[2]" },
  { id: "vraagsoorten", kenmerk: "Soorten vragen", smileyapp: JOIN.tekst[2], papier: "Je bepaalt zelf welke vragen op het formulier staan.", bron: "JOIN.tekst[2]" },
  { id: "delen", kenmerk: "Uitkomsten laten zien", smileyapp: FUNCTIES.widget, papier: "De uitkomsten deel je zelf.", bron: "FUNCTIES.widget" },
  { id: "anoniem", kenmerk: "Anoniem", smileyapp: ANONIEM_ZIN, papier: "Een formulier zonder naam is ook anoniem.", bron: "BLOG: 3 Manieren om klantonderzoek te doen" },
];

/** Alle lopende tekst van lib/voorstel/smileyapp.ts waar een rij uit mag putten; de test zoekt elke Smileyapp-cel hierin terug. */
export function smileyappBronnen(): string[] {
  return [
    HERO.kop,
    HERO.vraag,
    ...HERO.intro,
    ...STAPPEN.map((s) => s.tekst),
    ...FUNCTIES.punten,
    FUNCTIES.widget,
    ...KERNWOORDEN.items.map((k) => k.tekst),
    ...JOIN.tekst,
    VIDEO.tekst,
    ...PAKKETTEN.flatMap((p) => [...p.onderdelen, ...(p.uitleg ?? [])]),
    ...BLOG.flatMap((b) => b.inhoud.flatMap((blok) => (blok.type === "lijst" ? blok.items : [blok.tekst]))),
  ];
}

// ---- wat het team in het beheer aanpast ----------------------------------------

export const EIGEN_RIJEN_MAX = 12;
export const RIJ_VELD_MIN = 2;
export const RIJ_VELD_MAX = 140;

export interface EigenRij {
  /** 16 hex-tekens, door de server gekozen */
  id: string;
  kenmerk: string;
  smileyapp: string;
  papier: string;
}

export interface VergelijkStaat {
  /** id's van standaardrijen die niet op de site staan */
  verborgen: string[];
  eigen: EigenRij[];
}

export interface Rij {
  id: string;
  kenmerk: string;
  smileyapp: string;
  papier: string;
  /** door het team toegevoegd: blijft op de vertaalde pagina's in de ingevoerde taal */
  eigen: boolean;
}

export interface BeheerRij extends Rij {
  verborgen: boolean;
}

const VELDEN = ["kenmerk", "smileyapp", "papier"] as const;
export type RijVeld = (typeof VELDEN)[number];
const VELD_NAAM: Record<RijVeld, string> = { kenmerk: "Het kenmerk", smileyapp: "De tekst bij Smileyapp", papier: "De tekst bij papier" };

const isStandaardId = (id: unknown): id is string => typeof id === "string" && STANDAARD_RIJEN.some((r) => r.id === id);
const isEigenId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{16}$/.test(id);
/** Een id dat een rij kan zijn: een standaardrij of de vorm van een eigen rij. */
export const isRijId = (id: unknown): id is string => isStandaardId(id) || isEigenId(id);

const eenRegel = (ruw: string) =>
  ruw
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export type RijUitkomst = { ok: true; waarde: Omit<EigenRij, "id"> } | { ok: false; veld: RijVeld; fout: string };

/** Een eigen rij van het team: drie velden platte tekst, elk verplicht en hooguit 140 tekens. */
export function leesRij(invoer: { kenmerk?: unknown; smileyapp?: unknown; papier?: unknown }): RijUitkomst {
  const uit = { kenmerk: "", smileyapp: "", papier: "" };
  for (const veld of VELDEN) {
    const ruw = invoer[veld];
    const tekst = typeof ruw === "string" ? eenRegel(ruw) : "";
    if (tekst.length < RIJ_VELD_MIN) return { ok: false, veld, fout: `${VELD_NAAM[veld]} ontbreekt (minstens ${RIJ_VELD_MIN} tekens).` };
    if (tekst.length > RIJ_VELD_MAX) return { ok: false, veld, fout: `${VELD_NAAM[veld]} is hooguit ${RIJ_VELD_MAX} tekens (nu ${tekst.length}).` };
    uit[veld] = tekst;
  }
  return { ok: true, waarde: uit };
}

const LEEG: VergelijkStaat = { verborgen: [], eigen: [] };

/** Leeg is "alles standaard": dan hoeft er niets in de opslag te staan. */
const ofNiets = (s: VergelijkStaat): VergelijkStaat | null => (s.verborgen.length === 0 && s.eigen.length === 0 ? null : s);

/** De opslag van het team, soepel gelezen: één onbruikbare rij valt weg, de rest blijft. Null: alles is de standaard. */
export function leesStaat(ruw: unknown): VergelijkStaat | null {
  if (typeof ruw !== "object" || ruw === null) return null;
  const r = ruw as { verborgen?: unknown; eigen?: unknown };
  const verborgen = [...new Set(Array.isArray(r.verborgen) ? r.verborgen.filter(isStandaardId) : [])];
  const eigen: EigenRij[] = [];
  for (const x of Array.isArray(r.eigen) ? r.eigen : []) {
    if (typeof x !== "object" || x === null) continue;
    const { id } = x as { id?: unknown };
    const rij = leesRij(x as Record<string, unknown>);
    if (isEigenId(id) && rij.ok && !eigen.some((e) => e.id === id) && eigen.length < EIGEN_RIJEN_MAX) eigen.push({ id, ...rij.waarde });
  }
  // nooit een lege tabel: zou alles verborgen zijn zonder eigen rij, dan gelden de standaardrijen weer
  if (eigen.length === 0 && verborgen.length >= STANDAARD_RIJEN.length) return null;
  return ofNiets({ verborgen, eigen });
}

/** Alle rijen voor het beheer: eerst de standaard (ook de verborgen), dan de eigen rijen. */
export function beheerRijen(staat: VergelijkStaat | null): BeheerRij[] {
  const s = staat ?? LEEG;
  return [
    ...STANDAARD_RIJEN.map((r) => ({ id: r.id, kenmerk: r.kenmerk, smileyapp: r.smileyapp, papier: r.papier, eigen: false, verborgen: s.verborgen.includes(r.id) })),
    ...s.eigen.map((r) => ({ ...r, eigen: true, verborgen: false })),
  ];
}

/** De rijen zoals de site ze toont. Zonder wijzigingen van het team precies de standaardrijen. */
export function zichtbareRijen(staat: VergelijkStaat | null): Rij[] {
  return beheerRijen(staat)
    .filter((r) => !r.verborgen)
    .map(({ verborgen: _verborgen, ...rij }) => rij);
}

export type Uitkomst = { ok: true; staat: VergelijkStaat | null } | { ok: false; fout: string; veld?: RijVeld };

/** Voegt een eigen rij toe (hooguit twaalf). `id` kiest de server. */
export function metEigenRij(staat: VergelijkStaat | null, invoer: { kenmerk?: unknown; smileyapp?: unknown; papier?: unknown }, id: string): Uitkomst {
  const s = staat ?? LEEG;
  if (s.eigen.length >= EIGEN_RIJEN_MAX) return { ok: false, fout: `Er staan al ${EIGEN_RIJEN_MAX} eigen rijen. Verwijder er eerst een.` };
  if (!isEigenId(id) || s.eigen.some((e) => e.id === id)) return { ok: false, fout: "Toevoegen lukte niet. Probeer het opnieuw." };
  const rij = leesRij(invoer);
  if (!rij.ok) return { ok: false, fout: rij.fout, veld: rij.veld };
  return { ok: true, staat: { verborgen: s.verborgen, eigen: [...s.eigen, { id, ...rij.waarde }] } };
}

const zichtbaar = (s: VergelijkStaat) => STANDAARD_RIJEN.length - s.verborgen.length + s.eigen.length;

/** Verwijdert een eigen rij. De laatste zichtbare rij blijft staan: de pagina heeft altijd een tabel. */
export function zonderEigenRij(staat: VergelijkStaat | null, id: string): Uitkomst {
  const s = staat ?? LEEG;
  if (!s.eigen.some((e) => e.id === id)) return { ok: false, fout: "Deze rij bestaat niet (meer)." };
  if (zichtbaar(s) <= 1) return { ok: false, fout: "Er moet minstens één rij op de site blijven staan. Toon eerst een standaardrij." };
  return { ok: true, staat: ofNiets({ verborgen: s.verborgen, eigen: s.eigen.filter((e) => e.id !== id) }) };
}

/** Verbergt een standaardrij of toont hem weer. Een eigen rij verberg je niet: die verwijder je. */
export function metVerborgenRij(staat: VergelijkStaat | null, id: string, verborgen: boolean): Uitkomst {
  const s = staat ?? LEEG;
  if (!isStandaardId(id)) return { ok: false, fout: "Alleen een standaardrij kun je verbergen. Een eigen rij verwijder je." };
  if (verborgen && !s.verborgen.includes(id) && zichtbaar(s) <= 1) return { ok: false, fout: "Er moet minstens één rij op de site blijven staan." };
  const lijst = verborgen ? [...new Set([...s.verborgen, id])] : s.verborgen.filter((x) => x !== id);
  return { ok: true, staat: ofNiets({ verborgen: lijst, eigen: s.eigen }) };
}
