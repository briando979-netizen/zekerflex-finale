import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import { leesLetterMaten, maakMeter, type LetterMaten, type Meter } from "@/lib/advertentie/letter-maat";
import { LETTER, ontwerpBoom, type OntwerpGegevens } from "@/lib/advertentie/ontwerp";
import { tekensUitTekst } from "@/lib/logo/tekens/trefwoorden";
import { FORMATEN, kleurHex, type Advertentie, type BeeldBesluit, type OntwerpNr } from "@/lib/advertentie/regels";

// ---------------------------------------------------------------------------
// Een ontwerp als PNG (next/og, nodejs-runtime). satori leest geen woff2, dus de
// lettertypes staan als TTF in public/fonts/advertentie (bron en licentie in de
// README daar). Die map gaat met `COPY /app/public` de Docker-image in en wordt
// hier één keer per proces gelezen (globalThis: Next bundelt routes apart).
// De eerste zeven zijn de basisletters (huisstijl + Anton) en dekken elk teken dat
// de invoerreiniging doorlaat. De vier daarna zijn sierletters voor logo's en
// advertenties; mist zo'n letter een teken (een zeldzaam accent), dan tekent
// satori het met een basisletter, nooit met een lettertype van buiten.
// ---------------------------------------------------------------------------

interface Lettertype {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 800 | 900;
  style: "normal" | "italic";
}

export const BASISLETTERS = [
  "BricolageGrotesque96pt-Bold.ttf",
  "BricolageGrotesque96pt-ExtraBold.ttf",
  "InstrumentSans-Regular.ttf",
  "InstrumentSans-SemiBold.ttf",
  "InstrumentSerif-Regular.ttf",
  "InstrumentSerif-Italic.ttf",
  "Anton-Regular.ttf",
] as const;
export const SIERLETTERS = ["Kanit-BlackItalic.ttf", "RussoOne-Regular.ttf", "PirataOne-Regular.ttf", "Marcellus-Regular.ttf"] as const;

const LIJST: (Omit<Lettertype, "data"> & { bestand: string })[] = [
  { name: LETTER.kop, bestand: "BricolageGrotesque96pt-Bold.ttf", weight: 700, style: "normal" },
  { name: LETTER.kop, bestand: "BricolageGrotesque96pt-ExtraBold.ttf", weight: 800, style: "normal" },
  { name: LETTER.tekst, bestand: "InstrumentSans-Regular.ttf", weight: 400, style: "normal" },
  { name: LETTER.tekst, bestand: "InstrumentSans-SemiBold.ttf", weight: 600, style: "normal" },
  { name: LETTER.serif, bestand: "InstrumentSerif-Regular.ttf", weight: 400, style: "normal" },
  { name: LETTER.serif, bestand: "InstrumentSerif-Italic.ttf", weight: 400, style: "italic" },
  { name: LETTER.smal, bestand: "Anton-Regular.ttf", weight: 400, style: "normal" },
  { name: LETTER.sport, bestand: "Kanit-BlackItalic.ttf", weight: 900, style: "italic" },
  { name: LETTER.techno, bestand: "RussoOne-Regular.ttf", weight: 400, style: "normal" },
  { name: LETTER.gotisch, bestand: "PirataOne-Regular.ttf", weight: 400, style: "normal" },
  { name: LETTER.luxe, bestand: "Marcellus-Regular.ttf", weight: 400, style: "normal" },
];

/** Welke stijl van een familie de meter gebruikt (de zwaarste rechte; de logo's en koppen gebruiken die). */
const METER_BESTAND: Record<string, string> = {
  [LETTER.kop]: "BricolageGrotesque96pt-ExtraBold.ttf",
  [LETTER.tekst]: "InstrumentSans-SemiBold.ttf",
  [LETTER.serif]: "InstrumentSerif-Regular.ttf",
  [LETTER.smal]: "Anton-Regular.ttf",
  [LETTER.sport]: "Kanit-BlackItalic.ttf",
  [LETTER.techno]: "RussoOne-Regular.ttf",
  [LETTER.gotisch]: "PirataOne-Regular.ttf",
  [LETTER.luxe]: "Marcellus-Regular.ttf",
};

interface Geladen {
  fonts: Lettertype[];
  meter: Meter;
}

const g = globalThis as typeof globalThis & { __zfAdvertentieLetters2?: Promise<Geladen> };

function laad(map = join(process.cwd(), "public", "fonts", "advertentie")): Promise<Geladen> {
  g.__zfAdvertentieLetters2 ??= (async () => {
    const fonts = await Promise.all(LIJST.map(async ({ bestand, ...rest }) => ({ ...rest, bestand, data: await readFile(join(map, bestand)) })));
    const maten: Record<string, LetterMaten> = {};
    for (const [familie, bestand] of Object.entries(METER_BESTAND)) {
      const f = fonts.find((x) => x.bestand === bestand);
      if (f) maten[familie] = leesLetterMaten(f.data);
    }
    return { fonts: fonts.map(({ bestand: _bestand, ...f }) => f), meter: maakMeter(maten) };
  })().catch((e: unknown) => {
    // een mislukte poging niet onthouden: de volgende aanvraag probeert het opnieuw
    delete g.__zfAdvertentieLetters2;
    throw e;
  });
  return g.__zfAdvertentieLetters2;
}

export const lettertypes = async (): Promise<Lettertype[]> => (await laad()).fonts;
/** De meter voor de breedte van tekst (lib/advertentie/letter-maat.ts), uit dezelfde bestanden. */
export const letterMeter = async (): Promise<Meter> => (await laad()).meter;

/** Wat het ontwerp nodig heeft uit een bewaarde advertentie. */
export function gegevensVan(ad: Pick<Advertentie, "invoer" | "tekst">): OntwerpGegevens {
  return {
    bedrijf: ad.invoer.bedrijf,
    kop: ad.tekst.kop,
    onderregel: ad.tekst.onderregel,
    knop: ad.tekst.knop,
    plaats: ad.invoer.plaats,
    contact: ad.invoer.contact,
    kleur: kleurHex(ad.invoer.kleur),
    teken: tekensUitTekst(ad.invoer.bedrijf, ad.invoer.aanbod)[0],
  };
}

/** Een boom van satori als PNG, met de lettertypes hierboven (ook voor de logo maker, lib/logo). */
export async function maakPng(boom: ReactElement, breedte: number, hoogte: number): Promise<ArrayBuffer> {
  const fonts = await lettertypes();
  return new ImageResponse(boom, { width: breedte, height: hoogte, fonts }).arrayBuffer();
}

/** De PNG van één ontwerp, precies zoals het besluit (lib/advertentie/regels.ts beeldBesluit) zegt. */
export async function maakBeeld(gegevens: OntwerpGegevens, ontwerp: OntwerpNr, besluit: BeeldBesluit): Promise<ArrayBuffer> {
  const hoogte = Math.round((besluit.breedte * FORMATEN[besluit.formaat].hoogte) / FORMATEN[besluit.formaat].breedte);
  return maakPng(ontwerpBoom(ontwerp, gegevens, besluit.formaat, besluit.breedte, besluit.watermerk), besluit.breedte, hoogte);
}
