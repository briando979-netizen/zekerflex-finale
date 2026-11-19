import type { ReactElement, ReactNode } from "react";
import type { Meter } from "@/lib/advertentie/letter-maat";
import { LETTER, vak, watermerkOver, type Maat, type Stijl, type WatermerkTinten } from "@/lib/advertentie/ontwerp";
import { kleurHex } from "@/lib/advertentie/regels";
import { contrast, tekstOp } from "@/lib/rijschool/kleuren";
import { sjablonenVan } from "@/lib/logo/sjablonen";
import { embleem, teken } from "@/lib/logo/tekens";
import { kiesTekens } from "@/lib/logo/tekens/trefwoorden";
import { VARIANTEN, initialen, tweeRegels, type LogoInvoer, type LogoNr, type SfeerId, type SjabloonId, type ThemaId, type VariantId } from "@/lib/logo/regels";
import { baan, bergen, bliksem, bol, chevron, cirkel, kroon, lauwer, schild, ster, strepen, veeg, vleugel } from "@/lib/logo/vormen";

// ---------------------------------------------------------------------------
// De logo's van versie 2: negen per aanvraag, per sfeer een eigen set (streetwear,
// sport, luxe, gothic, techno, outdoor en de vier van eerst). Eén kleur, zoals een
// merk op een shirt: zware schuine letters, een baan achter het woord, sterren,
// bergtoppen, een bol, een kroon, en de naam klein en wijd gespatieerd eronder.
// De vormen zijn zelf getekend (lib/logo/vormen.ts); de tekens komen uit een open
// icoonbibliotheek die in de repo staat (lib/logo/tekens, Phosphor Icons, MIT) en
// de lettertypes zijn vrij (OFL). Geen AI-beelden en geen foto's. Een lange naam
// wordt in het beeldmerk een afkorting, met de volledige naam eronder; een naam
// van gemiddelde lengte staat in twee regels. De breedte van het woord komt uit
// het lettertype zelf (Meter), zodat een baan of band precies past.
// Puur; maten in beeldpunten van een vlak van 1200 × 900 (het icoon: 1000 × 1000).
// ---------------------------------------------------------------------------

const W = 1200;
const H = 900;
const ICOON = 1000;
export const DONKER = "#0B0B0C";

interface Letter {
  font: string;
  gewicht: 400 | 600 | 800 | 900;
  schuin: boolean;
  /** het merkwoord in hoofdletters */
  hoofd: boolean;
  /** letterafstand als deel van de lettergrootte */
  spatie: number;
  /** de letter is van zichzelf niet schuin: een beetje scheef zetten voor vaart */
  scheef?: number;
}

const TYPE: Record<SfeerId, Letter> = {
  streetwear: { font: LETTER.sport, gewicht: 900, schuin: true, hoofd: true, spatie: -0.01 },
  sport: { font: LETTER.sport, gewicht: 900, schuin: true, hoofd: true, spatie: 0 },
  luxe: { font: LETTER.luxeKop, gewicht: 400, schuin: false, hoofd: true, spatie: 0.06 },
  gothic: { font: LETTER.gotisch, gewicht: 400, schuin: false, hoofd: false, spatie: 0.01 },
  techno: { font: LETTER.techno, gewicht: 400, schuin: false, hoofd: true, spatie: 0.05, scheef: -9 },
  outdoor: { font: LETTER.smal, gewicht: 400, schuin: false, hoofd: true, spatie: 0.04 },
  strak: { font: LETTER.tekst, gewicht: 600, schuin: false, hoofd: false, spatie: -0.02 },
  speels: { font: LETTER.kop, gewicht: 800, schuin: false, hoofd: false, spatie: -0.025 },
  klassiek: { font: LETTER.serif, gewicht: 400, schuin: false, hoofd: true, spatie: 0.07 },
  stoer: { font: LETTER.smal, gewicht: 400, schuin: false, hoofd: true, spatie: 0.015, scheef: -8 },
};

