import type { ReactElement, ReactNode } from "react";
import type { Meter } from "@/lib/advertentie/letter-maat";
import { LETTER, vak, watermerk, type Maat, type Stijl } from "@/lib/advertentie/ontwerp";
import { kleurHex } from "@/lib/advertentie/regels";
import { contrast, tekstOp } from "@/lib/rijschool/kleuren";
import { sjablonenVan } from "@/lib/logo/sjablonen";
import { embleem, teken } from "@/lib/logo/tekens";
import { kiesTekens } from "@/lib/logo/tekens/trefwoorden";
import { VARIANTEN, initialen, tweeRegels, type LogoInvoer, type LogoNr, type SfeerId, type SjabloonId, type ThemaId, type VariantId } from "@/lib/logo/regels";
import { baan, bergen, bliksem, bol, chevron, cirkel, kroon, lauwer, schild, ster, strepen, veeg, vleugel, zegelring } from "@/lib/logo/vormen";

// ---------------------------------------------------------------------------
// De logo's van versie 2: negen per aanvraag, per sfeer een eigen set (streetwear,
// sport, luxe, gothic, techno, outdoor en de vier van eerst). Eén kleur, zoals een
// merk op een shirt: zware schuine letters, een baan om het woord, sterren,
// bergtoppen, een bol, een kroon, en de naam klein en wijd gespatieerd eronder.
// Alles uit eigen vormen (lib/logo/vormen.ts) en vrije lettertypes; geen
// AI-beelden, geen foto's, geen ontwerpen van anderen. Een lange naam wordt in het
// beeldmerk een afkorting, met de volledige naam eronder. De breedte van het woord
// komt uit het lettertype zelf (Meter), zodat een baan of lijn precies past.
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
  luxe: { font: LETTER.luxe, gewicht: 400, schuin: false, hoofd: true, spatie: 0.1 },
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
  meet: Meter;
  l: Letter;
  sub: Letter;
  /** het woord in het beeldmerk: de naam als die kort is, anders een afkorting */
  merk: string;
  /** één of twee letters voor een monogram */
  letters: string;
  /** de regel eronder: de volledige naam bij een afkorting, anders de slogan (of niets) */
  onder: string;
  /** drie tekens die bij het bedrijf passen (lib/logo/tekens/trefwoorden.ts), beste eerst */
  tekens: string[];
  /** het eerste teken past bij de woorden van het bedrijf zelf */
  eigen: boolean;
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

/** Alles in het midden van het vlak; de maten hieronder zijn ruim binnen de rand gekozen en worden hier een kwart groter gezet. */
const kolom = (c: Ctx, ...kinderen: ReactNode[]) => vak({ flexDirection: "column", alignItems: "center", justifyContent: "center", width: c.p(W), height: c.p(H), transform: "scale(1.22)" }, ...kinderen);
const laag = (c: Ctx, b: number, h: number, ...kinderen: ReactNode[]) => vak({ position: "relative", width: c.p(b), height: c.p(h), flexShrink: 0 }, ...kinderen);
const op = (c: Ctx, x: number, y: number, kind: ReactNode, extra: Stijl = {}) => vak({ position: "absolute", left: c.p(x), top: c.p(y), ...extra }, kind);

// --- de sjablonen -----------------------------------------------------------

/** Het woord in een baan met een ster. */
function tBaan(c: Ctx): ReactElement {
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 640, 250);
  const w = breedte(c, t, maat, c.l);
  // de baan ruim om het woord: bij een lang woord hoger, zodat hij de letters niet raakt
  const ry = Math.max(maat * 0.78, w * 0.2);
  const ring = baan(c.p(w / 2 + Math.max(maat * 0.5, 70)), c.p(ry), c.inkt, -9, c.p(Math.max(12, maat * 0.1)), c.p(2.5));
  const B = w + Math.max(maat * 1.3, 180);
  const Hh = ry * 2 + 60;
  const s = Math.max(70, maat * 0.42);
  return kolom(
    c,
    laag(
      c,
      B,
      Hh,
      vak({ position: "absolute", left: c.p(B / 2) - ring.breedte / 2, top: c.p(Hh / 2) - ring.hoogte / 2 }, ring.el),
      op(c, (B - w) / 2, Hh / 2 - maat * 0.52, tekst(c, t, maat, c.l)),
      op(c, B - s * 1.35, -s * 0.1, ster(c.p(s), c.inkt)),
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
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 700, 150);
  const w = breedte(c, t, maat, c.l);
  const b = Math.max(360, Math.min(520, w * 0.8));
  return kolom(c, bergen(c.p(b), c.inkt, variant), tekst(c, t, maat, c.l, { marginTop: c.p(maat * 0.16) }), c.onder ? onderregel(c, 700, 36, { marginTop: c.p(24) }) : vak({ marginTop: c.p(22) }, ster(c.p(56), c.inkt)));
}

