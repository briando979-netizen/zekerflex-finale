// Talen-motor (poortwachter 86, 13 nov 2026): maakt per taal een gegenereerd bestand uit het Nederlandse werker-woordenboek.
//
//   node scripts/talen-motor.mjs --droog --taal tr,bg,es          alleen tellen wat er vertaald zou worden; geen verzoek, geen bestand
//   node scripts/talen-motor.mjs --taal tr [--schrijf]            vertalen via het eigen model (LLM-adapter), steekproef, rapport
//
// Vertalen buiten het eigen model (28 nov 2026). Het eigen model (gemma3:4b) is te klein voor 15 talen van goede kwaliteit
// en mag alleen 's nachts; daarom kan de vertaling ook uit bestanden komen. Dezelfde controles en dezelfde steekproef:
//   node scripts/talen-motor.mjs --exporteer <map>                          de te vertalen teksten in stukken van 200 (sleutel -> NL)
//   (iemand vertaalt elk stuk naar <map>/<taal>/vertaling-NN.json, zelfde sleutels)
//   node scripts/talen-motor.mjs --bron-map <map> --taal de --trek         controleert, trekt de steekproef, schrijft
//        <map>/de/steekproef-vraag.json (alleen de vertaalde zinnen, nooit het Nederlands)
//   (iemand ANDERS, die het Nederlands niet gezien heeft, vertaalt die terug naar <map>/de/steekproef-terug.json)
//   node scripts/talen-motor.mjs --bron-map <map> --taal de [--schrijf]   steekproef beoordelen (woordvergelijking), bestand schrijven
// De trekking is per taal vast (zaad uit de taalcode), zodat stap 2 en 3 dezelfde 20 zinnen nemen.
//
// Een script, geen onderdeel van de app. Vereist Node >= 22.6 (haalt TypeScript-types zelf weg). Bedoeld voor 's nachts op de
// eigen server, met LLM_BASE_URL naar de eigen Ollama (gemma3:4b): één verzoek tegelijk, alleen doorgaan met load < 3,
// wachten bij 3 t/m 6, stoppen bij load > 6 of een geheugenfout (OOM). Alleen UI-teksten gaan het model in, nooit persoonsgegevens.
// Zonder --schrijf wordt er niets bewaard. Een taal in MACHINE_LOCALES (lib/i18n/config.ts) zetten blijft een mensenstap:
// pas als het bestand er is en de steekproef (20 zinnen terugvertaald naar NL) klopt. Draai dit nooit tijdens een uitrol.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

const hier = dirname(fileURLToPath(import.meta.url));
const root = join(hier, "..");
const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 6)) {
  console.error("Node 22.6 of nieuwer is nodig voor dit script.");
  process.exit(1);
}
register("./talen-motor-alias.mjs", import.meta.url);

const args = process.argv.slice(2);
const vlag = (n) => args.includes(`--${n}`);
const waarde = (n, std) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : std;
};
const talen = waarde("taal", "tr,bg,es").split(",").map((t) => t.trim()).filter(Boolean);
const droog = vlag("droog");
const schrijf = vlag("schrijf");
const model = waarde("model", process.env.TALEN_MODEL ?? "gemma3:4b");
const max = Number(waarde("max", "0")) || 0; // proefdraai op de eerste N teksten

const motor = await import("../lib/i18n/talen-motor.ts");
const { TAAL_META, MAX_LOAD_START, MAX_LOAD_STOP, STEEKPROEF_DREMPEL } = await import("../lib/i18n/config.ts");
const { FREELANCER_DICTS } = await import("../lib/i18n/freelancer.ts");

for (const t of talen) {
  if (!Object.hasOwn(TAAL_META, t) || !TAAL_META[t].machinaal) {
    console.error(`Onbekende of niet-machinale taal: ${t}`);
    process.exit(1);
  }
}