/** De kleine regel onder het merk: wijd gespatieerde hoofdletters. */
const ONDER: Record<"schreef" | "recht", Letter> = {
  schreef: { font: LETTER.luxe, gewicht: 400, schuin: false, hoofd: true, spatie: 0.4 },
  recht: { font: LETTER.tekst, gewicht: 600, schuin: false, hoofd: true, spatie: 0.42 },
};
const MET_SCHREEF: readonly SfeerId[] = ["luxe", "gothic", "klassiek"];

interface Ctx {
  i: LogoInvoer;
  p: Maat;
  inkt: string;
  /** de kleur van het vlak erachter; null = geen achtergrond (doorzichtig bestand) */
  vlak: string | null;
  /** tekst op een vlak in de inktkleur (de band): de achtergrond, of bij een doorzichtig bestand een kleur die erop leesbaar is */
  tegen: string;
  meet: Meter;
  l: Letter;
  sub: Letter;
  /** het woord in het beeldmerk: de naam als die kort genoeg is, anders een afkorting */
  merk: string;
  /** één of twee letters voor een monogram */
  letters: string;
  /** de regel eronder: de volledige naam bij een afkorting, anders de slogan (of niets) */
  onder: string;
  /** drie tekens die bij het bedrijf passen (lib/logo/tekens/trefwoorden.ts), beste eerst */
  tekens: string[];
  /** het eerste teken past bij de woorden van het bedrijf zelf */
  eigen: boolean;
  /** hoeveel van de tekens uit de woorden van het bedrijf zelf komen (de rest is de standaard van het vak of de sfeer) */
  eigenAantal: number;
}

const hoofd = (t: string) => t.toLocaleUpperCase("nl-NL");
const inLetter = (t: string, l: Letter) => (l.hoofd ? hoofd(t) : t);
const aantal = (t: string) => [...t].length;

/** De breedte van een tekst in beeldpunten van het basisvlak. */
const breedte = (c: Ctx, tekst: string, maat: number, l: Letter) => maat * (c.meet(l.font, tekst) + l.spatie * Math.max(0, aantal(tekst) - 1));
/** De grootste letter waarmee de tekst in `max` breed past. */
const passend = (c: Ctx, tekst: string, l: Letter, max: number, grootst: number) => Math.max(18, Math.min(grootst, max / Math.max(0.3, c.meet(l.font, tekst) + l.spatie * Math.max(0, aantal(tekst) - 1))));

function tekst(c: Ctx, t: string, maat: number, l: Letter, extra: Stijl = {}): ReactElement {
  return vak(
    {
      fontFamily: l.font,
      fontWeight: l.gewicht,
      fontStyle: l.schuin ? "italic" : "normal",
      fontSize: c.p(maat),
      letterSpacing: c.p(maat * l.spatie),
      lineHeight: 1,
      whiteSpace: "nowrap",
      color: c.inkt,
      ...(l.scheef ? { transform: `skewX(${l.scheef}deg)` } : {}),
      ...extra,
    },
    t,
  );
}

/** De wijd gespatieerde regel onder het merk; valt weg als er niets te zeggen is. */
function onderregel(c: Ctx, max = 760, grootst = 40, extra: Stijl = {}, tekstOnder = c.onder): ReactElement | null {
  if (!tekstOnder) return null;
  const t = hoofd(tekstOnder);
  // een lange naam krijgt minder lucht tussen de letters, anders wordt hij onleesbaar klein
  const sub: Letter = aantal(t) > 30 ? { ...c.sub, spatie: 0.1 } : aantal(t) > 20 ? { ...c.sub, spatie: 0.2 } : c.sub;
  const maat = passend(c, t, sub, max, grootst);
  // de letterafstand staat ook achter de laatste letter: links evenveel erbij, dan staat de regel in het midden
  return tekst(c, t, maat, sub, { paddingLeft: c.p(maat * sub.spatie), ...extra });
}
const naamOnder = (c: Ctx, max = 760, grootst = 40, extra: Stijl = {}) => onderregel(c, max, grootst, extra, c.i.naam);

