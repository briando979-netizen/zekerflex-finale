import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LETTER, ontwerpBoom, type OntwerpGegevens } from "@/lib/advertentie/ontwerp";
import { FORMATEN, kleurHex, type Advertentie, type BeeldBesluit, type OntwerpNr } from "@/lib/advertentie/regels";

// ---------------------------------------------------------------------------
// Een ontwerp als PNG (next/og, nodejs-runtime). satori leest geen woff2, dus de
// lettertypes van de huisstijl staan als TTF in public/fonts/advertentie (bron en
// licentie in de README daar). Die map gaat met `COPY /app/public` de Docker-image
// in en wordt hier één keer per proces gelezen (globalThis: Next bundelt routes apart).
// ---------------------------------------------------------------------------

interface Lettertype {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 800;
  style: "normal" | "italic";
}

const LIJST: (Omit<Lettertype, "data"> & { bestand: string })[] = [
  { name: LETTER.kop, bestand: "BricolageGrotesque96pt-Bold.ttf", weight: 700, style: "normal" },
  { name: LETTER.kop, bestand: "BricolageGrotesque96pt-ExtraBold.ttf", weight: 800, style: "normal" },
  { name: LETTER.tekst, bestand: "InstrumentSans-Regular.ttf", weight: 400, style: "normal" },
  { name: LETTER.tekst, bestand: "InstrumentSans-SemiBold.ttf", weight: 600, style: "normal" },
  { name: LETTER.serif, bestand: "InstrumentSerif-Regular.ttf", weight: 400, style: "normal" },
  { name: LETTER.serif, bestand: "InstrumentSerif-Italic.ttf", weight: 400, style: "italic" },
];

const g = globalThis as typeof globalThis & { __zfAdvertentieLetters?: Promise<Lettertype[]> };

export function lettertypes(map = join(process.cwd(), "public", "fonts", "advertentie")): Promise<Lettertype[]> {
  g.__zfAdvertentieLetters ??= Promise.all(LIJST.map(async ({ bestand, ...rest }) => ({ ...rest, data: await readFile(join(map, bestand)) }))).catch((e: unknown) => {
    // een mislukte poging niet onthouden: de volgende aanvraag probeert het opnieuw
    delete g.__zfAdvertentieLetters;
    throw e;
  });
  return g.__zfAdvertentieLetters;
}

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
  };
}

/** De PNG van één ontwerp, precies zoals het besluit (lib/advertentie/regels.ts beeldBesluit) zegt. */
export async function maakBeeld(gegevens: OntwerpGegevens, ontwerp: OntwerpNr, besluit: BeeldBesluit): Promise<ArrayBuffer> {
  const fonts = await lettertypes();
  const hoogte = Math.round((besluit.breedte * FORMATEN[besluit.formaat].hoogte) / FORMATEN[besluit.formaat].breedte);
  const beeld = new ImageResponse(ontwerpBoom(ontwerp, gegevens, besluit.formaat, besluit.breedte, besluit.watermerk), { width: besluit.breedte, height: hoogte, fonts });
  return beeld.arrayBuffer();
}
