// Talen-motor (poortwachter 86, 13 nov 2026): maakt per taal een gegenereerd bestand uit het Nederlandse werker-woordenboek.
//
//   node scripts/talen-motor.mjs --droog --taal tr,bg,es          alleen tellen wat er vertaald zou worden; geen verzoek, geen bestand
//   node scripts/talen-motor.mjs --taal tr [--schrijf]            vertalen via het eigen model (LLM-adapter), steekproef, rapport
//
// Een script, geen onderdeel van de app. Vereist Node >= 22.6 (haalt TypeScript-types zelf weg). Bedoeld voor 's nachts op de
// eigen server, met LLM_BASE_URL naar de eigen Ollama (gemma3:4b): één verzoek tegelijk, alleen doorgaan met load < 3,
// wachten bij 3 t/m 6, stoppen bij load > 6 of een geheugenfout (OOM). Alleen UI-teksten gaan het model in, nooit persoonsgegevens.
// Zonder --schrijf wordt er niets bewaard. Een taal in MACHINE_LOCALES (lib/i18n/config.ts) zetten blijft een mensenstap:
// pas als het bestand er is en de steekproef (20 zinnen terugvertaald naar NL) klopt. Draai dit nooit tijdens een uitrol.
import { readdirSync, writeFileSync } from "node:fs";
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