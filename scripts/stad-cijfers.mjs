// ---------------------------------------------------------------------------
// Bakt de CBS-cijfers per stad voor de stadspagina's (branche × stad en /bijbaan/<stad>) in
// lib/seo-stad-cijfers.generated.ts. Op runtime wordt niets opgehaald: de pagina's lezen alleen
// dat bestand. Bron: CBS StatLine, open data (CC BY 4.0), zonder sleutel (lib/gratis/diensten.ts: cbs).
//
// Draaien als het CBS nieuwe cijfers heeft (vestigingen ±4 maanden na 1 januari, bevolking in de zomer):
//   node scripts/stad-cijfers.mjs
//
// Per cijfer staan de tabel en het peiljaar erbij. Het script kiest per tabel het nieuwste jaar waarin
// alle steden een waarde hebben, en stopt met een fout als een stad of tabel ontbreekt (dan blijft het
// oude bestand staan). De steden volgen lib/seo-cities.ts (tests/seo-stad-cijfers.test.ts bewaakt dat).
// Een plaats die deel is van een grotere gemeente krijgt de cijfers van die gemeente; de pagina noemt
// dan de gemeente (Hoogezand-Sappemeer: Midden-Groningen, Winschoten: Oldambt).
// ---------------------------------------------------------------------------
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ODATA = "https://opendata.cbs.nl/ODataApi/odata";
const CATALOGUS = "https://opendata.cbs.nl/ODataCatalog/Tables";

/** slug uit lib/seo-cities.ts → de naam van de gemeente bij het CBS */
const STEDEN = [
  ["amsterdam", "Amsterdam"],
  ["rotterdam", "Rotterdam"],
  ["den-haag", "'s-Gravenhage"],
  ["utrecht", "Utrecht"],
  ["eindhoven", "Eindhoven"],
  ["groningen", "Groningen"],
  ["tilburg", "Tilburg"],
  ["almere", "Almere"],
  ["breda", "Breda"],
  ["nijmegen", "Nijmegen"],
  ["apeldoorn", "Apeldoorn"],
  ["haarlem", "Haarlem"],
  ["arnhem", "Arnhem"],
  ["enschede", "Enschede"],
  ["amersfoort", "Amersfoort"],
  ["zaanstad", "Zaanstad"],
  ["den-bosch", "'s-Hertogenbosch"],
  ["zwolle", "Zwolle"],
  ["leiden", "Leiden"],
  ["veendam", "Veendam"],
  ["hoogezand", "Midden-Groningen"],
  ["winschoten", "Oldambt"],
  ["stadskanaal", "Stadskanaal"],
  ["assen", "Assen"],
  ["maastricht", "Maastricht"],
];

const BEVOLKING = "03759ned"; // Bevolking op 1 januari en gemiddeld; geslacht, leeftijd en regio
const VESTIGINGEN = "81575NED"; // Vestigingen van bedrijven; bedrijfstak, gemeente
const VESTIGINGEN_REGIO = "81578NED"; // Vestigingen van bedrijven; bedrijfstak, regio (ook COROP, fijnere bedrijfstakken)

/** Bedrijfstakken per gemeente (SBI 2008, secties). */
const SBI_GEMEENTE = {
  totaal: "T001081", // A-U Alle economische activiteiten
  handel: "354200", // G Handel
  vervoer: "383100", // H Vervoer en opslag
  horeca: "389100", // I Horeca
  zakelijk: "410200", // N Verhuur en overige zakelijke diensten
  cultuur: "428100", // R Cultuur, sport en recreatie
};
/** Fijnere bedrijfstakken; die heeft het CBS alleen per regio (COROP-gebied), niet per gemeente. */
const SBI_REGIO = {
  detailhandel: "371600", // 47 Detailhandel (niet in auto's)
  opslag: "386800", // 52 Opslag, dienstverlening voor vervoer
  koeriers: "388400", // 53 Post en koeriers
  schoonmaak: "415300", // 812 Schoonmaakbedrijven
  reclame: "408100", // 73 Reclamewezen en marktonderzoek
};
/** 18 tot en met 24 jaar (Leeftijd in 03759ned: één code per levensjaar) */
const JONG = ["18 jaar", "19 jaar", "20 jaar", "21 jaar", "22 jaar", "23 jaar", "24 jaar"];

