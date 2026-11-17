#!/usr/bin/env node
// Haalt bij CBS StatLine (open data, gratis) het aantal bedrijfsvestigingen per gemeente en bedrijfstak op voor de steden
// van de stadspagina's, en schrijft lib/seo-cbs.ts. De pagina's zijn statisch; draai dit eens per jaar (CBS ververst in april).
//   node scripts/cbs-vestigingen.mjs
// Tabel 81575NED "Vestigingen van bedrijven; bedrijfstak, gemeente" (stand op 1 januari).

import { writeFileSync } from "node:fs";
import path from "node:path";

const BASIS = "https://opendata.cbs.nl/ODataApi/odata/81575NED";

// stad-slug (lib/seo-cities.ts) → CBS-gemeentecode en de naam van de gemeente
const GEMEENTEN = {
  amsterdam: ["GM0363", "Amsterdam"],
  rotterdam: ["GM0599", "Rotterdam"],
  "den-haag": ["GM0518", "Den Haag", "'s-Gravenhage"],
  utrecht: ["GM0344", "Utrecht"],
  eindhoven: ["GM0772", "Eindhoven"],
  groningen: ["GM0014", "Groningen"],
  tilburg: ["GM0855", "Tilburg"],
  almere: ["GM0034", "Almere"],
  breda: ["GM0758", "Breda"],
  nijmegen: ["GM0268", "Nijmegen"],
  apeldoorn: ["GM0200", "Apeldoorn"],
  haarlem: ["GM0392", "Haarlem"],
  arnhem: ["GM0202", "Arnhem"],
  enschede: ["GM0153", "Enschede"],
  amersfoort: ["GM0307", "Amersfoort"],
  zaanstad: ["GM0479", "Zaanstad"],
  "den-bosch": ["GM0796", "'s-Hertogenbosch"],
  zwolle: ["GM0193", "Zwolle"],
  leiden: ["GM0546", "Leiden"],
  veendam: ["GM0047", "Veendam"],
  hoogezand: ["GM1952", "Midden-Groningen"],
  winschoten: ["GM1895", "Oldambt"],
  stadskanaal: ["GM0037", "Stadskanaal"],
  assen: ["GM0106", "Assen"],
  maastricht: ["GM0935", "Maastricht"],
};

// bedrijfstak (SBI 2008, sectie) → veld
const TAKKEN = { T001081: "totaal", 389100: "horeca", 383100: "vervoer", 354200: "handel", 428100: "cultuur" };

async function json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`CBS ${res.status} voor ${url}`);
  return res.json();
}

const perioden = (await json(`${BASIS}/Perioden?$format=json`)).value.map((p) => p.Key.trim()).sort();
const regios = new Map((await json(`${BASIS}/RegioS?$format=json`)).value.map((r) => [r.Key.trim(), r]));
// CBS vult sleutels aan met spaties ("389100  "); een filter moet de sleutel precies zo noemen
const takSleutels = new Map((await json(`${BASIS}/BedrijfstakkenBranchesSBI2008?$format=json`)).value.map((t) => [t.Key.trim(), t.Key]));

const uit = {};
let peil = null;
for (const [slug, [code, naam, cbsNaam = naam]] of Object.entries(GEMEENTEN)) {
  const regio = regios.get(code);
  if (!regio) throw new Error(`gemeentecode ${code} (${slug}) staat niet in de tabel`);
  // een verkeerde code zou stil een andere gemeente geven: de naam bij CBS moet kloppen
  if (regio.Title.split(" (")[0] !== cbsNaam) throw new Error(`gemeentecode ${code} is bij CBS "${regio.Title}", niet ${cbsNaam}`);
  const sleutel = regio.Key;
  const filter = `RegioS eq '${sleutel}' and (${Object.keys(TAKKEN).map((k) => `BedrijfstakkenBranchesSBI2008 eq '${takSleutels.get(k) ?? k}'`).join(" or ")})`;
  const rijen = (await json(`${BASIS}/TypedDataSet?$format=json&$filter=${encodeURIComponent(filter)}`)).value;
  // de nieuwste periode met een waarde voor het totaal
  const jaar = [...perioden].reverse().find((p) => rijen.some((r) => r.Perioden.trim() === p && r.BedrijfstakkenBranchesSBI2008.trim() === "T001081" && typeof r.Vestigingen_1 === "number"));
  if (!jaar) throw new Error(`geen cijfers voor ${slug}`);
  peil = peil && peil > jaar ? peil : jaar;
  const rij = { gemeente: naam, code };
  for (const [tak, veld] of Object.entries(TAKKEN)) {
    const r = rijen.find((x) => x.Perioden.trim() === jaar && x.BedrijfstakkenBranchesSBI2008.trim() === tak);
    if (typeof r?.Vestigingen_1 !== "number") throw new Error(`${slug}: geen waarde voor ${tak} in ${jaar}`);
    rij[veld] = r.Vestigingen_1;
  }
  rij.jaar = Number(jaar.slice(0, 4));
  uit[slug] = rij;
  console.log(slug.padEnd(12), jaar, rij.totaal, rij.horeca);
}

const regel = (r) => `{ ${Object.entries(r).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")} }`;
const regels = Object.entries(uit).map(([slug, r]) => `  ${/^[a-z]+$/.test(slug) ? slug : JSON.stringify(slug)}: ${regel(r)},`);
const bestand = `// GEMAAKT door scripts/cbs-vestigingen.mjs op ${new Date().toISOString().slice(0, 10)} — niet met de hand aanpassen; draai het script opnieuw.
// Bron: CBS StatLine, tabel 81575NED "Vestigingen van bedrijven; bedrijfstak, gemeente" (open data). Stand op 1 januari van "jaar".

export interface CbsVestigingen {
  gemeente: string;
  code: string;
  /** alle bedrijfsvestigingen (A-U) */
  totaal: number;
  /** I Horeca */
  horeca: number;
  /** H Vervoer en opslag */
  vervoer: number;
  /** G Handel (winkels, groothandel en autohandel) */
  handel: number;
  /** R Cultuur, sport en recreatie */
  cultuur: number;
  jaar: number;
}

export const CBS_BRON = "https://opendata.cbs.nl/statline/#/CBS/nl/dataset/81575NED/table";

export const CBS_VESTIGINGEN: Record<string, CbsVestigingen> = {
${regels.join("\n")}
};
`;
writeFileSync(path.join(process.cwd(), "lib/seo-cbs.ts"), bestand);
console.log(`lib/seo-cbs.ts geschreven: ${Object.keys(uit).length} steden, nieuwste periode ${peil}`);