/**
 * Het merkwoord als blok: op één regel als het kort is, in twee regels (zo gelijk mogelijk) bij een naam van gemiddelde
 * lengte met meer dan één woord. Geeft het blok en zijn maten terug.
 */
function merkblok(c: Ctx, max: number, grootst: number, uitlijn: "center" | "flex-start" = "center"): { el: ReactElement; b: number; h: number; maat: number } {
  const t = inLetter(c.merk, c.l);
  const regels = aantal(c.merk) > 12 ? tweeRegels(t) : [t];
  if (regels.length === 1) {
    const maat = passend(c, t, c.l, max, grootst);
    return { el: tekst(c, t, maat, c.l), b: breedte(c, t, maat, c.l), h: maat, maat };
  }
  const maat = Math.min(...regels.map((r) => passend(c, r, c.l, max * 0.82, grootst * 0.86)));
  const b = Math.max(...regels.map((r) => breedte(c, r, maat, c.l)));
  return { el: vak({ flexDirection: "column", alignItems: uitlijn }, ...regels.map((r, n) => tekst(c, r, maat, c.l, { marginTop: c.p(n ? maat * 0.06 : 0) }))), b, h: maat * 2.06, maat };
}

/** Alles in het midden van het vlak; de maten hieronder zijn ruim binnen de rand gekozen en worden hier een kwart groter gezet. */
const kolom = (c: Ctx, ...kinderen: ReactNode[]) => vak({ flexDirection: "column", alignItems: "center", justifyContent: "center", width: c.p(W), height: c.p(H), transform: "scale(1.22)" }, ...kinderen);
const laag = (c: Ctx, b: number, h: number, ...kinderen: ReactNode[]) => vak({ position: "relative", width: c.p(b), height: c.p(h), flexShrink: 0 }, ...kinderen);
const op = (c: Ctx, x: number, y: number, kind: ReactNode, extra: Stijl = {}) => vak({ position: "absolute", left: c.p(x), top: c.p(y), ...extra }, kind);

// --- de sjablonen -----------------------------------------------------------

/**
 * Het woord met een baan en een ster. De baan loopt ACHTER het woord langs: het woord staat er nog eens onder in de kleur
 * van de achtergrond met een dikke rand, zodat de ring de letters nergens raakt. Bij een doorzichtig bestand is er geen
 * achtergrondkleur; dan ligt de ring ruim om het woord heen.
 */
function tBaan(c: Ctx): ReactElement {
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 600, 240);
  const w = breedte(c, t, maat, c.l);
  const uitsparing = c.vlak !== null;
  // plat en schuin, zoals een planeetbaan; zonder uitsparing hoger, zodat hij vrij blijft van de letters
  const rx = w / 2 + (uitsparing ? maat * 0.34 : Math.max(maat * 0.6, 90));
  const ry = uitsparing ? Math.max(maat * 0.62, w * 0.17) : Math.max(maat * 0.86, w * 0.24);
  const ring = baan(c.p(rx), c.p(ry), c.inkt, uitsparing ? -13 : -9, c.p(Math.max(11, maat * 0.085)), c.p(2.5));
  const B = 2 * rx + 90;
  const Hh = Math.max(2 * ry + maat * 0.7, maat * 1.5);
  const s = Math.max(66, maat * 0.4);
  const rand = Math.max(8, maat * 0.14);
  return kolom(
    c,
    laag(
      c,
      B,
      Hh,
      vak({ position: "absolute", left: c.p(B / 2) - ring.breedte / 2, top: c.p(Hh / 2) - ring.hoogte / 2 }, ring.el),
      uitsparing ? op(c, (B - w) / 2, Hh / 2 - maat * 0.52, tekst(c, t, maat, c.l, { color: c.vlak ?? c.inkt, WebkitTextStroke: `${c.p(rand)}px ${c.vlak ?? c.inkt}` })) : null,
      op(c, (B - w) / 2, Hh / 2 - maat * 0.52, tekst(c, t, maat, c.l)),
      op(c, B - s * 1.25, Hh / 2 - ry - s * 0.45, ster(c.p(s), c.inkt)),
    ),
    onderregel(c, 700, 40, { marginTop: c.p(26) }),
  );
}