const wacht = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** JSON van het CBS, met herhalingen: StatLine geeft soms één keer een 5xx (lib/nieuws/ronde-db.ts). */
async function haal(url) {
  let fout = null;
  for (let poging = 1; poging <= 4; poging++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.ok) return await r.json();
      fout = new Error(`CBS gaf ${r.status} op ${url}`);
      if (r.status < 500) break;
    } catch (e) {
      fout = e;
    }
    await wacht(1500 * poging);
  }
  throw fout ?? new Error(`CBS onbereikbaar: ${url}`);
}

const waarden = async (url) => (await haal(url)).value ?? [];
const sleutel = (v) => String(v).trim();

/** Een dimensie (lijst met Key/Title). */
async function dimensie(tabel, naam) {
  return waarden(`${ODATA}/${tabel}/${naam}?$format=json`);
}

/** De ruwe sleutel (met de spaties die het CBS erachter zet) bij een korte sleutel of titel. */
function ruw(lijst, wat, veld = "Key") {
  const hit = lijst.find((d) => sleutel(d[veld]) === wat);
  if (!hit) throw new Error(`niet gevonden in de dimensie: ${wat}`);
  return hit.Key;
}

const of = (veld, sleutels) => `(${sleutels.map((s) => `${veld} eq '${s}'`).join(" or ")})`;

async function rijen(tabel, filter, select) {
  const q = `$format=json${filter ? `&$filter=${encodeURIComponent(filter)}` : ""}${select ? `&$select=${select}` : ""}`;
  return waarden(`${ODATA}/${tabel}/TypedDataSet?${q}`);
}

/** De perioden van een tabel, nieuwste eerst, met het jaar en of het cijfer voorlopig is. */
async function perioden(tabel) {
  return (await dimensie(tabel, "Perioden"))
    .filter((p) => /^\d{4}JJ00$/.test(sleutel(p.Key)))
    .map((p) => ({ key: p.Key, jaar: Number(sleutel(p.Key).slice(0, 4)), voorlopig: /voorlopig/i.test(String(p.Status ?? "")) }))
    .sort((a, b) => b.jaar - a.jaar);
}

/** De indeling van gemeenten in een jaar (Gebieden in Nederland <jaar>): code, COROP-gebied en stedelijkheid. */
async function gebieden(jaar) {
  const titel = `Gebieden in Nederland ${jaar}`;
  const tabellen = await waarden(`${CATALOGUS}?$format=json&$filter=${encodeURIComponent(`Title eq '${titel}'`)}&$select=Identifier,Title`);
  const id = tabellen[0]?.Identifier;
  if (!id) throw new Error(`geen tabel "${titel}" in de catalogus van het CBS`);
  const props = await dimensie(id, "DataProperties");
  // de kolommen heten per jaar anders (Code_10, Naam_11, …): zoek ze op via de groep waar ze onder staan
  const groep = (titelGroep) => {
    const g = props.find((p) => p.Type === "TopicGroup" && sleutel(p.Title) === titelGroep);
    if (!g) throw new Error(`${id}: geen groep "${titelGroep}"`);
    return props.filter((p) => p.ParentID === g.ID && p.Type === "Topic");
  };
  const veld = (lijst, titelVeld) => {
    const p = lijst.find((x) => sleutel(x.Title) === titelVeld);
    if (!p) throw new Error(`${id}: geen veld "${titelVeld}"`);
    return p.Key;
  };
  const gemeente = groep("Codes en namen van gemeenten");
  const corop = groep("COROP-gebieden");
  const stedelijk = groep("Stedelijkheid");
  const kolommen = {
    naam: veld(gemeente, "Naam"),
    coropCode: veld(corop, "Code"),
    coropNaam: veld(corop, "Naam"),
    stedelijkheid: veld(stedelijk, "Omschrijving"),
  };
  const lijst = await rijen(id, null, ["RegioS", ...Object.values(kolommen)].join(","));
  const perNaam = new Map(lijst.map((r) => [sleutel(r[kolommen.naam]), r]));
  const uit = {};
  for (const [slug, naam] of STEDEN) {
    const r = perNaam.get(naam);
    if (!r) throw new Error(`${id}: gemeente "${naam}" (${slug}) niet gevonden`);
    uit[slug] = {
      gemeente: naam,
      gemeenteCode: sleutel(r.RegioS),
      corop: sleutel(r[kolommen.coropNaam]),
      coropCode: sleutel(r[kolommen.coropCode]),
      stedelijkheid: sleutel(r[kolommen.stedelijkheid]).toLowerCase(),
    };
  }
  return { tabel: id, jaar, steden: uit };
}

