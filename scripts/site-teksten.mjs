// De zinnen van de openbare site (28 nov 2026, lib/i18n/site.ts). Zoekt in de code van de site elke tx("…") en vt("…") met
// een vaste tekst en geeft de unieke zinnen (sleutel = de zin, witruimte samengevoegd). De talen-motor gebruikt dit met
// --domein site. Los draaien: node scripts/site-teksten.mjs [--lijst]
//
// Alleen een gewone tekst tussen "…" of '…' telt: tx(`…${x}`) kan niet (gebruik een plaatshouder: tx("Nog {n} klussen", { n })),
// en tx(iets) met een variabele is een zin die elders met vt("…") gemarkeerd moet zijn.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE_MAPPEN = ["app/(marketing)", "components/marketing", "lib/marketing", "lib/ontwerp/menu.ts"];
const AANROEP = /\b(tx|vt)\(\s*(["'])((?:\\.|(?!\2)[^\\\n])*)\2\s*[,)]/gu;
const SJABLOON = /\b(tx|vt)\(\s*`/gu;

const sleutel = (s) => s.replace(/\s+/gu, " ").trim();
const heeftLetter = (s) => /\p{L}/u.test(s.replace(/\{\w+\}/gu, ""));

function bestanden(map, uit = []) {
  if (/\.(ts|tsx)$/.test(map)) return [...uit, map];
  let items = [];
  try {
    items = readdirSync(map, { withFileTypes: true });
  } catch {
    return uit;
  }
  for (const e of items) {
    const p = join(map, e.name);
    if (e.isDirectory()) bestanden(p, uit);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) uit.push(p);
  }
  return uit;
}

/** Een JavaScript-tekst tussen aanhalingstekens omzetten naar de echte tekst (via JSON, met de enkele aanhaling eerst omgezet). */
function ontsnap(inhoud, aanhaling) {
  const json = aanhaling === '"' ? inhoud : inhoud.split("\\'").join("'").split('"').join('\\"');
  return JSON.parse(`"${json}"`);
}

/** De unieke zinnen, gesorteerd, plus waarschuwingen (een sjabloon met ${…}). */
export function siteZinnen(root) {
  const zinnen = new Map(); // sleutel -> eerste bestand
  const waarschuwingen = [];
  for (const map of SITE_MAPPEN) {
    for (const f of bestanden(join(root, map))) {
      const s = readFileSync(f, "utf8");
      const rel = relative(root, f).split(sep).join("/");
      for (const m of s.matchAll(AANROEP)) {
        let tekst;
        try {
          tekst = ontsnap(m[3], m[2]);
        } catch {
          waarschuwingen.push(`${rel}: kon ${m[0].slice(0, 60)} niet lezen`);
          continue;
        }
        const k = sleutel(tekst);
        if (k && heeftLetter(k) && !zinnen.has(k)) zinnen.set(k, rel);
      }
      for (const m of s.matchAll(SJABLOON)) waarschuwingen.push(`${rel}: ${m[1]}(sjabloon) gebruik een plaatshouder`);
    }
  }
  return { zinnen: [...zinnen.keys()].sort(), herkomst: zinnen, waarschuwingen };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const { zinnen, herkomst, waarschuwingen } = siteZinnen(root);
  const tekens = zinnen.reduce((s, z) => s + z.length, 0);
  console.log(`Zinnen op de site: ${zinnen.length} (${tekens} tekens)`);
  const perBestand = new Map();
  for (const f of herkomst.values()) perBestand.set(f, (perBestand.get(f) ?? 0) + 1);
  for (const [f, n] of [...perBestand].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
  for (const w of waarschuwingen) console.log(`LET OP: ${w}`);
  if (process.argv.includes("--lijst")) for (const z of zinnen) console.log(`- ${z}`);
}
