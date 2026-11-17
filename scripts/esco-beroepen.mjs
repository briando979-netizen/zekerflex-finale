#!/usr/bin/env node
// Zoekt bij ESCO (de beroepenlijst van de EU, gratis en zonder sleutel) voor elke vaste functie uit lib/shifts/catalogus.ts
// het beroep op, met de naam in de talen van de werker-app, en schrijft lib/shifts/esco-beroepen.ts. Draai dit opnieuw als
// er functies bijkomen:
//   node scripts/esco-beroepen.mjs
// Elke koppeling wordt met de hand nagelezen: ZOEK geeft een betere zoekterm, NIET slaat een functie over waarvoor ESCO
// geen passend beroep heeft (een verkeerd beroep is erger dan geen).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const API = "https://ec.europa.eu/esco/api";
const TALEN = ["en", "pl", "ro", "uk"];
// zonder versie geeft de dienst een oudere lijst zonder Oekraïens (gemeten 16 nov 2026)
const VERSIE = "v1.2.0";

/** functie-key → zoekterm voor ESCO als het label zelf het verkeerde beroep geeft ("en:…" = zoeken in het Engels); nagelezen 16 nov */
const ZOEK = {
  vakkenvuller: "en:shelf filler",
  horeca: "kelner",
  afwas: "en:kitchen porter",
  kok: "en:cook",
  magazijn: "en:warehouse worker",
  inpakker: "en:hand packer",
  "chauffeur-c": "en:lorry driver",
  voedingsmiddelen: "en:food production operator",
  kwaliteit: "en:product quality inspector",
  housekeeping: "en:room attendant",
  oplevering: "en:building cleaner",
  festivalbar: "en:bartender",
  sampling: "en:promotions demonstrator",
  beurspromotor: "en:promotions demonstrator",
  "huishoudelijke-hulp": "en:domestic cleaner",
  onderwijsassistent: "en:teaching assistant",
  "data-entry": "en:data entry clerk",
  bouwplaats: "en:construction general labourer",
  schilder: "en:construction painter",
  wasstraat: "en:vehicle cleaner",
  bandenwissel: "en:tyre fitter",
  automonteur: "en:vehicle technician",
  oogst: "en:fruit and vegetable picker",
  bloemen: "en:florist",
};
/**
 * functie-keys zonder passend ESCO-beroep: te breed, of ESCO heeft alleen iets anders. Ook als de vertaling iets anders
 * belooft dan de klus (bezorger → "bestelbusbestuurder" terwijl het ook op de fiets kan; zorghulp → "verpleegkundige" in het
 * Roemeens, terwijl het niet-medisch werk is; klantenservice → telefonische verkoop; productie → "schoonmaker in een fabriek" in het Pools).
 */
const NIET = new Set([
  "inventarisatie", "runner", "catering", "verhuizer", "machine-operator", "steward", "straatwerver", "portier", "verkeersregelaar",
  "gastvrouw-zorg", "tso", "installatiemonteur", "allround", "bezorger", "productie", "kwaliteit", "zorghulp", "onderwijsassistent", "bloemen", "klantenservice",
  // eventcrew → "toneelmachinist" in het Pools en Roemeens (de klus is tenten en hekken bouwen); activiteitenbegeleider →
  // vakantie-animator bij ESCO (de klus is in de zorg)
  "eventcrew", "activiteitenbegeleider",
]);

const bron = readFileSync(path.join(process.cwd(), "lib/shifts/catalogus.ts"), "utf8");
const functies = [...bron.matchAll(/\bs\("(\w+)", "([\w-]+)", "([^"]+)"/g)].map((m) => ({ key: m[2], label: m[3] }));
if (functies.length < 50) throw new Error(`maar ${functies.length} functies gevonden in catalogus.ts`);

async function json(url) {
  for (let poging = 0; poging < 3; poging++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) return res.json();
    if (res.status < 500) throw new Error(`ESCO ${res.status} voor ${url}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`ESCO geeft steeds een fout voor ${url}`);
}

const uit = {};
for (const f of functies) {
  if (NIET.has(f.key)) continue;
  const term = ZOEK[f.key] ?? f.label;
  const [taal, tekst] = term.startsWith("en:") ? ["en", term.slice(3)] : ["nl", term];
  const zoek = await json(`${API}/search?text=${encodeURIComponent(tekst)}&language=${taal}&type=occupation&limit=1&full=false&selectedVersion=${VERSIE}`);
  const hit = zoek?._embedded?.results?.[0];
  if (!hit) {
    console.log(`${f.key.padEnd(22)} ${f.label.padEnd(30)} → (niets)`);
    continue;
  }
  const beroep = await json(`${API}/resource/occupation?uri=${encodeURIComponent(hit.uri)}&language=nl&selectedVersion=${VERSIE}`);
  const namen = beroep.preferredLabel ?? {};
  // alleen het nummer van het beroep; het volledige adres is http://data.europa.eu/esco/occupation/<id>
  const id = /\/occupation\/([0-9a-f-]{36})$/.exec(hit.uri)?.[1];
  if (!id) throw new Error(`onverwacht ESCO-adres voor ${f.key}: ${hit.uri}`);
  const rij = { id, nl: namen.nl ?? hit.title };
  for (const t of TALEN) if (typeof namen[t] === "string" && namen[t].trim()) rij[t] = namen[t].trim();
  uit[f.key] = rij;
  console.log(`${f.key.padEnd(22)} ${f.label.padEnd(30)} → ${rij.nl.padEnd(40)} | en: ${rij.en ?? "-"} | pl: ${rij.pl ?? "-"} | ro: ${rij.ro ?? "-"} | uk: ${rij.uk ?? "-"}`);
}

const regel = (r) => `{ ${Object.entries(r).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")} }`;
const regels = Object.entries(uit).map(([key, r]) => `  ${/^[a-z]+$/.test(key) ? key : JSON.stringify(key)}: ${regel(r)},`);
writeFileSync(
  path.join(process.cwd(), "lib/shifts/esco-beroepen.ts"),
  `// GEMAAKT door scripts/esco-beroepen.mjs op ${new Date().toISOString().slice(0, 10)} — niet met de hand aanpassen; pas ZOEK/NIET in het script aan.
// Bron: ESCO, de Europese beroepenlijst (https://esco.ec.europa.eu, gratis, hergebruik toegestaan met bronvermelding).
// Per vaste functie (lib/shifts/catalogus.ts) het ESCO-beroep met de naam in de talen van de werker-app. Een taal die ESCO
// (nog) niet heeft, ontbreekt; dan toont de app niets extra.

export interface EscoBeroep {
  /** het nummer van het beroep bij ESCO (het adres is data.europa.eu/esco/occupation/<id>) */
  id: string;
  nl: string;
  en?: string;
  pl?: string;
  ro?: string;
  uk?: string;
}

export const ESCO_BEROEPEN: Record<string, EscoBeroep> = {
${regels.join("\n")}
};
`,
);
console.log(`lib/shifts/esco-beroepen.ts geschreven: ${Object.keys(uit).length} van ${functies.length} functies`);