/**
 * Per periode (nieuwste eerst) de rijen ophalen tot er één is waarin elke gevraagde regio een waarde heeft.
 * `vraag(periodeKey)` geeft rijen; `lees(rijen)` geeft per regio de waarden of gooit als er iets ontbreekt.
 * Met `vorige` ook de periode daarvoor (voor "een jaar eerder"), anders null.
 */
async function nieuwsteVolledig(tabel, vraag, lees, vorige = false) {
  const lijst = (await perioden(tabel)).slice(0, 4);
  let laatsteFout = null;
  for (const [i, p] of lijst.entries()) {
    try {
      const nu = { ...lees(await vraag(p.key)), jaar: p.jaar, voorlopig: p.voorlopig };
      const v = lijst[i + 1];
      const daarvoor = vorige && v ? { ...lees(await vraag(v.key)), jaar: v.jaar, voorlopig: v.voorlopig } : null;
      return { ...nu, daarvoor };
    } catch (e) {
      laatsteFout = e;
      console.warn(`${tabel} ${p.jaar}: nog niet compleet (${e.message}), een jaar eerder`);
    }
  }
  throw laatsteFout ?? new Error(`${tabel}: geen perioden`);
}

const getal = (v, wat) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`geen waarde voor ${wat}`);
  return v;
};

