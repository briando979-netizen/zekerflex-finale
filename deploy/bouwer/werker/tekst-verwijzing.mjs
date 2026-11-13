// Puur hulpje van controle.mjs (zonder neveneffecten, dus ook te importeren in een test): welke tests noemen een gewijzigd bestand ALS TEKST?
// `vitest related` pakt alleen tests die een gewijzigd bestand importeren. tests/uitzend-v2.test.ts las lib/onboarding/werker-poort-server.ts
// met readFileSync en toContain en viel op main om (011353c7) zonder dat een controle het zag. Deze functie vult dat gat aan: elke test waarin
// het pad van een gewijzigd bestand voorkomt (met of zonder extensie) draait ook mee.
//
// Snel: elke testinhoud wordt eenmaal doorzocht op padachtige stukjes (een index van pad -> tests); daarna is elk gewijzigd bestand een opzoeking.
// Er wordt op hele paden gematcht, nooit op de bestandsnaam alleen (index.ts, route.ts), en een pad dat voor of achter geen letters, cijfers,
// streepjes of onderstrepingen mag hebben, telt niet als deel van een langer pad.

export const MAX_EXTRA = 40;
/** Een pad zonder extensie korter dan dit is te algemeen om op te zoeken. */
export const MIN_PAD_LENGTE = 10;
const ALGEMEEN = new Set(["index", "route", "page", "layout", "loading", "error", "not-found", "types", "utils", "config", "constants", "client", "server", "core", "store"]);
const EXTENSIE = /\.(?:tsx?|mjs|cjs|js|jsx|json|md|css|sh|py|yml|yaml)$/i;

const zonderExtensie = (p) => p.replace(EXTENSIE, "");

/** Maakt van een gevonden stukje tekst een pad dat in de repo kan staan: zonder "@/", "./" of "../" ervoor en zonder leestekens erachter. */
export function normaliseer(stuk) {
  return stuk
    .replace(/^(?:@\/|(?:\.{1,2}\/)+)/, "")
    .replace(/^\/+/, "")
    .replace(/[.,;:'"`)\]}]+$/, "");
}

/** Is dit pad te algemeen om op te zoeken? (te kort, of een algemene bestandsnaam bijna zonder map) */
export function teAlgemeen(pad) {
  const kaal = zonderExtensie(pad);
  if (kaal.length < MIN_PAD_LENGTE) return true;
  const delen = kaal.split("/");
  return delen.length < 3 && ALGEMEEN.has(delen[delen.length - 1] ?? "");
}

// Een padachtig stukje: tekens, met minstens één "/" erin, of een los bestand met een extensie ("middleware.ts").
const PAD_STUK = /[\w@.()[\]-]+(?:\/[\w@.()[\]-]+)+|[\w-]+\.(?:tsx?|mjs|cjs|js|jsx|json|md|sh|py)\b/g;

/**
 * Bouwt de index: elk padachtig stuk in een testinhoud (met en zonder extensie) wijst naar die test.
 * @param {{ pad: string; inhoud: string }[]} testen
 * @returns {Map<string, Set<string>>}
 */
export function bouwIndex(testen) {
  const index = new Map();
  for (const t of testen) {
    for (const m of t.inhoud.matchAll(PAD_STUK)) {
      const pad = normaliseer(m[0]);
      if (!pad) continue;
      for (const sleutel of new Set([pad, zonderExtensie(pad)])) {
        let verzameling = index.get(sleutel);
        if (!verzameling) index.set(sleutel, (verzameling = new Set()));
        verzameling.add(t.pad);
      }
    }
  }
  return index;
}

/**
 * Welke tests (naast `vitest related`) draaien mee omdat ze een gewijzigd bestand als tekst noemen?
 * @param {string[]} gewijzigd  paden uit git (met "/", relatief aan de repo)
 * @param {{ pad: string; inhoud: string }[]} testen  alle tests/*.test.ts met hun inhoud
 * @param {{ max?: number }} [opties]
 * @returns {{ tests: string[]; gevonden: number; afgekapt: boolean; redenen: Record<string, string[]> }}
 *   tests = wat er draait (leeg als er meer dan `max` zijn: dan eerst alleen de bewakers); gevonden = het echte aantal; redenen = per test welk pad hem meetrok.
 */
export function vindTekstVerwijzingen(gewijzigd, testen, opties = {}) {
  const max = opties.max ?? MAX_EXTRA;
  const index = bouwIndex(testen);
  const alGewijzigd = new Set(gewijzigd);
  const gevonden = new Map();
  for (const pad of new Set(gewijzigd)) {
    if (teAlgemeen(pad)) continue;
    for (const sleutel of new Set([pad, zonderExtensie(pad)])) {
      for (const test of index.get(sleutel) ?? []) {
        // een test die zichzelf noemt, of die zelf gewijzigd is (vitest related draait hem al), is geen extra
        if (test === pad || alGewijzigd.has(test)) continue;
        let lijst = gevonden.get(test);
        if (!lijst) gevonden.set(test, (lijst = []));
        if (!lijst.includes(pad)) lijst.push(pad);
      }
    }
  }
  const alle = [...gevonden.keys()].sort();
  const redenen = Object.fromEntries(alle.map((t) => [t, gevonden.get(t) ?? []]));
  if (alle.length > max) return { tests: [], gevonden: alle.length, afgekapt: true, redenen };
  return { tests: alle, gevonden: alle.length, afgekapt: false, redenen };
}