const alle = motor.bladeren(FREELANCER_DICTS.nl);
const juridisch = alle.filter((b) => motor.isJuridisch(b.pad, b.bron));
const teVertalen = alle.filter((b) => !motor.isJuridisch(b.pad, b.bron) && motor.moetVertaald(b.bron)).slice(0, max || undefined);
const batches = motor.maakBatches(teVertalen);
console.log(`Teksten in het NL-woordenboek: ${alle.length}`);
console.log(`Juridisch of identiteit (niet vertaald, blijft NL/EN): ${juridisch.length}`);
console.log(`Te vertalen: ${teVertalen.length} in ${batches.length} batches (${teVertalen.filter((b) => motor.plaatshouders(b.bron).length > 0).length} met plaatshouders)`);

if (droog) {
  for (const t of talen) console.log(`${t} (${TAAL_META[t].naam}, ${TAAL_META[t].dir}): ${batches.length} vertaalverzoeken + 2 voor de steekproef, model ${model}`);
  console.log("Droog: geen verzoek gedaan, geen bestand geschreven.");
  process.exit(0);
}

// --- vertalingen uit bestanden (zie de kop) ------------------------------------------------------------------------
const exportMap = waarde("exporteer", "");
const bronMap = waarde("bron-map", "");

if (exportMap) {
  mkdirSync(exportMap, { recursive: true });
  const items = teVertalen.map((b) => [motor.padSleutel(b.pad), b.bron]);
  const STUK = 200;
  let n = 0;
  for (let i = 0; i < items.length; i += STUK) {
    n++;
    const stuk = items.slice(i, i + STUK);
    writeFileSync(join(exportMap, `bron-${String(n).padStart(2, "0")}.json`), JSON.stringify(Object.fromEntries(stuk), null, 1) + "\n");
    // de handgemaakte Engelse tekst op dezelfde plek, als hulp bij de betekenis (de bron blijft het Nederlands)
    const engels = stuk.map(([k]) => {
      const b = teVertalen.find((x) => motor.padSleutel(x.pad) === k);
      let v = FREELANCER_DICTS.en;
      for (const d of b?.pad ?? []) v = v?.[d];
      return [k, typeof v === "string" ? v : ""];
    });
    writeFileSync(join(exportMap, `en-${String(n).padStart(2, "0")}.json`), JSON.stringify(Object.fromEntries(engels), null, 1) + "\n");
  }
  console.log(`Geexporteerd: ${items.length} teksten in ${n} stukken naar ${exportMap}`);
  process.exit(0);
}

