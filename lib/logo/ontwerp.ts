import type { ReactElement, ReactNode } from "react";
import { LETTER, vak, watermerk, type Maat, type Stijl } from "@/lib/advertentie/ontwerp";
import { kleurHex } from "@/lib/advertentie/regels";
import { contrast, meng, tekstOp } from "@/lib/rijschool/kleuren";
import { VARIANTEN, initialen, tweeRegels, type BrancheId, type LogoInvoer, type LogoNr, type SfeerId, type VariantId } from "@/lib/logo/regels";

// ---------------------------------------------------------------------------
// De zes logo's van de logo maker, als boom voor satori (next/og). Alles komt uit
// de naam met vaste ontwerpregels: typografie en eenvoudige vormen (vakken, cirkels,
// balken). Geen AI-beelden, geen foto's en geen tekens of plaatjes van derden.
// Puur; de beeldroute, de voorbeelden op de landingspagina en het proefscript
// gebruiken precies deze code. Maten in beeldpunten van een vlak van 1200 × 900
// (het icoon: 1000 × 1000); `breedte` schaalt naar de gevraagde maat.
// ---------------------------------------------------------------------------

const W = 1200;
const H = 900;
const ICOON = 1000;

interface Letter {
  font: string;
  gewicht: 400 | 600 | 700 | 800;
  hoofdletters: boolean;
  /** letterafstand als deel van de lettergrootte */
  spatie: number;
  /** geschatte breedte van één teken als deel van de lettergrootte (met de letterafstand erbij) */
  factor: number;
}

const TYPE: Record<SfeerId, Letter> = {
  strak: { font: LETTER.tekst, gewicht: 600, hoofdletters: false, spatie: -0.02, factor: 0.52 },
  speels: { font: LETTER.kop, gewicht: 800, hoofdletters: false, spatie: -0.025, factor: 0.56 },
  klassiek: { font: LETTER.serif, gewicht: 400, hoofdletters: true, spatie: 0.07, factor: 0.6 },
  stoer: { font: LETTER.smal, gewicht: 400, hoofdletters: true, spatie: 0.015, factor: 0.44 },
};

interface Palet {
  hoofd: string;
  tweede: string;
  /** dekking van de tweede toon (in één kleur is de tweede toon dezelfde kleur, lichter) */
  tweedeDekking: number;
  grijs: string;
  /** vormen gevuld (in kleur) of alleen een rand (in één kleur, zodat de letters erin zichtbaar blijven) */
  vol: boolean;
  opVorm: string;
}

function palet(variant: VariantId, kleur: string): Palet {
  if (variant === "wit") return { hoofd: "#FFFFFF", tweede: "#FFFFFF", tweedeDekking: 0.6, grijs: "#FFFFFF", vol: false, opVorm: "#FFFFFF" };
  if (variant === "zwart") return { hoofd: "#111111", tweede: "#111111", tweedeDekking: 0.5, grijs: "#111111", vol: false, opVorm: "#111111" };
  return { hoofd: kleur, tweede: meng(kleur, "#FFFFFF", 0.42), tweedeDekking: 1, grijs: "#5B6861", vol: true, opVorm: opKleur(kleur) };
}

/** Letters op een vlak in de kleur: wit zodra dat voor grote letters leesbaar is (3:1), anders donker. */
const opKleur = (kleur: string): string => (contrast(kleur, "#FFFFFF") >= 3 ? "#FFFFFF" : tekstOp(kleur));

const inLetter = (tekst: string, l: Letter): string => (l.hoofdletters ? tekst.toLocaleUpperCase("nl-NL") : tekst);
/** De grootste letter waarmee de tekst op één regel in `breedte` past. */
export const passend = (tekst: string, breedte: number, max: number, factor: number): number => Math.max(14, Math.min(max, Math.floor(breedte / (Math.max(1, tekst.length) * factor))));

interface Ctx {
  i: LogoInvoer;
  l: Letter;
  k: Palet;
  p: Maat;
}