/** Monogram met snelheidsstrepen en een ster. */
function tStrepen(c: Ctx): ReactElement {
  const l: Letter = c.l.schuin || c.l.scheef ? c.l : { ...c.l, scheef: -10 };
  const t = hoofd(c.letters);
  const maat = aantal(t) > 1 ? 300 : 360;
  const w = breedte(c, t, maat, l);
  const sb = maat * 0.62;
  return kolom(
    c,
    laag(c, sb * 0.72 + w + maat * 0.3, maat * 1.02, op(c, 0, maat * 0.34, strepen(c.p(sb), c.inkt)), op(c, sb * 0.72, 0, tekst(c, t, maat, l)), op(c, sb * 0.72 + w + maat * 0.02, -maat * 0.02, ster(c.p(maat * 0.26), c.inkt))),
    naamOnder(c, 760, 42, { marginTop: c.p(34) }),
  );
}

/** Bergtoppen boven het woord. */
function tBerg(c: Ctx, variant: 1 | 2 | 3): ReactElement {
  const m = merkblok(c, 700, 150);
  const b = Math.max(340, Math.min(520, m.b * 0.8));
  return kolom(c, bergen(c.p(b), c.inkt, variant), vak({ marginTop: c.p(m.maat * 0.16) }, m.el), c.onder ? onderregel(c, 700, 36, { marginTop: c.p(24) }) : vak({ marginTop: c.p(22) }, ster(c.p(56), c.inkt)));
}

/** Het woord dwars door een wereldbol. */
function tBol(c: Ctx): ReactElement {
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 700, 150);
  const w = breedte(c, t, maat, c.l);
  const d = Math.max(340, Math.min(470, w * 0.74));
  const B = Math.max(w, d) + 120;
  return kolom(
    c,
    laag(c, B, d * 0.8 + maat * 1.02, op(c, (B - d) / 2, 0, bol(c.p(d), c.inkt, "boven", 2.2)), op(c, (B - w) / 2, d * 0.4, tekst(c, t, maat, c.l)), op(c, (B - d) / 2, d * 0.4 + maat * 1.02, bol(c.p(d), c.inkt, "onder", 2.2)), op(c, (B + d) / 2 + 4, d * 0.02, ster(c.p(64), c.inkt))),
    onderregel(c, 700, 36, { marginTop: c.p(30) }),
  );
}

/** Een scherp teken met de naam eronder. */
function tChevron(c: Ctx): ReactElement {
  return kolom(c, chevron(c.p(330), c.inkt), naamOnder(c, 760, 50, { marginTop: c.p(52) }));
}

/** Een grote ster met een kleine erbij, boven het woord. */
function tSter(c: Ctx): ReactElement {
  const m = merkblok(c, 680, 150);
  return kolom(c, laag(c, 300, 230, op(c, 30, 10, ster(c.p(220), c.inkt)), op(c, 222, 0, ster(c.p(74), c.inkt))), vak({ marginTop: c.p(26) }, m.el), onderregel(c, 700, 36, { marginTop: c.p(24) }));
}

/** Eén letter met een kroon. */
function tKroon(c: Ctx): ReactElement {
  const t = [...c.letters][0] ?? "?";
  const maat = 380;
  return kolom(c, kroon(c.p(150), c.inkt), tekst(c, t, maat, { ...c.l, spatie: 0 }, { marginTop: c.p(c.l.font === LETTER.gotisch ? -8 : 2) }), naamOnder(c, 720, 40, { marginTop: c.p(34) }));
}