async function main() {
  // 1. De vestigingen per gemeente bepalen het jaar van de indeling (de gemeentecodes van dat jaar).
  const vPerioden = await perioden(VESTIGINGEN);
  const vJaar = vPerioden[0]?.jaar;
  if (!vJaar) throw new Error(`${VESTIGINGEN}: geen perioden`);
  const indeling = await gebieden(vJaar);
  const codes = STEDEN.map(([slug]) => indeling.steden[slug].gemeenteCode);

  const vRegio = await dimensie(VESTIGINGEN, "RegioS");
  const vSbi = await dimensie(VESTIGINGEN, "BedrijfstakkenBranchesSBI2008");
  const vRegioRuw = [...codes, "NL01"].map((c) => ruw(vRegio, c));
  const vSbiRuw = Object.values(SBI_GEMEENTE).map((c) => ruw(vSbi, c));
  const vest = await nieuwsteVolledig(
    VESTIGINGEN,
    (periode) => rijen(VESTIGINGEN, `Perioden eq '${periode}' and ${of("RegioS", vRegioRuw)} and ${of("BedrijfstakkenBranchesSBI2008", vSbiRuw)}`),
    (lijst) => {
      const per = {};
      for (const code of [...codes, "NL01"]) {
        per[code] = {};
        for (const [naam, sbi] of Object.entries(SBI_GEMEENTE)) {
          const r = lijst.find((x) => sleutel(x.RegioS) === code && sleutel(x.BedrijfstakkenBranchesSBI2008) === sbi);
          per[code][naam] = getal(r?.Vestigingen_1, `${code} ${naam}`);
        }
      }
      return { per };
    },
    true,
  );
  if (!vest.daarvoor) throw new Error(`${VESTIGINGEN}: geen jaar vóór ${vest.jaar}`);

  // 2. De bevolking op 1 januari: alle leeftijden en 18 t/m 24 jaar.
  const bRegio = await dimensie(BEVOLKING, "RegioS");
  const bLeeftijd = await dimensie(BEVOLKING, "Leeftijd");
  const bGeslacht = await dimensie(BEVOLKING, "Geslacht");
  const bStaat = await dimensie(BEVOLKING, "BurgerlijkeStaat");
  const totaalLeeftijd = ruw(bLeeftijd, "Totaal", "Title");
  const jongRuw = JONG.map((t) => ruw(bLeeftijd, t, "Title"));
  const bRegioRuw = [...codes, "NL01"].map((c) => ruw(bRegio, c));
  const bev = await nieuwsteVolledig(
    BEVOLKING,
    (periode) =>
      rijen(
        BEVOLKING,
        `Perioden eq '${periode}' and Geslacht eq '${ruw(bGeslacht, "Totaal mannen en vrouwen", "Title")}' and BurgerlijkeStaat eq '${ruw(bStaat, "Totaal burgerlijke staat", "Title")}' and ${of("RegioS", bRegioRuw)} and ${of("Leeftijd", [totaalLeeftijd, ...jongRuw])}`,
        "RegioS,Leeftijd,BevolkingOp1Januari_1",
      ),
    (lijst) => {
      const per = {};
      for (const code of [...codes, "NL01"]) {
        const hier = lijst.filter((x) => sleutel(x.RegioS) === code);
        const totaal = hier.find((x) => x.Leeftijd === totaalLeeftijd);
        const jong = jongRuw.map((l) => getal(hier.find((x) => x.Leeftijd === l)?.BevolkingOp1Januari_1, `${code} ${l}`));
        per[code] = { inwoners: getal(totaal?.BevolkingOp1Januari_1, `${code} inwoners`), jongeren: jong.reduce((a, b) => a + b, 0) };
      }
      return { per };
    },
  );

  // 3. Fijnere bedrijfstakken per COROP-gebied.
  const coropCodes = [...new Set(STEDEN.map(([slug]) => indeling.steden[slug].coropCode))];
  const rRegio = await dimensie(VESTIGINGEN_REGIO, "RegioS");
  const rSbi = await dimensie(VESTIGINGEN_REGIO, "BedrijfstakkenBranchesSBI2008");
  const rRegioRuw = [...coropCodes, "NL01"].map((c) => ruw(rRegio, c));
  const rSbiRuw = Object.values(SBI_REGIO).map((c) => ruw(rSbi, c));
  const regio = await nieuwsteVolledig(
    VESTIGINGEN_REGIO,
    (periode) => rijen(VESTIGINGEN_REGIO, `Perioden eq '${periode}' and ${of("RegioS", rRegioRuw)} and ${of("BedrijfstakkenBranchesSBI2008", rSbiRuw)}`),
    (lijst) => {
      const per = {};
      for (const code of [...coropCodes, "NL01"]) {
        per[code] = {};
        for (const [naam, sbi] of Object.entries(SBI_REGIO)) {
          const r = lijst.find((x) => sleutel(x.RegioS) === code && sleutel(x.BedrijfstakkenBranchesSBI2008) === sbi);
          per[code][naam] = getal(r?.Vestigingen_1, `${code} ${naam}`);
        }
      }
      return { per };
    },
  );

  const cijfer = (n, tabel, bron) => ({ n, tabel, jaar: bron.jaar, voorlopig: bron.voorlopig });
  const vestVan = (code, bron = vest) => Object.fromEntries(Object.keys(SBI_GEMEENTE).map((k) => [k, cijfer(bron.per[code][k], VESTIGINGEN, bron)]));
  const regioVan = (code) => Object.fromEntries(Object.keys(SBI_REGIO).map((k) => [k, cijfer(regio.per[code][k], VESTIGINGEN_REGIO, regio)]));

  const steden = {};
  for (const [slug] of STEDEN) {
    const g = indeling.steden[slug];
    steden[slug] = {
      ...g,
      inwoners: cijfer(bev.per[g.gemeenteCode].inwoners, BEVOLKING, bev),
      jongeren: cijfer(bev.per[g.gemeenteCode].jongeren, BEVOLKING, bev),
      vestigingen: vestVan(g.gemeenteCode),
      vestigingenVorig: vestVan(g.gemeenteCode, vest.daarvoor),
      regio: regioVan(g.coropCode),
    };
  }
  const nederland = {
    inwoners: cijfer(bev.per.NL01.inwoners, BEVOLKING, bev),
    jongeren: cijfer(bev.per.NL01.jongeren, BEVOLKING, bev),
    vestigingen: vestVan("NL01"),
    vestigingenVorig: vestVan("NL01", vest.daarvoor),
    regio: regioVan("NL01"),
  };
  const tabellen = {
    [BEVOLKING]: { titel: "Bevolking op 1 januari en gemiddeld; geslacht, leeftijd en regio", jaar: bev.jaar, voorlopig: bev.voorlopig },
    [VESTIGINGEN]: { titel: "Vestigingen van bedrijven; bedrijfstak, gemeente", jaar: vest.jaar, voorlopig: vest.voorlopig },
    [VESTIGINGEN_REGIO]: { titel: "Vestigingen van bedrijven; bedrijfstak, regio", jaar: regio.jaar, voorlopig: regio.voorlopig },
    [indeling.tabel]: { titel: `Gebieden in Nederland ${indeling.jaar}`, jaar: indeling.jaar, voorlopig: false },
  };

  writeFileSync(join(process.cwd(), "lib", "seo-stad-cijfers.generated.ts"), bestand({ tabellen, nederland, steden, indeling: indeling.tabel }), "utf8");
  console.log(`lib/seo-stad-cijfers.generated.ts geschreven: ${STEDEN.length} steden (bevolking ${bev.jaar}, vestigingen ${vest.jaar}, regio ${regio.jaar})`);
}

