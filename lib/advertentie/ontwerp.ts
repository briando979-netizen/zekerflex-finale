import { createElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { CREME, NACHT, knop, leesbaarOpDonker, leesbaarOpLicht, meng, tekstOp } from "@/lib/rijschool/kleuren";
import { FORMATEN, WATERMERK_TEKST, type FormaatId, type OntwerpNr } from "@/lib/advertentie/regels";

// ---------------------------------------------------------------------------
// De drie ontwerpen van een advertentie op maat, als boom voor satori (next/og).
// Alleen vormen, kleurvlakken en typografie: geen foto's (licenties) en geen
// tekens buiten de lettertypes (lib/advertentie/regels.ts maakt de tekst schoon).
// Puur: de beeldroute, de voorbeelden op de landingspagina en het proefscript
// gebruiken precies deze code. Geen JSX, zodat het een gewoon .ts-bestand is.
//
// Alle maten staan in beeldpunten van het volle formaat (1080 × 1080 enz.);
// `schaal` verkleint ze voor het voorbeeld (600 × 600).
// ---------------------------------------------------------------------------

export interface OntwerpGegevens {
  bedrijf: string;
  kop: string;
  onderregel: string;
  knop: string;
  plaats?: string | undefined;
  contact?: string | undefined;
  /** de gekozen kleur als #RRGGBB */
  kleur: string;
}

/** De namen waaronder lib/advertentie/beeld.ts de lettertypes aanmeldt. */
export const LETTER = { kop: "Bricolage", tekst: "Instrument Sans", serif: "Instrument Serif", smal: "Anton" } as const;

export type Stijl = CSSProperties;
export type Maat = (n: number) => number;

/** Een vak; satori wil bij elk vak met meer dan één kind een expliciete flex. */
export const vak = (stijl: Stijl, ...kinderen: ReactNode[]): ReactElement => createElement("div", { style: { display: "flex", ...stijl } }, ...kinderen);

/**
 * De lettergrootte bij een tekst: korter = groter. `treden` is [hooguit zoveel tekens, grootte], oplopend. Het langste
 * woord moet op één regel passen, anders wordt de letter kleiner (een lange bedrijfsnaam breekt dan niet midden in het woord).
 */
export function lettergrootte(tekst: string, breedte: number, treden: readonly (readonly [number, number])[], factor = 0.56): number {
  const basis = (treden.find(([max]) => tekst.length <= max) ?? treden[treden.length - 1])?.[1] ?? 48;
  const langste = Math.max(1, ...tekst.split(/\s+/).map((w) => w.length));
  return Math.max(20, Math.min(basis, Math.floor(breedte / (langste * factor))));
}

const perFormaat = <T,>(f: FormaatId, v: { vierkant: T; verhaal: T; liggend: T }): T => v[f];

/**
 * Het watermerk: schuine, herhaalde tekst over het hele beeld, dicht op elkaar. Elke rij staat er twee keer, wit en donker,
 * een paar beeldpunten verschoven: zo is hij op wit, op donker en op kleur overal zichtbaar, en haal je hem niet weg door
 * één tint weg te filteren. `letter` is de lettergrootte in beeldpunten van het volle formaat.
 */
export function watermerk(W: number, H: number, p: Maat, letter = 34): ReactElement {
  const zijde = Math.max(W, H) * 1.7;
  const stap = letter * 1.7;
  const regel = Array.from({ length: Math.ceil(zijde / (letter * 17)) + 2 }, () => WATERMERK_TEKST).join("    ");
  const rijen = Math.ceil(zijde / stap);
  const tekst = (kleur: string, schuif: number): ReactElement =>
    vak({ position: "absolute", left: p(schuif), top: p(schuif), whiteSpace: "nowrap", fontFamily: LETTER.tekst, fontWeight: 600, fontSize: p(letter), letterSpacing: p(letter * 0.05), lineHeight: 1, color: kleur }, regel);
  return vak(
    { position: "absolute", left: 0, top: 0, width: p(W), height: p(H), overflow: "hidden" },
    vak(
      { position: "absolute", left: p((W - zijde) / 2), top: p((H - zijde) / 2), width: p(zijde), height: p(zijde), flexDirection: "column", justifyContent: "center", transform: "rotate(-24deg)" },
      ...Array.from({ length: rijen }, (_, i) =>
        vak({ position: "relative", flexShrink: 0, height: p(stap), marginLeft: p(i % 2 ? -letter * 5 : 0) }, tekst("rgba(10,18,14,0.42)", letter * 0.07), tekst("rgba(255,255,255,0.62)", 0)),
      ),
    ),
  );
}
// --- 1. Strak: donker en rustig ---------------------------------------------

function strak(g: OntwerpGegevens, f: FormaatId, p: Maat): ReactElement {
  const { breedte: W, hoogte: H } = FORMATEN[f];
  const nacht = meng(g.kleur, NACHT, 0.3);
  const vlak = meng(g.kleur, NACHT, 0.78);
  const accent = leesbaarOpDonker(meng(g.kleur, "#FFFFFF", 0.42), nacht);
  const rand = perFormaat(f, { vierkant: 84, verhaal: 92, liggend: 60 });
  const kopBreedte = f === "liggend" ? W * 0.66 : W - rand * 2;
  const kopMaat = lettergrootte(
    g.kop,
    kopBreedte,
    perFormaat(f, {
      vierkant: [[8, 184], [14, 132], [26, 110], [44, 90], [999, 76]],
      verhaal: [[8, 210], [14, 156], [26, 132], [44, 110], [999, 94]],
      liggend: [[8, 120], [14, 88], [26, 74], [44, 62], [999, 52]],
    } as const),
  );
  const klein = perFormaat(f, { vierkant: 1, verhaal: 1.14, liggend: 0.74 });
  const cirkel = perFormaat(f, { vierkant: 880, verhaal: 1180, liggend: 640 });
  const korteplaats = g.plaats && g.plaats.length <= 18 ? g.plaats : undefined;
  const onder = [g.contact, korteplaats ? undefined : g.plaats].filter(Boolean) as string[];
  // past de contactregel niet meer naast de knop, dan komt hij eronder
  const rest = W - rand * 2 - 28 - (g.knop.length * 36 * 0.56 + 92) * klein;
  const stapel = onder.some((regel) => regel.length * 24 * 0.54 * klein > rest);

  return vak(
    { position: "relative", width: p(W), height: p(H), background: nacht, color: "#FFFFFF", fontFamily: LETTER.tekst, overflow: "hidden" },
    // vormen: een groot kleurvlak rechtsboven en een dunne ring eromheen
    vak({ position: "absolute", right: p(-cirkel * 0.36), top: p(-cirkel * 0.44), width: p(cirkel), height: p(cirkel), borderRadius: p(cirkel), background: vlak }),
    vak({ position: "absolute", right: p(-cirkel * 0.5), top: p(-cirkel * 0.58), width: p(cirkel * 1.3), height: p(cirkel * 1.3), borderRadius: p(cirkel * 1.3), border: `${Math.max(1, p(3))}px solid ${accent}`, opacity: 0.28 }),
    vak({ position: "absolute", left: p(-180), bottom: p(-180), width: p(420), height: p(420), borderRadius: p(420), background: vlak, opacity: 0.5 }),
    vak(
      { position: "relative", flexDirection: "column", justifyContent: "space-between", width: p(W), height: p(H), padding: p(rand) },
      // bovenaan: de naam van het bedrijf, rechts de plaats
      vak(
        { alignItems: "center", justifyContent: "space-between", gap: p(24) },
        vak(
          { alignItems: "center", gap: p(20 * klein), flexShrink: 1 },
          vak(
            { width: p(64 * klein), height: p(64 * klein), borderRadius: p(18 * klein), background: accent, color: tekstOp(accent), alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: LETTER.kop, fontWeight: 800, fontSize: p(38 * klein) },
            g.bedrijf.slice(0, 1).toUpperCase(),
          ),
          vak({ fontWeight: 600, fontSize: p(lettergrootte(g.bedrijf, W * 0.5, [[22, 38], [36, 32], [999, 27]]) * klein), lineHeight: 1.15, maxWidth: p(W * (korteplaats ? 0.5 : 0.76)) }, g.bedrijf),
        ),
        korteplaats
          ? vak({ flexShrink: 0, padding: `${p(12 * klein)}px ${p(26 * klein)}px`, borderRadius: p(999), border: `${Math.max(1, p(2))}px solid rgba(255,255,255,0.34)`, fontSize: p(28 * klein), color: "rgba(255,255,255,0.88)" }, korteplaats)
          : null,
      ),
      // het midden: de kop en de onderregel
      vak(
        { flexDirection: "column", maxWidth: p(kopBreedte) },
        vak({ width: p(104 * klein), height: p(10 * klein), borderRadius: p(10), background: accent, marginBottom: p(34 * klein) }),
        vak({ fontFamily: LETTER.kop, fontWeight: 800, fontSize: p(kopMaat), lineHeight: 1.03, letterSpacing: p(-kopMaat * 0.014), wordBreak: "break-word" }, g.kop),
        vak({ marginTop: p(30 * klein), fontSize: p(lettergrootte(g.onderregel, kopBreedte, [[60, 40], [100, 36], [999, 32]], 0.5) * klein), lineHeight: 1.36, color: "rgba(255,255,255,0.78)", wordBreak: "break-word" }, g.onderregel),
      ),
      // onderaan: de knop en de contactregel
      vak(
        stapel ? { flexDirection: "column", alignItems: "flex-start", gap: p(22 * klein) } : { alignItems: "center", justifyContent: "space-between", gap: p(28) },
        vak({ flexShrink: 0, padding: `${p(24 * klein)}px ${p(46 * klein)}px`, borderRadius: p(999), background: accent, color: tekstOp(accent), fontWeight: 600, fontSize: p(36 * klein) }, g.knop),
        onder.length
          ? vak(
              { flexDirection: "column", alignItems: stapel ? "flex-start" : "flex-end", flexShrink: 1, maxWidth: p(stapel ? W - rand * 2 : rest) },
              ...onder.map((regel, i) => vak({ fontSize: p((i === 0 ? lettergrootte(regel, stapel ? W - rand * 2 : rest, [[24, 32], [40, 27], [999, 24]], 0.54) : 26) * klein), fontWeight: i === 0 ? 600 : 400, color: i === 0 ? "#FFFFFF" : "rgba(255,255,255,0.72)", lineHeight: 1.3, textAlign: stapel ? "left" : "right", wordBreak: "break-word" }, regel)),
            )
          : null,
      ),
    ),
  );
}

// --- 2. Licht: licht en speels ----------------------------------------------

function licht(g: OntwerpGegevens, f: FormaatId, p: Maat): ReactElement {
  const { breedte: W, hoogte: H } = FORMATEN[f];
  const inkt = "#17211C";
  const tint = meng(g.kleur, CREME, 0.2);
  const kleurTekst = leesbaarOpLicht(g.kleur, "#FFFFFF");
  const k = knop(g.kleur);
  const marge = perFormaat(f, { vierkant: 60, verhaal: 64, liggend: 40 });
  const binnen = perFormaat(f, { vierkant: 68, verhaal: 76, liggend: 48 });
  const kaartB = W - marge * 2;
  const kaartH = H - marge * 2;
  const kopBreedte = (f === "liggend" ? kaartB * 0.7 : kaartB) - binnen * 2;
  const kopMaat = lettergrootte(
    g.kop,
    kopBreedte,
    perFormaat(f, {
      vierkant: [[8, 210], [14, 142], [26, 120], [44, 98], [999, 82]],
      verhaal: [[8, 240], [14, 168], [26, 142], [44, 118], [999, 100]],
      liggend: [[8, 132], [14, 92], [26, 78], [44, 66], [999, 55]],
    } as const),
    0.46,
  );
  const klein = perFormaat(f, { vierkant: 1, verhaal: 1.14, liggend: 0.74 });
  const bol = perFormaat(f, { vierkant: 760, verhaal: 900, liggend: 560 });
  const onder = [g.contact, g.plaats && g.plaats.length > 18 ? g.plaats : undefined].filter(Boolean) as string[];
  const korteplaats = g.plaats && g.plaats.length <= 18 ? g.plaats : undefined;

  return vak(
    { position: "relative", width: p(W), height: p(H), background: CREME, color: inkt, fontFamily: LETTER.tekst, overflow: "hidden" },
    // vormen achter de kaart: een grote bol in de kleur, een zachte bol en een halve ring
    vak({ position: "absolute", right: p(-bol * 0.3), bottom: p(-bol * 0.34), width: p(bol), height: p(bol), borderRadius: p(bol), background: g.kleur }),
    vak({ position: "absolute", left: p(-bol * 0.32), top: p(-bol * 0.36), width: p(bol * 0.8), height: p(bol * 0.8), borderRadius: p(bol), background: tint }),
    vak({ position: "absolute", right: p(marge * 0.5), top: p(-70), width: p(210), height: p(210), borderRadius: p(210), border: `${Math.max(2, p(26))}px solid ${g.kleur}`, opacity: 0.9 }),
    vak(
      {
        position: "absolute",
        left: p(marge),
        top: p(marge),
        width: p(kaartB),
        height: p(kaartH),
        borderRadius: p(56 * klein),
        background: "#FFFFFF",
        boxShadow: `0 ${p(24)}px ${p(60)}px rgba(23,33,28,0.14)`,
        flexDirection: "column",
        justifyContent: "space-between",
        padding: p(binnen),
      },
      // bovenaan: de naam, rechts de plaats als sticker
      vak(
        { alignItems: "center", justifyContent: "space-between", gap: p(20) },
        vak({ fontFamily: LETTER.kop, fontWeight: 700, color: kleurTekst, fontSize: p(lettergrootte(g.bedrijf, kaartB * 0.5, [[20, 44], [34, 36], [999, 29]]) * klein), lineHeight: 1.12, maxWidth: p(kaartB * (korteplaats ? 0.52 : 0.8)), wordBreak: "break-word" }, g.bedrijf),
        korteplaats
          ? vak({ flexShrink: 0, padding: `${p(12 * klein)}px ${p(26 * klein)}px`, borderRadius: p(999), background: tint, color: leesbaarOpLicht(g.kleur, tint), fontWeight: 600, fontSize: p(28 * klein), transform: "rotate(-4deg)" }, korteplaats)
          : null,
      ),
      // het midden: de kop in de schreefletter
      vak(
        { flexDirection: "column", maxWidth: p(kopBreedte) },
        vak({ fontFamily: LETTER.serif, fontWeight: 400, fontSize: p(kopMaat), lineHeight: 1.02, letterSpacing: p(-kopMaat * 0.012), wordBreak: "break-word" }, g.kop),
        vak(
          { alignItems: "center", gap: p(16 * klein), marginTop: p(30 * klein) },
          vak({ width: p(22 * klein), height: p(22 * klein), borderRadius: p(22), background: g.kleur, flexShrink: 0 }),
          vak({ width: p(120 * klein), height: p(8 * klein), borderRadius: p(8), background: tint }),
        ),
        vak({ marginTop: p(28 * klein), fontSize: p(lettergrootte(g.onderregel, kopBreedte, [[60, 40], [100, 36], [999, 32]], 0.5) * klein), lineHeight: 1.36, color: "#3C4A42", wordBreak: "break-word" }, g.onderregel),
      ),
      // onderaan: de knop en de contactregel
      vak(
        { alignItems: "center", gap: p(30 * klein), flexWrap: "wrap" },
        vak({ flexShrink: 0, padding: `${p(24 * klein)}px ${p(44 * klein)}px`, borderRadius: p(22 * klein), background: k.achtergrond, color: k.tekst, fontWeight: 600, fontSize: p(36 * klein) }, g.knop),
        onder.length
          ? vak(
              { flexDirection: "column", flexShrink: 1, maxWidth: p(kaartB * 0.5) },
              ...onder.map((regel, i) => vak({ fontSize: p((i === 0 ? lettergrootte(regel, kaartB * 0.44, [[24, 32], [40, 27], [999, 23]], 0.52) : 26) * klein), fontWeight: i === 0 ? 600 : 400, color: i === 0 ? inkt : "#5B6861", lineHeight: 1.3, wordBreak: "break-word" }, regel)),
            )
          : null,
      ),
    ),
  );
}

// --- 3. Groot: grote letters op de kleur -------------------------------------

function groot(g: OntwerpGegevens, f: FormaatId, p: Maat): ReactElement {
  const { breedte: W, hoogte: H } = FORMATEN[f];
  const k = knop(g.kleur);
  const band = meng(g.kleur, NACHT, 0.22);
  const rand = perFormaat(f, { vierkant: 76, verhaal: 84, liggend: 56 });
  const bandH = perFormaat(f, { vierkant: 176, verhaal: 230, liggend: 112 });
  const kopBreedte = W - rand * 2;
  const kopMaat = lettergrootte(
    g.kop,
    kopBreedte,
    perFormaat(f, {
      vierkant: [[7, 250], [12, 190], [22, 150], [36, 122], [50, 102], [999, 88]],
      verhaal: [[7, 290], [12, 210], [22, 176], [36, 148], [50, 128], [999, 110]],
      liggend: [[7, 150], [12, 118], [22, 96], [36, 78], [50, 66], [999, 56]],
    } as const),
    0.58,
  );
  const klein = perFormaat(f, { vierkant: 1, verhaal: 1.14, liggend: 0.72 });
  const ring = perFormaat(f, { vierkant: 900, verhaal: 1200, liggend: 620 });
  const knopKleur = leesbaarOpLicht(g.kleur, "#FFFFFF");
  const onder = [g.contact].filter(Boolean) as string[];

  return vak(
    { position: "relative", width: p(W), height: p(H), background: k.achtergrond, color: k.tekst, fontFamily: LETTER.tekst, overflow: "hidden" },
    // vormen: een brede ring die half buiten beeld valt
    vak({ position: "absolute", right: p(-ring * 0.42), bottom: p(bandH - ring * 0.42), width: p(ring), height: p(ring), borderRadius: p(ring), border: `${Math.max(2, p(ring * 0.1))}px solid ${k.tekst}`, opacity: 0.09 }),
    vak(
      { position: "relative", flexDirection: "column", width: p(W), height: p(H - bandH), padding: `${p(rand * 0.8)}px ${p(rand)}px ${p(rand * 0.7)}px` },
      // bovenaan: de naam in kapitalen met een lijn eronder
      vak(
        { alignItems: "flex-end", justifyContent: "space-between", gap: p(24), paddingBottom: p(22 * klein), borderBottom: `${Math.max(1, p(3))}px solid ${k.tekst === "#FFFFFF" ? "rgba(255,255,255,0.4)" : "rgba(10,18,14,0.35)"}` },
        vak({ fontWeight: 600, fontSize: p(lettergrootte(g.bedrijf, W * 0.55, [[22, 32], [36, 27], [999, 23]], 0.84) * klein), letterSpacing: p(3 * klein), textTransform: "uppercase", lineHeight: 1.2, maxWidth: p(W * 0.6), wordBreak: "break-word" }, g.bedrijf),
        g.plaats ? vak({ flexShrink: 1, fontSize: p(28 * klein), lineHeight: 1.2, textAlign: "right", maxWidth: p(W * 0.3), opacity: 0.86 }, g.plaats) : null,
      ),
      // de kop vult het vlak
      vak(
        { flexDirection: "column", flexGrow: 1, justifyContent: "center" },
        vak({ fontFamily: LETTER.kop, fontWeight: 800, fontSize: p(kopMaat), lineHeight: 0.98, letterSpacing: p(-kopMaat * 0.02), wordBreak: "break-word" }, g.kop),
        vak({ marginTop: p(30 * klein), fontSize: p(lettergrootte(g.onderregel, kopBreedte, [[60, 40], [100, 36], [999, 32]], 0.5) * klein), lineHeight: 1.34, opacity: 0.88, maxWidth: p(kopBreedte * 0.92), wordBreak: "break-word" }, g.onderregel),
      ),
    ),
    // de band onderaan: de knop en de contactregel
    vak(
      { position: "absolute", left: 0, bottom: 0, width: p(W), height: p(bandH), background: band, color: "#FFFFFF", alignItems: "center", justifyContent: "space-between", gap: p(28), padding: `0 ${p(rand)}px` },
      vak({ flexShrink: 0, padding: `${p(22 * klein)}px ${p(44 * klein)}px`, borderRadius: p(16 * klein), background: "#FFFFFF", color: knopKleur, fontFamily: LETTER.kop, fontWeight: 700, fontSize: p(38 * klein) }, g.knop),
      ...onder.map((regel) => vak({ flexShrink: 1, fontWeight: 600, fontSize: p(lettergrootte(regel, W * 0.44, [[24, 34], [40, 28], [999, 24]], 0.52) * klein), lineHeight: 1.25, textAlign: "right", maxWidth: p(W * 0.48), wordBreak: "break-word" }, regel)),
    ),
  );
}

const ONTWERP = { 1: strak, 2: licht, 3: groot } as const;

/**
 * Eén ontwerp als boom voor satori. `breedte` is de breedte van het beeld dat eruit komt; de hoogte volgt uit het formaat.
 * Met `metWatermerk` ligt de schuine tekst over het hele beeld (ingebakken in de PNG, niet te verwijderen in de browser).
 */
export function ontwerpBoom(nr: OntwerpNr, g: OntwerpGegevens, formaat: FormaatId, breedte: number, metWatermerk: boolean): ReactElement {
  const { breedte: W, hoogte: H } = FORMATEN[formaat];
  const schaal = breedte / W;
  const p: Maat = (n) => Math.round(n * schaal * 100) / 100;
  const beeld = ONTWERP[nr](g, formaat, p);
  if (!metWatermerk) return beeld;
  return vak({ position: "relative", width: p(W), height: p(H) }, beeld, watermerk(W, H, p));
}