function regel(c: Ctx, tekst: string, breedte: number, max: number, extra: Stijl = {}): ReactElement {
  const t = inLetter(tekst, c.l);
  const maat = passend(t, breedte, max, c.l.factor);
  return vak({ fontFamily: c.l.font, fontWeight: c.l.gewicht, fontSize: c.p(maat), letterSpacing: c.p(maat * c.l.spatie), lineHeight: 1.05, whiteSpace: "nowrap", color: c.k.hoofd, ...extra }, t);
}

function slogan(c: Ctx, breedte: number, max = 40, extra: Stijl = {}): ReactElement | null {
  if (!c.i.slogan) return null;
  const hoofd = c.i.sfeer === "stoer" || c.i.sfeer === "strak";
  const t = hoofd ? c.i.slogan.toLocaleUpperCase("nl-NL") : c.i.slogan;
  const maat = passend(t, breedte, max, hoofd ? 0.72 : 0.5);
  return vak(
    {
      fontFamily: c.i.sfeer === "klassiek" ? LETTER.serif : LETTER.tekst,
      fontStyle: c.i.sfeer === "klassiek" ? "italic" : "normal",
      fontWeight: c.i.sfeer === "klassiek" ? 400 : hoofd ? 600 : 400,
      fontSize: c.p(c.i.sfeer === "klassiek" ? maat * 1.15 : maat),
      letterSpacing: c.p(hoofd ? maat * 0.14 : 0),
      whiteSpace: "nowrap",
      color: c.k.grijs,
      opacity: c.k.vol ? 1 : 0.8,
      ...extra,
    },
    t,
  );
}