/** Een waarde als TypeScript, met sleutels zonder aanhalingstekens waar dat kan en een cijfer op één regel. */
function ts(v, inspring = "") {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  const sleutels = Object.keys(v);
  const naam = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
  if ("n" in v && "tabel" in v) return `{ ${sleutels.map((k) => `${naam(k)}: ${JSON.stringify(v[k])}`).join(", ")} }`;
  const binnen = `${inspring}  `;
  return `{\n${sleutels.map((k) => `${binnen}${naam(k)}: ${ts(v[k], binnen)},`).join("\n")}\n${inspring}}`;
}

function bestand({ tabellen, nederland, steden, indeling }) {
  return `// AUTO-GEGENEREERD door scripts/stad-cijfers.mjs — niet met de hand bewerken.
// Opnieuw draaien als het CBS nieuwe cijfers heeft: node scripts/stad-cijfers.mjs
//
// Feitelijke cijfers per stad voor de stadspagina's (lib/seo-stad.ts), uit CBS StatLine (open data, CC BY 4.0).
// Per cijfer: de waarde (n), de CBS-tabel en het peiljaar (stand op 1 januari van dat jaar). "voorlopig" volgt de
// status van die periode bij het CBS. De gemeente en het COROP-gebied komen uit "Gebieden in Nederland" (${indeling}).

export interface Cijfer {
  /** de waarde */
  n: number;
  /** de tabel bij het CBS (StatLine) */
  tabel: string;
  /** peiljaar: de stand op 1 januari van dit jaar */
  jaar: number;
  /** het CBS noemt het cijfer van dit jaar nog voorlopig */
  voorlopig: boolean;
}

/** Vestigingen per gemeente, naar bedrijfstak (SBI 2008, secties). */
export interface GemeenteVestigingen {
  /** alle bedrijfstakken (A-U) */
  totaal: Cijfer;
  /** G Handel (groot- en detailhandel, autohandel) */
  handel: Cijfer;
  /** H Vervoer en opslag */
  vervoer: Cijfer;
  /** I Horeca */
  horeca: Cijfer;
  /** N Verhuur en overige zakelijke diensten (o.a. schoonmaak, uitzendbureaus, beveiliging) */
  zakelijk: Cijfer;
  /** R Cultuur, sport en recreatie */
  cultuur: Cijfer;
}

/** Vestigingen per COROP-gebied, fijnere bedrijfstakken (die heeft het CBS niet per gemeente). */
export interface RegioVestigingen {
  /** 47 Detailhandel (niet in auto's) */
  detailhandel: Cijfer;
  /** 52 Opslag, dienstverlening voor vervoer */
  opslag: Cijfer;
  /** 53 Post en koeriers */
  koeriers: Cijfer;
  /** 812 Schoonmaakbedrijven */
  schoonmaak: Cijfer;
  /** 73 Reclamewezen en marktonderzoek */
  reclame: Cijfer;
}

export interface StadCijfers {
  /** de gemeente bij het CBS (kan groter zijn dan de plaats: Hoogezand-Sappemeer valt onder Midden-Groningen) */
  gemeente: string;
  gemeenteCode: string;
  /** het COROP-gebied waar de gemeente in ligt */
  corop: string;
  coropCode: string;
  /** stedelijkheid van de gemeente volgens het CBS ("zeer sterk stedelijk" … "niet stedelijk") */
  stedelijkheid: string;
  /** inwoners van de gemeente */
  inwoners: Cijfer;
  /** inwoners van 18 tot en met 24 jaar */
  jongeren: Cijfer;
  vestigingen: GemeenteVestigingen;
  /** dezelfde vestigingen een jaar eerder */
  vestigingenVorig: GemeenteVestigingen;
  /** cijfers van het COROP-gebied */
  regio: RegioVestigingen;
}

export interface CbsTabel {
  titel: string;
  jaar: number;
  voorlopig: boolean;
}

export const CBS_TABELLEN: Record<string, CbsTabel> = ${ts(tabellen)};

/** Heel Nederland, om een stad mee te vergelijken. */
export const NEDERLAND_CIJFERS: Pick<StadCijfers, "inwoners" | "jongeren" | "vestigingen" | "vestigingenVorig" | "regio"> = ${ts(nederland)};

export const STAD_CIJFERS: Record<string, StadCijfers> = ${ts(steden)};
`;
}

main().catch((e) => {
  console.error(`stad-cijfers: ${e?.message ?? e} (het oude bestand blijft staan)`);
  process.exitCode = 1;
});