/** Het woord dwars door een wereldbol. */
function tBol(c: Ctx): ReactElement {
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 700, 150);
  const w = breedte(c, t, maat, c.l);
  const d = Math.max(340, Math.min(470, w * 0.74));
  return kolom(
    c,
    laag(c, Math.max(w, d) + 120, d * 0.8 + maat * 1.02, op(c, (Math.max(w, d) + 120 - d) / 2, 0, bol(c.p(d), c.inkt, "boven", 2.2)), op(c, (Math.max(w, d) + 120 - w) / 2, d * 0.4, tekst(c, t, maat, c.l)), op(c, (Math.max(w, d) + 120 - d) / 2, d * 0.4 + maat * 1.02, bol(c.p(d), c.inkt, "onder", 2.2)), op(c, (Math.max(w, d) + 120 + d) / 2 + 4, d * 0.02, ster(c.p(64), c.inkt))),
    onderregel(c, 700, 36, { marginTop: c.p(30) }),
  );
}

/** Een scherp teken met de naam eronder. */
function tChevron(c: Ctx): ReactElement {
  return kolom(c, chevron(c.p(330), c.inkt), naamOnder(c, 760, 50, { marginTop: c.p(52) }));
}

/** Een grote ster met een kleine erbij, boven het woord. */
function tSter(c: Ctx): ReactElement {
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 680, 150);
  return kolom(c, laag(c, 300, 230, op(c, 30, 10, ster(c.p(220), c.inkt)), op(c, 222, 0, ster(c.p(74), c.inkt))), tekst(c, t, maat, c.l, { marginTop: c.p(26) }), onderregel(c, 700, 36, { marginTop: c.p(24) }));
}

/** Eén letter met een kroon. */
function tKroon(c: Ctx): ReactElement {
  const t = [...c.letters][0] ?? "?";
  const maat = 380;
  return kolom(c, kroon(c.p(150), c.inkt), tekst(c, t, maat, { ...c.l, spatie: 0 }, { marginTop: c.p(c.l.font === LETTER.gotisch ? -8 : 2) }), naamOnder(c, 720, 40, { marginTop: c.p(34) }));
}

/** Een rond zegel met het woord op een rechte band. */
function tZegel(c: Ctx): ReactElement {
  const d = 580;
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, d * 0.86, 96);
  const klein = c.onder && aantal(c.onder) <= 16 ? hoofd(c.onder) : "";
  const kleinMaat = klein ? passend(c, klein, c.sub, d * 0.5, 26) : 0;
  const kleinB = klein ? breedte(c, klein, kleinMaat, c.sub) : 0;
  const w = breedte(c, t, maat, c.l);
  return kolom(
    c,
    laag(
      c,
      d,
      d,
      op(c, 0, 0, zegelring(c.p(d), c.inkt)),
      op(c, d / 2 - 45, d * 0.15, vak({ width: c.p(90), height: c.p(90), alignItems: "center", justifyContent: "center" }, (c.eigen ? teken(c.tekens[0] ?? "", c.p(84), c.inkt) : null) ?? ster(c.p(76), c.inkt))),
      op(c, (d - w) / 2, d / 2 - maat * 0.52, tekst(c, t, maat, c.l)),
      klein
        ? op(c, (d - kleinB) / 2, d * 0.72, tekst(c, klein, kleinMaat, c.sub))
        : op(c, d / 2 - 38, d * 0.72, vak({ alignItems: "center", gap: c.p(14) }, ...[0, 1, 2].map((n) => vak({ width: c.p(n === 1 ? 16 : 10), height: c.p(n === 1 ? 16 : 10), borderRadius: c.p(20), background: c.inkt })))),
    ),
    klein ? null : onderregel(c, 760, 34, { marginTop: c.p(26) }),
  );
}

/** De letters in een schild. */
function tSchild(c: Ctx): ReactElement {
  const t = hoofd(c.letters);
  const b = 300;
  const maat = passend(c, t, c.l, b * 0.56, 190);
  const w = breedte(c, t, maat, c.l);
  return kolom(c, laag(c, b, b * 1.2, op(c, 0, 0, schild(c.p(b), c.inkt, 5)), op(c, (b - w) / 2, b * 0.57 - maat * 0.52, tekst(c, t, maat, c.l))), naamOnder(c, 760, 40, { marginTop: c.p(34) }));
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
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 820, 160);
  const w = Math.max(360, breedte(c, t, maat, c.l));
  const lijn = (b: number) => vak({ width: c.p(b), height: Math.max(1, c.p(5)), background: c.inkt, flexShrink: 0 });
  return kolom(c, vak({ alignItems: "center", gap: c.p(20) }, lijn((w - 100) / 2), ster(c.p(60), c.inkt), lijn((w - 100) / 2)), tekst(c, t, maat, c.l, { marginTop: c.p(maat * 0.2), marginBottom: c.p(maat * 0.2) }), lijn(w), onderregel(c, w, 36, { marginTop: c.p(30) }));
}