/** Vaste trekking per taal: mulberry32 met een zaad uit de taalcode. */
function vastToeval(taal) {
  let h = 2166136261;
  for (const c of `${taal}-steekproef`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (bronMap) {
  const bronModel = args.includes("--model") ? model : "claude-sonnet-5-5";
  const trek = vlag("trek");
  for (const taal of talen) {
    console.log(`\n== ${taal} (${TAAL_META[taal].naam}), vertaling uit ${bronMap}/${taal} ==`);
    const map = join(bronMap, taal);
    const vertaald = {};
    for (const f of existsSync(map) ? readdirSync(map).filter((x) => /^vertaling-\d+\.json$/.test(x)).sort() : []) {
      Object.assign(vertaald, JSON.parse(readFileSync(join(map, f), "utf8")));
    }
    // dezelfde controle als vertaalBladeren: plaatshouders, merknaam, geen gelekte JSON, niet absurd lang
    const gelukt = new Map();
    const mislukt = [];
    for (const b of teVertalen) {
      const k = motor.padSleutel(b.pad);
      const v = vertaald[k];
      if (motor.vertalingOk(b.bron, v)) gelukt.set(k, v.trim());
      else mislukt.push(k);
    }
    console.log(`Vertaald en gecontroleerd: ${gelukt.size} van ${teVertalen.length}, afgekeurd of ontbrekend (valt terug op EN): ${mislukt.length}`);
    for (const k of mislukt.slice(0, 15)) console.log(`  afgekeurd of ontbreekt: ${k}`);
    const bron = new Map(teVertalen.map((b) => [motor.padSleutel(b.pad), b.bron]));
    // een taalcode voor datums en getallen (nl-NL -> de-DE) is geen zin: die hoort niet in de steekproef (28 nov 2026)
    const kandidaten = new Map([...gelukt].filter(([k]) => !/^[a-z]{2,3}-[A-Z]{2}$/u.test(bron.get(k) ?? "")));
    if (trek) {
      const sleutels = [...kandidaten.keys()].filter((k) => bron.has(k));
      const gekozen = motor.trekSteekproef(sleutels, undefined, vastToeval(taal));
      const vraag = Object.fromEntries(gekozen.map((k, i) => [String(i + 1), gelukt.get(k)]));
      writeFileSync(join(map, "steekproef-vraag.json"), JSON.stringify(vraag, null, 1) + "\n");
      console.log(`Steekproef getrokken: ${gekozen.length} zinnen in ${join(map, "steekproef-vraag.json")} (zonder Nederlands)`);
      continue;
    }
    const terugPad = join(map, "steekproef-terug.json");
    if (!existsSync(terugPad)) {
      console.log(`Geen ${terugPad}: eerst --trek en de blinde terugvertaling.`);
      continue;
    }
    const terug = JSON.parse(readFileSync(terugPad, "utf8"));
    // De beoordelaar (rechter), zoals de motor hem bedoelde: iemand die alleen de paren ziet (A = het Nederlandse origineel,
    // B = de blinde terugvertaling) en per paar zegt of ze hetzelfde betekenen. --paren schrijft die paren; zijn oordeel
    // staat daarna in steekproef-oordeel.json. Zonder oordeel beslist de woordvergelijking (lijktOpElkaar).
    const parenPad = join(map, "steekproef-paren.json");
    const oordeelPad = join(map, "steekproef-oordeel.json");
    let rechter;
    if (vlag("paren")) {
      rechter = async (paren) => {
        writeFileSync(parenPad, JSON.stringify(Object.fromEntries(paren.map((p, i) => [String(i + 1), { A: p.bron, B: p.terug }])), null, 1) + "\n");
        return paren.map(() => false);
      };
    } else if (existsSync(oordeelPad)) {
      const oordeel = JSON.parse(readFileSync(oordeelPad, "utf8"));
      rechter = async (paren) => paren.map((_, i) => oordeel[String(i + 1)] === true);
    }
    const s = await motor.steekproef({ bron, vertaald: kandidaten, doel: taal, terugvertaler: async () => terug, rechter, toeval: vastToeval(taal) });
    if (vlag("paren")) {
      console.log(`Paren voor de beoordelaar geschreven: ${parenPad}`);
      continue;
    }
    console.log(`Beoordeeld door: ${rechter ? "de beoordelaar (steekproef-oordeel.json)" : "de woordvergelijking"}`);
    console.log(`Steekproef: ${s.klopt} van ${s.gekozen} klopt (${s.percentage}%, drempel ${STEEKPROEF_DREMPEL}%) -> ${s.voldoende ? "voldoende" : "ONVOLDOENDE"}`);
    for (const a of s.afgekeurd) console.log(`  afgekeurd ${a.sleutel}: "${a.bron}" <- "${a.terug}"`);
    if (!schrijf) continue;
    if (!s.voldoende) {
      console.log("Niet geschreven: de steekproef klopt niet.");
      continue;
    }
    const meta = { taal, gemaakt: new Date().toISOString(), model: bronModel, bladeren: alle.length, vertaald: gelukt.size, steekproef: { gekozen: s.gekozen, klopt: s.klopt, percentage: s.percentage } };
    const dict = motor.bouwDeelsWoordenboek(FREELANCER_DICTS.nl, gelukt);
    writeFileSync(join(root, "lib/i18n/gen", `freelancer.${taal}.ts`), motor.renderGenBestand(meta, dict));
    const aanwezig = readdirSync(join(root, "lib/i18n/gen")).map((f) => /^freelancer\.(\w+)\.ts$/.exec(f)?.[1]).filter(Boolean);
    writeFileSync(join(root, "lib/i18n/gen/index.ts"), motor.renderGenIndex(aanwezig));
    console.log(`Geschreven: lib/i18n/gen/freelancer.${taal}.ts`);
  }
  process.exit(0);
}

const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

/** Voor elk verzoek: load < 3 doorgaan, 3 t/m 6 wachten (hoogstens 20 min), > 6 of te weinig geheugen stoppen. */
async function voorVerzoek() {
  for (let poging = 0; poging < 40; poging++) {
    const load = os.loadavg()[0] ?? 0;
    const besluit = motor.loadBesluit(load);
    if (besluit === "stop") throw new Error(`Gestopt: load ${load.toFixed(1)} is hoger dan ${MAX_LOAD_STOP}`);
    if (os.freemem() < 700 * 1024 * 1024) throw new Error("Gestopt: minder dan 700 MB vrij geheugen");
    if (besluit === "door") return;
    await slaap(30_000);
  }
  throw new Error(`Gestopt: de load bleef boven ${MAX_LOAD_START}`);
}

const { chatJson } = await import("../lib/ai/client.ts");
const vertaler = async (o) => {
  try {
    return await chatJson({
      messages: [{ role: "system", content: o.system }, { role: "user", content: o.user }],
      temperature: 0.1,
      maxTokens: 4000,
      model,
      purpose: "vertaling",
      retry: false,
      stilBijFout: true,
      timeoutMs: 240_000,
    });
  } catch (err) {
    if (motor.isOomFout(err)) throw new Error("Gestopt: het model meldt te weinig geheugen (OOM)");
    throw err;
  }
};
const rechter = async (paren) => {
  await voorVerzoek();
  const items = {};
  paren.forEach((p, i) => (items[String(i + 1)] = { A: p.bron, B: p.terug }));
  const a = await vertaler({
    system: 'For each numbered pair decide whether text B says the same thing as text A (wording may differ). Reply with ONE JSON object: {"1": true, "2": false, …}. No other text.',
    user: JSON.stringify(items),
  });
  return paren.map((_, i) => a[String(i + 1)] === true);
};

let gestopt = false;
for (const taal of talen) {
  console.log(`\n== ${taal} (${TAAL_META[taal].naam}) ==`);
  const uit = await motor.vertaalBladeren({
    bladeren: teVertalen,
    doel: taal,
    vertaler,
    voorVerzoek,
    voortgang: (k, t) => console.log(`  ${k}/${t}`),
  });
  console.log(`Vertaald en gecontroleerd: ${uit.gelukt.size}, mislukt (valt terug op EN): ${uit.mislukt.length}`);
  if (uit.gestopt) {
    console.log(`GESTOPT: ${uit.gestopt}`);
    gestopt = true;
    break;
  }
  const bron = new Map(teVertalen.map((b) => [motor.padSleutel(b.pad), b.bron]));
  let s;
  try {
    await voorVerzoek();
    s = await motor.steekproef({ bron, vertaald: uit.gelukt, doel: taal, terugvertaler: vertaler, rechter });
  } catch (err) {
    console.log(`GESTOPT bij de steekproef: ${err instanceof Error ? err.message : err}`);
    gestopt = true;
    break;
  }
  console.log(`Steekproef: ${s.klopt} van ${s.gekozen} klopt (${s.percentage}%, drempel ${STEEKPROEF_DREMPEL}%) -> ${s.voldoende ? "voldoende" : "ONVOLDOENDE"}`);
  for (const a of s.afgekeurd) console.log(`  afgekeurd ${a.sleutel}: "${a.bron}" <- "${a.terug}"`);
  if (!schrijf) continue;
  if (!s.voldoende) {
    console.log("Niet geschreven: de steekproef klopt niet.");
    continue;
  }
  const meta = { taal, gemaakt: new Date().toISOString(), model, bladeren: alle.length, vertaald: uit.gelukt.size, steekproef: { gekozen: s.gekozen, klopt: s.klopt, percentage: s.percentage } };
  const dict = motor.bouwDeelsWoordenboek(FREELANCER_DICTS.nl, uit.gelukt);
  writeFileSync(join(root, "lib/i18n/gen", `freelancer.${taal}.ts`), motor.renderGenBestand(meta, dict));
  const aanwezig = readdirSync(join(root, "lib/i18n/gen")).map((f) => /^freelancer\.(\w+)\.ts$/.exec(f)?.[1]).filter(Boolean);
  writeFileSync(join(root, "lib/i18n/gen/index.ts"), motor.renderGenIndex(aanwezig));
  console.log(`Geschreven: lib/i18n/gen/freelancer.${taal}.ts. Zet de taal zelf in MACHINE_LOCALES (lib/i18n/config.ts) na een blik op de steekproef.`);
}
process.exit(gestopt ? 2 : 0);