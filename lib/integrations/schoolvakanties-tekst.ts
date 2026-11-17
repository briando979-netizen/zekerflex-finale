import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import type { KomendeVakantie, VakantieRegio } from "@/lib/integrations/schoolvakanties";

// De tekst van het seintje "de schoolvakantie komt eraan" op het startscherm van de werkgever (app/werkgever/page.tsx), in
// de taal van het scherm. Puur. De woorden staan in lib/i18n/dictionaries.ts (werkgeverStart.vakantie…), elk als losse
// tekst: de taalbewaker van de werkgeversschermen vergelijkt Nederlands en Engels sleutel voor sleutel.

type Teksten = Dict["werkgeverStart"];

const NAAM: Record<string, keyof Teksten> = {
  Herfstvakantie: "vakantieHerfst",
  Kerstvakantie: "vakantieKerst",
  Voorjaarsvakantie: "vakantieVoorjaar",
  Meivakantie: "vakantieMei",
  Zomervakantie: "vakantieZomer",
};

const REGIO: Record<VakantieRegio, keyof Teksten> = { noord: "vakantieRegioNoord", midden: "vakantieRegioMidden", zuid: "vakantieRegioZuid", heel: "vakantieRegioHeel" };

export interface VakantieTekst {
  kop: string;
  regios: { regio: string; periode: string }[];
}

export function vakantieTekst(v: KomendeVakantie, t: Teksten): VakantieTekst {
  const maanden = t.vakantieMaanden.split(",");
  // "19 dec": de dag zoals de Rijksoverheid hem geeft ("2026-12-19"), zonder een tijdzone te raken
  const dag = (d: string) => `${Number(d.slice(8, 10))} ${maanden[Number(d.slice(5, 7)) - 1] ?? ""}`.trim();
  const sleutel = Object.hasOwn(NAAM, v.naam) ? NAAM[v.naam] : undefined;
  const naam = sleutel ? t[sleutel] : v.naam.toLowerCase();
  return {
    kop: fmt(v.dagen === 0 ? t.vakantieVandaag : v.dagen === 1 ? t.vakantieMorgen : t.vakantieOver, { naam, dagen: v.dagen }),
    regios: v.regios.map((r) => ({ regio: t[REGIO[r.regio]], periode: fmt(t.vakantieTot, { van: dag(r.van), tot: dag(r.tot) }) })),
  };
}