/** De letters in een lauwerkrans. */
function tLauwer(c: Ctx): ReactElement {
  const t = hoofd(c.letters);
  const d = 430;
  const maat = passend(c, t, c.l, d * 0.42, 190);
  const w = breedte(c, t, maat, c.l);
  return kolom(c, laag(c, d, d, op(c, 0, 0, lauwer(c.p(d), c.inkt)), op(c, (d - w) / 2, d * 0.5 - maat * 0.52, tekst(c, t, maat, { ...c.l, scheef: 0 }))), naamOnder(c, 760, 40, { marginTop: c.p(10) }));
}

/** Een bliksemschicht naast het woord. */
function tBliksem(c: Ctx): ReactElement {
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 620, 170);
  return kolom(
    c,
    vak({ alignItems: "center", gap: c.p(34) }, (c.eigen ? teken(c.tekens[1] ?? c.tekens[0] ?? "", c.p(Math.max(190, maat * 1.35)), c.inkt) : null) ?? bliksem(c.p(Math.max(210, maat * 1.5)), c.inkt), vak({ flexDirection: "column", alignItems: "flex-start" }, tekst(c, t, maat, c.l), onderregel(c, Math.max(460, breedte(c, t, maat, c.l)), 32, { marginTop: c.p(22), paddingLeft: 0 }))),
  );
}

/** De naam in twee regels, met een veeg eronder. */
function tStapel(c: Ctx): ReactElement {
  const bron = aantal(c.i.naam) <= 24 ? c.i.naam : c.merk;
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

/** Het teken bij de soort bedrijf, boven het woord. */
function tTeken(c: Ctx): ReactElement {
  const t = inLetter(c.merk, c.l);
  const maat = passend(c, t, c.l, 720, 130);
  return kolom(c, teken(c.tekens[0] ?? "", c.p(270), c.inkt) ?? ster(c.p(220), c.inkt), tekst(c, t, maat, c.l, { marginTop: c.p(40) }), onderregel(c, 700, 34, { marginTop: c.p(24) }));
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
  zegel: tZegel,
  schild: tSchild,
  vleugels: tVleugels,
  breed: tBreed,
  lauwer: tLauwer,
  bliksem: tBliksem,
  stapel: tStapel,
  cirkel: tCirkel,
  teken: tTeken,
  embleem: tEmbleem,
};

const KLEIN = new Set(["de", "het", "een", "van", "der", "den", "en", "in", "op", "voor", "bij", "te", "ter", "'t", "&", "+", "-"]);

/** Het woord in het beeldmerk: een korte naam helemaal, een lange als afkorting van hooguit drie letters. */
export function merkwoord(naam: string): string {
  if (aantal(naam) <= 12) return naam;
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
 */
export function logoBoom2(nr: LogoNr, invoer: LogoInvoer, ondergrond: Ondergrond, breedteUit: number, metWatermerk: boolean, meet: Meter): { boom: ReactElement; breedte: number; hoogte: number } {
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
  const l = TYPE[invoer.sfeer];
  const merk = merkwoord(invoer.naam);
  const keuze = kiesTekens(invoer);
  const c: Ctx = { i: invoer, p, inkt, meet, l, sub: ONDER[MET_SCHREEF.includes(invoer.sfeer) ? "schreef" : "recht"], merk, letters: initialen(invoer.naam), onder: merk === invoer.naam ? (invoer.slogan ?? "") : invoer.naam, tekens: keuze.tekens, eigen: keuze.eigen };
  let beeld: ReactElement;
  if (vierkant) {
    const t = hoofd(c.letters);
    const maat = passend(c, t, l, 620, aantal(t) > 1 ? 470 : 600);
    beeld = vak({ width: p(ICOON), height: p(ICOON), alignItems: "center", justifyContent: "center" }, tekst(c, t, maat, { ...l, spatie: 0 }));
  } else {
    const sjabloon = sjablonenVan(invoer)[nr - 1] ?? "breed";
    beeld = SJABLOON[sjabloon](c);
  }
  const boom = vak({ position: "relative", width: p(basisB), height: p(basisH), ...(achtergrond ? { background: achtergrond } : {}) }, beeld, metWatermerk ? watermerk(basisB, basisH, p, 62) : null);
  return { boom, breedte: breedteUit, hoogte: Math.round((breedteUit * basisH) / basisB) };
}