/**
 * Een rond embleem: het teken van het bedrijf groot in een ring, met de naam op een rechte band eroverheen. De band is een
 * vol vlak in de inktkleur; de naam staat erin in de kleur van de achtergrond.
 */
function tBand(c: Ctx): ReactElement {
  const d = 470;
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 620, 92);
  const w = breedte(c, t, maat, c.l);
  const bandB = Math.max(d * 1.12, w + maat * 1.1);
  const bandH = maat * 1.5;
  const B = Math.max(bandB, d);
  const bandY = d * 0.6;
  const lijn = 12;
  return kolom(
    c,
    laag(
      c,
      B,
      d,
      op(c, (B - d) / 2, 0, vak({ width: c.p(d), height: c.p(d), borderRadius: c.p(d), border: `${Math.max(2, c.p(lijn))}px solid ${c.inkt}` })),
      op(c, (B - d) / 2 + 26, 26, vak({ width: c.p(d - 52), height: c.p(d - 52), borderRadius: c.p(d), border: `${Math.max(1, c.p(3))}px solid ${c.inkt}`, opacity: 0.55 })),
      op(c, (B - d) / 2, d * 0.1, vak({ width: c.p(d), height: c.p(d * 0.46), alignItems: "center", justifyContent: "center" }, teken(c.tekens[0] ?? "", c.p(d * 0.4), c.inkt) ?? ster(c.p(d * 0.36), c.inkt))),
      op(c, (B - bandB) / 2, bandY, vak({ width: c.p(bandB), height: c.p(bandH), background: c.inkt, alignItems: "center", justifyContent: "center", transform: "skewX(-6deg)" })),
      op(c, (B - w) / 2, bandY + bandH / 2 - maat * 0.52, tekst(c, t, maat, c.l, { color: c.tegen })),
      op(c, B / 2 - 38, d * 0.86, vak({ alignItems: "center", gap: c.p(14) }, ...[0, 1, 2].map((n) => vak({ width: c.p(n === 1 ? 16 : 10), height: c.p(n === 1 ? 16 : 10), borderRadius: c.p(20), background: c.inkt })))),
    ),
    onderregel(c, 760, 34, { marginTop: c.p(26) }),
  );
}

/** Het teken van het bedrijf in een schild, met de naam eronder. */
function tSchild(c: Ctx): ReactElement {
  const b = 320;
  return kolom(
    c,
    laag(c, b, b * 1.2, op(c, 0, 0, schild(c.p(b), c.inkt, 5)), op(c, 0, b * 0.14, vak({ width: c.p(b), height: c.p(b * 0.78), alignItems: "center", justifyContent: "center" }, teken(c.tekens[0] ?? "", c.p(b * 0.48), c.inkt) ?? ster(c.p(b * 0.44), c.inkt)))),
    naamOnder(c, 760, 42, { marginTop: c.p(34) }),
  );
}

/** De letters tussen twee vleugels. */
function tVleugels(c: Ctx): ReactElement {
  const t = hoofd(c.letters);
  const maat = aantal(t) > 1 ? 230 : 270;
  return kolom(
    c,
    vak({ alignItems: "center", gap: c.p(22) }, vleugel(c.p(220), c.inkt), tekst(c, t, maat, { ...c.l, scheef: 0 }), vleugel(c.p(220), c.inkt, true)),
    naamOnder(c, 760, 40, { marginTop: c.p(36) }),
  );
}

/** Het woord tussen twee lijnen, met een ster in de bovenste. */
function tBreed(c: Ctx): ReactElement {
  const m = merkblok(c, 820, 160);
  const w = Math.max(360, m.b);
  const lijn = (b: number) => vak({ width: c.p(b), height: Math.max(1, c.p(5)), background: c.inkt, flexShrink: 0 });
  return kolom(c, vak({ alignItems: "center", gap: c.p(20) }, lijn((w - 100) / 2), ster(c.p(60), c.inkt), lijn((w - 100) / 2)), vak({ marginTop: c.p(m.maat * 0.2), marginBottom: c.p(m.maat * 0.2) }, m.el), lijn(w), onderregel(c, w, 36, { marginTop: c.p(30) }));
}