/** De vorm van het monogram, per sfeer: afgerond vierkant, cirkel, cirkel met ring of schild. */
function monogram(c: Ctx, zijde: number): ReactElement {
  const letters = initialen(c.i.naam);
  const rand = Math.max(2, c.p(zijde * 0.055));
  const straal: Record<SfeerId, string> = { strak: `${c.p(zijde * 0.24)}px`, speels: `${c.p(zijde)}px`, klassiek: `${c.p(zijde)}px`, stoer: `${c.p(zijde * 0.14)}px ${c.p(zijde * 0.14)}px ${c.p(zijde * 0.5)}px ${c.p(zijde * 0.5)}px` };
  const letterMaat = zijde * (letters.length > 1 ? (c.i.sfeer === "stoer" ? 0.5 : 0.42) : c.i.sfeer === "stoer" ? 0.62 : 0.56);
  const tekst = vak({ fontFamily: c.l.font, fontWeight: c.l.gewicht, fontSize: c.p(letterMaat), letterSpacing: c.p(letterMaat * (c.i.sfeer === "klassiek" ? 0.04 : -0.02)), lineHeight: 1, color: c.k.vol ? c.k.opVorm : c.k.hoofd, marginTop: c.p(c.i.sfeer === "stoer" ? -zijde * 0.06 : 0) }, letters);
  const basis: Stijl = { width: c.p(zijde), height: c.p(zijde), borderRadius: straal[c.i.sfeer], alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" };
  const vlak = c.k.vol ? { background: c.k.hoofd } : { border: `${rand}px solid ${c.k.hoofd}` };
  const kinderen: ReactNode[] = [];
  if (c.i.sfeer === "klassiek") kinderen.push(vak({ position: "absolute", left: c.p(zijde * 0.07), top: c.p(zijde * 0.07), width: c.p(zijde * 0.86), height: c.p(zijde * 0.86), borderRadius: c.p(zijde), border: `${Math.max(1, c.p(zijde * 0.012))}px solid ${c.k.vol ? c.k.opVorm : c.k.hoofd}`, opacity: 0.7 }));
  kinderen.push(tekst);
  const vorm = vak({ ...basis, ...vlak }, ...kinderen);
  if (c.i.sfeer !== "speels") return vorm;
  // speels: een tweede bol die er half achter vandaan komt
  return vak(
    { position: "relative", width: c.p(zijde * 1.14), height: c.p(zijde * 1.06), flexShrink: 0 },
    vak({ position: "absolute", right: 0, bottom: 0, width: c.p(zijde * 0.62), height: c.p(zijde * 0.62), borderRadius: c.p(zijde), background: c.k.tweede, opacity: c.k.tweedeDekking }),
    vak({ ...basis, ...vlak, position: "absolute", left: 0, top: 0, ...(c.k.vol ? {} : { background: "transparent" }) }, tekst),
  );
}

/** Het beeldmerk bij de soort bedrijf: alleen vakken, cirkels en balken. */
function beeldmerk(c: Ctx, m: number, branche: BrancheId): ReactElement {
  const a = c.k.hoofd;
  const b: Stijl = { background: c.k.tweede, opacity: c.k.tweedeDekking };
  const p = c.p;
  const doos = (...k: ReactNode[]) => vak({ position: "relative", width: p(m), height: p(m), flexShrink: 0 }, ...k);
  const op = (x: number, y: number, w: number, h: number, stijl: Stijl) => vak({ position: "absolute", left: p(m * x), top: p(m * y), width: p(m * w), height: p(m * h), ...stijl });
  switch (branche) {
    case "bouw":
      // gestapelde stenen in verband
      return doos(
        op(0, 0.08, 0.6, 0.24, { background: a, borderRadius: p(m * 0.05) }),
        op(0.66, 0.08, 0.34, 0.24, { ...b, borderRadius: p(m * 0.05) }),
        op(0, 0.38, 0.34, 0.24, { ...b, borderRadius: p(m * 0.05) }),
        op(0.4, 0.38, 0.6, 0.24, { background: a, borderRadius: p(m * 0.05) }),
        op(0, 0.68, 0.6, 0.24, { background: a, borderRadius: p(m * 0.05) }),
        op(0.66, 0.68, 0.34, 0.24, { ...b, borderRadius: p(m * 0.05) }),
      );
    case "horeca":
      // een bord van boven, met een stip
      return doos(op(0, 0, 1, 1, { borderRadius: p(m), border: `${Math.max(2, p(m * 0.1))}px solid ${a}` }), op(0.26, 0.26, 0.48, 0.48, { ...b, borderRadius: p(m) }), op(0.6, 0.18, 0.2, 0.2, { background: a, borderRadius: p(m) }));
    case "zorg":
      // een kruis in een zachte cirkel
      return doos(op(0, 0, 1, 1, { ...b, borderRadius: p(m) }), op(0.4, 0.18, 0.2, 0.64, { background: a, borderRadius: p(m * 0.08) }), op(0.18, 0.4, 0.64, 0.2, { background: a, borderRadius: p(m * 0.08) }));
    case "schoonmaak":
      // een druppel met een glinstering
      return doos(
        op(0.16, 0.26, 0.6, 0.6, { background: a, borderRadius: `0px ${p(m)}px ${p(m)}px ${p(m)}px`, transform: "rotate(45deg)" }),
        op(0.72, 0.04, 0.22, 0.22, { ...b, borderRadius: p(m) }),
        op(0.86, 0.3, 0.12, 0.12, { ...b, borderRadius: p(m) }),
      );
    case "transport": {
      // twee pijlpunten naar rechts
      const dik = Math.max(2, p(m * 0.13));
      const punt = (x: number, kleur: Stijl) => op(x, 0.24, 0.52, 0.52, { borderTop: `${dik}px solid ${a}`, borderRight: `${dik}px solid ${a}`, transform: "rotate(45deg)", ...kleur });
      return doos(punt(-0.08, { opacity: c.k.vol ? 0.45 : c.k.tweedeDekking }), punt(0.3, {}));
    }
    case "winkel":
      // een tas met een hengsel
      return doos(op(0.27, 0.02, 0.46, 0.46, { borderRadius: p(m), border: `${Math.max(2, p(m * 0.08))}px solid ${a}` }), op(0.08, 0.3, 0.84, 0.66, { background: a, borderRadius: p(m * 0.1) }), op(0.38, 0.5, 0.24, 0.24, { ...b, borderRadius: p(m), ...(c.k.vol ? {} : { background: "transparent" }) }));
    case "beauty":
      // drie bladen die elkaar overlappen
      return doos(op(0.02, 0.3, 0.6, 0.6, { background: a, borderRadius: p(m), opacity: 0.85 }), op(0.38, 0.3, 0.6, 0.6, { ...b, borderRadius: p(m), opacity: c.k.vol ? 0.9 : c.k.tweedeDekking }), op(0.2, 0.02, 0.6, 0.6, { background: a, borderRadius: p(m), opacity: 0.55 }));
    case "techniek":
      // een raster van stippen met een diagonaal
      return doos(
        ...[0, 1, 2].flatMap((rij) => [0, 1, 2].map((kol) => op(0.02 + kol * 0.36, 0.02 + rij * 0.36, 0.24, 0.24, rij + kol === 2 ? { background: a, borderRadius: p(m * 0.06) } : { ...b, borderRadius: p(m) }))),
      );
    case "advies":
      // drie balken die oplopen
      return doos(op(0.04, 0.58, 0.24, 0.38, { ...b, borderRadius: p(m * 0.05) }), op(0.38, 0.34, 0.24, 0.62, { background: a, borderRadius: p(m * 0.05), opacity: 0.8 }), op(0.72, 0.04, 0.24, 0.92, { background: a, borderRadius: p(m * 0.05) }));
    default:
      // vier kwartcirkels als een molentje
      return doos(
        op(0, 0, 0.47, 0.47, { background: a, borderRadius: `${p(m)}px 0px 0px 0px` }),
        op(0.53, 0, 0.47, 0.47, { ...b, borderRadius: `0px 0px ${p(m)}px 0px` }),
        op(0, 0.53, 0.47, 0.47, { ...b, borderRadius: `${p(m)}px 0px 0px 0px` }),
        op(0.53, 0.53, 0.47, 0.47, { background: a, borderRadius: `0px 0px ${p(m)}px 0px` }),
      );
  }
}

const midden: Stijl = { flexDirection: "column", alignItems: "center", justifyContent: "center" };

// --- de zes logo's -----------------------------------------------------------

function woordmerk(c: Ctx): ReactElement {
  const p = c.p;
  const naam = inLetter(c.i.naam, c.l);
  const maat = passend(naam, 1000, 300, c.l.factor);
  const tekst = regel(c, c.i.naam, 1000, 300);
  const lijn = (b: number, dik: number, extra: Stijl = {}) => vak({ width: p(b), height: Math.max(1, p(dik)), background: c.k.hoofd, ...extra });
  const s = c.i.sfeer;
  return vak(
    { ...midden, width: p(W), height: p(H) },
    s === "klassiek" ? lijn(Math.min(1000, naam.length * maat * c.l.factor) * 0.5, 4, { marginBottom: p(34) }) : null,
    s === "speels"
      ? vak({ alignItems: "flex-end" }, regel(c, c.i.naam, 1000, 300), vak({ width: p(maat * 0.2), height: p(maat * 0.2), borderRadius: p(maat), background: c.k.tweede, opacity: c.k.tweedeDekking, marginLeft: p(maat * 0.06), marginBottom: p(maat * 0.16) }))
      : s === "stoer"
        ? vak({ alignItems: "center" }, vak({ flexShrink: 0, width: p(maat * 0.2), height: p(maat * 0.9), background: c.k.tweede, opacity: c.k.tweedeDekking, marginRight: p(maat * 0.16), transform: "skewX(-12deg)" }), regel(c, c.i.naam, 1000, 300))
        : tekst,
    s === "strak" ? lijn(maat * 0.9, maat * 0.09, { marginTop: p(maat * 0.2), background: c.k.tweede, opacity: c.k.tweedeDekking, borderRadius: p(maat) }) : null,
    s === "klassiek" ? lijn(Math.min(1000, naam.length * maat * c.l.factor) * 0.5, 4, { marginTop: p(34) }) : null,
    slogan(c, 900, 42, { marginTop: p(s === "klassiek" ? 30 : 36) }),
  );
}

function metMonogram(c: Ctx): ReactElement {
  return vak({ ...midden, width: c.p(W), height: c.p(H) }, monogram(c, c.i.slogan ? 400 : 440), regel(c, c.i.naam, 960, 84, { marginTop: c.p(52) }), slogan(c, 860, 34, { marginTop: c.p(20) }));
}

function naastElkaar(c: Ctx): ReactElement {
  const p = c.p;
  const [een, twee] = tweeRegels(c.i.naam);
  const lang = c.i.naam.length > 16 && twee !== undefined;
  const breedte = 720;
  return vak(
    { alignItems: "center", justifyContent: "center", width: p(W), height: p(H), gap: p(54) },
    monogram(c, 280),
    vak(
      { flexDirection: "column", justifyContent: "center", maxWidth: p(breedte + 20) },
      ...(lang ? [regel(c, een, breedte, 104), regel(c, twee, breedte, 104, { marginTop: p(4) })] : [regel(c, c.i.naam, breedte, 120)]),
      slogan(c, breedte, 34, { marginTop: p(20) }),
    ),
  );
}

function gestapeld(c: Ctx): ReactElement {
  const p = c.p;
  const [een, twee] = tweeRegels(c.i.naam);
  const breedte = 780;
  const streep = (b: number) => vak({ flexShrink: 0, width: p(b), height: Math.max(1, p(4)), background: c.k.hoofd, opacity: 0.55 });
  return vak(
    { ...midden, width: p(W), height: p(H) },
    regel(c, een, breedte, twee === undefined ? 320 : 230),
    twee !== undefined ? regel(c, twee, breedte, 230, { color: c.k.tweede, opacity: c.k.tweedeDekking, marginTop: p(c.i.sfeer === "stoer" ? 18 : 6) }) : null,
    c.i.slogan ? vak({ alignItems: "center", gap: p(24), marginTop: p(44) }, streep(70), slogan(c, breedte - 220, 34), streep(70)) : twee === undefined ? vak({ marginTop: p(36) }, streep(220)) : null,
  );
}

function metBeeldmerk(c: Ctx): ReactElement {
  return vak({ ...midden, width: c.p(W), height: c.p(H) }, beeldmerk(c, c.i.slogan ? 320 : 360, c.i.branche), regel(c, c.i.naam, 980, 100, { marginTop: c.p(60) }), slogan(c, 860, 34, { marginTop: c.p(20) }));
}

function zegel(c: Ctx): ReactElement {
  const p = c.p;
  const d = 760;
  const letters = initialen(c.i.naam);
  const stip = () => vak({ flexShrink: 0, width: p(14), height: p(14), borderRadius: p(14), background: c.k.tweede, opacity: c.k.tweedeDekking });
  const streep = () => vak({ flexShrink: 0, width: p(110), height: Math.max(1, p(4)), background: c.k.hoofd, opacity: 0.6 });
  const scheiding = (extra: Stijl) => vak({ alignItems: "center", gap: p(18), ...extra }, streep(), stip(), streep());
  const klein: Letter = { ...c.l, hoofdletters: true, spatie: c.l.font === LETTER.smal ? 0.06 : 0.12, factor: c.l.font === LETTER.smal ? 0.56 : 0.84 };
  const regels = (c.i.naam.length > 18 ? tweeRegels(c.i.naam) : [c.i.naam]).map((r) => r.toLocaleUpperCase("nl-NL"));
  const naamMaat = Math.min(...regels.map((r) => passend(r, 480, 62, klein.factor)));
  const letterMaat = (letters.length > 1 ? 230 : 270) - (regels.length > 1 ? 40 : 0);
  return vak(
    { ...midden, width: p(W), height: p(H) },
    vak(
      { ...midden, position: "relative", width: p(d), height: p(d), borderRadius: p(d), border: `${Math.max(2, p(16))}px solid ${c.k.hoofd}` },
      vak({ position: "absolute", left: p(22), top: p(22), width: p(d - 76), height: p(d - 76), borderRadius: p(d), border: `${Math.max(1, p(4))}px solid ${c.k.hoofd}`, opacity: 0.6 }),
      ...regels.map((r) => vak({ fontFamily: klein.font, fontWeight: klein.gewicht, fontSize: p(naamMaat), letterSpacing: p(naamMaat * klein.spatie), lineHeight: 1.2, whiteSpace: "nowrap", color: c.k.hoofd }, r)),
      scheiding({ marginTop: p(26) }),
      vak({ fontFamily: c.l.font, fontWeight: c.l.gewicht, fontSize: p(letterMaat), lineHeight: 1, letterSpacing: p(letterMaat * (c.i.sfeer === "klassiek" ? 0.04 : -0.02)), color: c.k.hoofd, marginTop: p(c.i.sfeer === "stoer" ? 4 : 18), marginBottom: p(c.i.sfeer === "stoer" ? 30 : 18) }, letters),
      scheiding({}),
      slogan(c, 430, 30, { marginTop: p(24) }),
    ),
  );
}

/** Het vierkante icoon: de kleur als vlak met de letters (of het beeldmerk) erin. */
function icoon(c: Ctx, nr: LogoNr, kleur: string): ReactElement {
  const p = c.p;
  const op = opKleur(kleur);
  const wit: Ctx = { ...c, k: { hoofd: op, tweede: op, tweedeDekking: 0.6, grijs: op, vol: true, opVorm: kleur } };
  const letters = initialen(c.i.naam);
  const maat = letters.length > 1 ? (c.i.sfeer === "stoer" ? 520 : 440) : c.i.sfeer === "stoer" ? 660 : 600;
  return vak(
    { ...midden, width: p(ICOON), height: p(ICOON), background: kleur },
    nr === 5
      ? beeldmerk(wit, 560, c.i.branche)
      : vak({ fontFamily: c.l.font, fontWeight: c.l.gewicht, fontSize: p(maat), lineHeight: 1, letterSpacing: p(maat * (c.i.sfeer === "klassiek" ? 0.04 : -0.02)), color: op, marginTop: p(c.i.sfeer === "stoer" ? -40 : 0) }, letters),
  );
}

const LOGO = { 1: woordmerk, 2: metMonogram, 3: naastElkaar, 4: gestapeld, 5: metBeeldmerk, 6: zegel } as const;

/**
 * Eén logo als boom voor satori. `breedte` is de breedte van het beeld dat eruit komt. Zonder achtergrond (doorzichtig)
 * blijft alles buiten het logo leeg, zodat de PNG een alfakanaal houdt. Met `metWatermerk` ligt de schuine tekst erover.
 */
export function logoBoom(nr: LogoNr, invoer: LogoInvoer, variant: VariantId, breedte: number, metWatermerk: boolean): { boom: ReactElement; breedte: number; hoogte: number } {
  const vierkant = variant === "icoon";
  const basisB = vierkant ? ICOON : W;
  const basisH = vierkant ? ICOON : H;
  const schaal = breedte / basisB;
  const p: Maat = (n) => Math.round(n * schaal * 100) / 100;
  const kleur = kleurHex(invoer.kleur);
  const c: Ctx = { i: invoer, l: TYPE[invoer.sfeer], k: palet(variant, kleur), p };
  const beeld = vierkant ? icoon(c, nr, kleur) : LOGO[nr](c);
  const achtergrond = VARIANTEN[variant].doorzichtig || vierkant ? {} : { background: "#FFFFFF" };
  const boom = vak({ position: "relative", width: p(basisB), height: p(basisH), ...achtergrond }, beeld, metWatermerk ? watermerk(basisB, basisH, p) : null);
  return { boom, breedte, hoogte: Math.round((breedte * basisH) / basisB) };
}