/** De letters in een lauwerkrans. */
function tLauwer(c: Ctx): ReactElement {
  const t = hoofd(c.letters);
  const d = 430;
  const maat = passend(c, t, c.l, d * 0.42, 190);
  const w = breedte(c, t, maat, c.l);
  return kolom(c, laag(c, d, d, op(c, 0, 0, lauwer(c.p(d), c.inkt)), op(c, (d - w) / 2, d * 0.5 - maat * 0.52, tekst(c, t, maat, { ...c.l, scheef: 0 }))), naamOnder(c, 760, 40, { marginTop: c.p(10) }));
}

/** Een teken (of een bliksemschicht) naast het woord. */
function tNaast(c: Ctx): ReactElement {
  const m = merkblok(c, 600, 170, "flex-start");
  const hoogte = Math.max(200, Math.min(300, m.h * 1.3));
  return kolom(
    c,
    vak(
      { alignItems: "center", gap: c.p(36) },
      // het tweede teken alleen als dat ook uit de woorden van het bedrijf zelf komt; anders hetzelfde teken als elders
      (c.eigen ? teken((c.eigenAantal > 1 ? c.tekens[1] : undefined) ?? c.tekens[0] ?? "", c.p(hoogte), c.inkt) : null) ?? bliksem(c.p(hoogte * 1.1), c.inkt),
      vak({ flexDirection: "column", alignItems: "flex-start" }, m.el, onderregel(c, Math.max(460, m.b), 32, { marginTop: c.p(22), paddingLeft: 0 })),
    ),
  );
}

/** De naam in twee regels, met een veeg eronder. */
function tStapel(c: Ctx): ReactElement {
  const bron = aantal(c.i.naam) <= 26 ? c.i.naam : c.merk;
  const regels = tweeRegels(bron).map((r) => inLetter(r, c.l));
  const b = 600;
  const maten = regels.map((r) => passend(c, r, c.l, b, regels.length > 1 ? 190 : 230));
  const breed = Math.max(...regels.map((r, n) => breedte(c, r, maten[n] ?? 100, c.l)));
  return kolom(
    c,
    ...regels.map((r, n) => tekst(c, r, maten[n] ?? 100, c.l, { marginTop: c.p(n ? (maten[n] ?? 100) * 0.04 : 0) })),
    vak({ alignItems: "flex-start", marginTop: c.p(26), gap: c.p(10) }, veeg(c.p(breed * 0.86), c.p(34), c.inkt), ster(c.p(54), c.inkt)),
    bron === c.i.naam ? onderregel(c, 700, 34, { marginTop: c.p(24) }, c.i.slogan ?? "") : naamOnder(c, 760, 36, { marginTop: c.p(24) }),
  );
}

/** De letters in een fijne dubbele cirkel. */
function tCirkel(c: Ctx): ReactElement {
  const t = hoofd(c.letters);
  const d = 350;
  const maat = passend(c, t, c.l, d * 0.5, 170);
  const w = breedte(c, t, maat, c.l);
  return kolom(
    c,
    laag(c, d, d, op(c, 0, 0, cirkel(c.p(d), c.inkt, 1.6)), op(c, (d - w) / 2, d * 0.5 - maat * 0.52, tekst(c, t, maat, { ...c.l, scheef: 0 }))),
    vak({ width: c.p(16), height: c.p(16), background: c.inkt, transform: "rotate(45deg)", marginTop: c.p(30) }),
    naamOnder(c, 760, 40, { marginTop: c.p(30) }),
  );
}

/** Het teken van het bedrijf boven het woord. */
function tTeken(c: Ctx): ReactElement {
  const m = merkblok(c, 720, 130);
  return kolom(c, teken(c.tekens[0] ?? "", c.p(m.h > 150 ? 220 : 270), c.inkt) ?? ster(c.p(220), c.inkt), vak({ marginTop: c.p(40) }, m.el), onderregel(c, 700, 34, { marginTop: c.p(24) }));
}

/** Het teken uitgespaard in een rond vlak, met een ster en de naam eronder. */
function tEmbleem(c: Ctx): ReactElement {
  const d = 400;
  return kolom(c, laag(c, d + 70, d, op(c, 35, 0, embleem(c.tekens[0] ?? "", c.p(d), c.inkt) ?? cirkel(c.p(d), c.inkt)), op(c, d + 4, -6, ster(c.p(78), c.inkt))), naamOnder(c, 780, 46, { marginTop: c.p(40) }));
}

const SJABLOON: Record<SjabloonId, (c: Ctx) => ReactElement> = {
  baan: tBaan,
  strepen: tStrepen,
  berg: (c) => tBerg(c, 1),
  berg2: (c) => tBerg(c, 2),
  bol: tBol,
  chevron: tChevron,
  ster: tSter,
  kroon: tKroon,
  zegel: tBand,
  schild: tSchild,
  vleugels: tVleugels,
  breed: tBreed,
  lauwer: tLauwer,
  bliksem: tNaast,
  stapel: tStapel,
  cirkel: tCirkel,
  teken: tTeken,
  embleem: tEmbleem,
};

/** Sjablonen waarin het teken van het bedrijf de hoofdrol speelt: daar toont ook het vierkante icoon het teken. */
const MET_TEKEN: readonly SjabloonId[] = ["teken", "embleem", "zegel", "schild"];

const KLEIN = new Set(["de", "het", "een", "van", "der", "den", "en", "in", "op", "voor", "bij", "te", "ter", "'t", "&", "+", "-"]);
/** Tot deze lengte staat de naam voluit in het beeldmerk (boven de twaalf tekens in twee regels); daarboven een afkorting. */
export const VOLUIT_TOT = 24;

/** Het woord in het beeldmerk: de naam voluit als die kort genoeg is, anders een afkorting van hooguit drie letters. */
export function merkwoord(naam: string): string {
  if (aantal(naam) <= VOLUIT_TOT) return naam;
  const woorden = naam.split(/\s+/).filter((w) => w && !KLEIN.has(w.toLowerCase()));
  const letters = woorden.map((w) => [...w].find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? "").filter(Boolean);
  return letters.length >= 2 ? hoofd(letters.slice(0, 3).join("")) : hoofd(initialen(naam));
}

/** Letters op een vlak in de kleur: wit zodra dat voor grote letters leesbaar is (3:1), anders donker. */
const opKleur = (kleur: string): string => (contrast(kleur, "#FFFFFF") >= 3 ? "#FFFFFF" : tekstOp(kleur));

export type Ondergrond = { soort: "thema"; thema: ThemaId } | { soort: "variant"; variant: VariantId };

/**
 * Eén logo van versie 2 als boom voor satori. `ondergrond` is bij een voorbeeld het thema (wit op donker, zwart op wit of
 * in kleur op wit) en na vrijgave de variant. Zonder achtergrond blijft alles buiten het logo leeg (PNG met alfakanaal).
 * `hoeklabel` zet een klein "voorbeeld" in de hoek (voor de verzonnen merken op de landingspagina's).
 */
export const LOGO_WATERMERK_LETTER = 54;
export const LOGO_VLAK = { breedte: W, hoogte: H } as const;

/** De tinten van het watermerk bij een voorbeeld: de ondergrond (snijdt door het logo) en de inkt van het logo (fluistert). */
export function logoTinten(invoer: LogoInvoer, thema: ThemaId): WatermerkTinten {
  if (thema === "donker") return { snij: DONKER, inkt: "#FFFFFF" };
  return { snij: "#FFFFFF", inkt: thema === "licht" ? "#111111" : kleurHex(invoer.kleur) };
}

export function logoBoom2(nr: LogoNr, invoer: LogoInvoer, ondergrond: Ondergrond, breedteUit: number, metWatermerk: boolean, meet: Meter, hoeklabel = false, laag?: string): { boom: ReactElement; breedte: number; hoogte: number } {
  const kleur = kleurHex(invoer.kleur);
  const vierkant = ondergrond.soort === "variant" && ondergrond.variant === "icoon";
  const basisB = vierkant ? ICOON : W;
  const basisH = vierkant ? ICOON : H;
  const schaal = breedteUit / basisB;
  const p: Maat = (n) => Math.round(n * schaal * 100) / 100;
  let inkt = kleur;
  let achtergrond: string | null = "#FFFFFF";
  if (ondergrond.soort === "thema") {
    if (ondergrond.thema === "donker") [inkt, achtergrond] = ["#FFFFFF", DONKER];
    else if (ondergrond.thema === "licht") inkt = "#111111";
  } else if (vierkant) [inkt, achtergrond] = [opKleur(kleur), kleur];
  else {
    if (ondergrond.variant === "wit") inkt = "#FFFFFF";
    if (ondergrond.variant === "zwart") inkt = "#111111";
    if (VARIANTEN[ondergrond.variant].doorzichtig) achtergrond = null;
  }
  // tekst op een vlak in de inktkleur: de achtergrond; zonder achtergrond de tegenkleur van de inkt
  const tegen = achtergrond ?? (inkt === "#FFFFFF" ? "#111111" : inkt === "#111111" ? "#FFFFFF" : opKleur(inkt));
  const l = TYPE[invoer.sfeer];
  const merk = merkwoord(invoer.naam);
  const keuze = kiesTekens(invoer);
  const c: Ctx = { i: invoer, p, inkt, vlak: achtergrond, tegen, meet, l, sub: ONDER[MET_SCHREEF.includes(invoer.sfeer) ? "schreef" : "recht"], merk, letters: initialen(invoer.naam), onder: merk === invoer.naam ? (invoer.slogan ?? "") : invoer.naam, tekens: keuze.tekens, eigen: keuze.eigen, eigenAantal: keuze.eigenAantal };
  const sjabloon = sjablonenVan(invoer)[nr - 1] ?? "breed";
  let beeld: ReactElement;
  if (vierkant) {
    // het icoon: bij een logo met een teken dat teken, anders de letters
    const t = hoofd(c.letters);
    const maat = passend(c, t, l, 620, aantal(t) > 1 ? 470 : 600);
    const inhoud = (MET_TEKEN.includes(sjabloon) ? teken(c.tekens[0] ?? "", p(560), inkt) : null) ?? tekst(c, t, maat, { ...l, spatie: 0 });
    beeld = vak({ width: p(ICOON), height: p(ICOON), alignItems: "center", justifyContent: "center" }, inhoud);
  } else {
    beeld = SJABLOON[sjabloon](c);
  }
  const label = hoeklabel
    ? vak({ position: "absolute", left: p(26), top: p(26), padding: `${p(8)}px ${p(18)}px`, borderRadius: p(40), border: `${Math.max(1, p(2))}px solid ${inkt}`, color: inkt, opacity: 0.6, fontFamily: LETTER.tekst, fontWeight: 600, fontSize: p(26), letterSpacing: p(3) }, "VOORBEELD")
    : null;
  const boom = vak({ position: "relative", width: p(basisB), height: p(basisH), ...(achtergrond ? { background: achtergrond } : {}) }, beeld, label, metWatermerk ? watermerkOver(basisB, basisH, p, LOGO_WATERMERK_LETTER, { snij: achtergrond ?? "#FFFFFF", inkt }, laag) : null);
  return { boom, breedte: breedteUit, hoogte: Math.round((breedteUit * basisH) / basisB) };
}
