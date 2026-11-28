import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AANBOD, aanbodHref } from "@/lib/marketing/aanbod";
import { pijlerIsFlexwerk } from "@/lib/marketing/flexwerk-only";

// Bewaker (28 nov 2026): een aanbod-item mag niet naar zijn eigen omleiding wijzen.
//
// Wat er misging: bij de opruiming van fase C (22 nov) kregen /aanbod/wifi-op-de-werkvloer,
// /aanbod/veilige-werkplek, /aanbod/portofoon-in-de-app, /aanbod/toegang-op-kenteken,
// /aanbod/sleutelkluis en /aanbod/badges-en-labels-printen een omleiding naar /bedrijven, en hun
// werkgeversschermen (/werkgever/netwerk, /werkgever/op-locatie) werden weggehaald — maar de items
// bleven in AANBOD staan. Gemeten op 28 nov: zes kaarten op /aanbod die de bezoeker naar /bedrijven
// kaatsten, met een knop "Aanzetten in je werkgeversomgeving" naar een scherm dat er niet meer is.
//
// tests/marketing-aanbod.test.ts keurt een omleiding juist góed (dat is terecht voor een `pagina` die
// naar een andere, bestaande pagina verhuisd is). Deze bewaker kijkt naar het andere geval: het doel
// van de kaart of de startknop staat in de omleidingslijst van next.config.mjs, en dan kom je dus
// nooit aan. Zo blijft /aanbod alleen wat ZekerFlex echt kan leveren.
//
// De bewaker kijkt alleen naar de pijlers die het publiek ziet (personeel en geld). De pijlers online
// en branche zijn met de vlag `publiek-alleen-flexwerk` uit het openbare zicht gehaald; gemeten op
// 28 nov stond geen van die items op de live /aanbod. Dáár staan nog dertien items met een dood doel
// (website, webshop, domeinnaam, website-check, advertentie op maat, logo maker, starters,
// review-check, Google-reviews, telefonie, zakelijke e-mail, horeca, rijschool). Die opruiming is
// fase C en wacht op een besluit van de eigenaar. De laatste test hieronder slaat daarom alarm zodra
// zo'n kapot item naar een zichtbare pijler verhuist: dan moet het eerst gerepareerd worden.

const ROOT = process.cwd();
const config = readFileSync(join(ROOT, "next.config.mjs"), "utf8");

/** De exacte paden uit de omleidingslijst in next.config.mjs, zonder de patronen met :parameters. */
function omgeleidePaden(): Set<string> {
  const paden = new Set<string>();
  // de regels in de vorm ["/van", "/naar"]
  for (const m of config.matchAll(/\["(\/[^"]*)",\s*"(\/[^"]*)"\]/g)) {
    const van = m[1] ?? "";
    if (van && !van.includes(":")) paden.add(van);
  }
  // en de losse regels { source: "/van", destination: "/naar", … }
  for (const m of config.matchAll(/source:\s*"(\/[^"]*)"/g)) {
    const van = m[1] ?? "";
    if (van && !van.includes(":") && !van.includes("*")) paden.add(van);
  }
  // de twee lijsten die hun pad opbouwen met een voorvoegsel: `/aanbod/${s}` en `/werkgever/${d}`
  for (const m of config.matchAll(/\.map\(\(s\) => \[`\/aanbod\/\$\{s\}`/g)) {
    void m; // het voorvoegsel is bekend; de sleutels staan in de lijst ervoor
  }
  for (const m of config.matchAll(/\.\.\.\[([^\]]*)\]\.map\(\(s\) => \[`\/aanbod\/\$\{s\}`/g)) {
    for (const s of (m[1] ?? "").matchAll(/"([^"]+)"/g)) paden.add(`/aanbod/${s[1]}`);
  }
  for (const m of config.matchAll(/\.\.\.\[([^\]]*)\]\.flatMap\(\(d\) => \[/g)) {
    for (const s of (m[1] ?? "").matchAll(/"([^"]+)"/g)) paden.add(`/werkgever/${s[1]}`);
  }
  return paden;
}

/** Het pad uit een href, zonder ?vraag en #anker. */
const padVan = (href: string) => (href.split(/[?#]/)[0] ?? "").replace(/\/$/, "") || "/";

describe("bewaker: geen aanbod-item dat naar zijn eigen omleiding wijst", () => {
  const omgeleid = omgeleidePaden();

  it("de omleidingslijst is gelezen (anders bewaakt deze test niets)", () => {
    // een vangnet: zou het patroon in next.config.mjs veranderen, dan valt deze test op
    expect(omgeleid.size).toBeGreaterThan(20);
    expect(omgeleid.has("/shop")).toBe(true);
    expect(omgeleid.has("/aanbod/portofoon-in-de-app")).toBe(true);
    expect(omgeleid.has("/werkgever/op-locatie")).toBe(true);
  });

  /** Alleen wat het publiek echt ziet: de flexwerk-pijlers (personeel, geld). */
  const zichtbaar = AANBOD.filter((a) => pijlerIsFlexwerk(a.pijler));

  it("de kaart van elk zichtbaar item komt aan (niet op een omleiding)", () => {
    const dood = zichtbaar.filter((a) => omgeleid.has(padVan(aanbodHref(a)))).map((a) => `${a.naam} → ${aanbodHref(a)}`);
    expect(dood, "deze kaarten op /aanbod kaatsen de bezoeker weg; haal het item weg of geef het een pagina die bestaat").toEqual([]);
  });

  it("de startknop van elk zichtbaar item komt aan", () => {
    const dood = zichtbaar.filter((a) => omgeleid.has(padVan(a.start.href))).map((a) => `${a.naam} → ${a.start.href}`);
    expect(dood, "deze startknoppen op /aanbod leiden naar een weggehaald scherm").toEqual([]);
  });

  it("ook de tweede knop (voorbeelden) van een zichtbaar item komt aan", () => {
    const dood = zichtbaar
      .filter((a) => a.voorbeelden && omgeleid.has(padVan(a.voorbeelden.href)))
      .map((a) => `${a.naam} → ${a.voorbeelden?.href}`);
    expect(dood).toEqual([]);
  });

  it("een item met een dood doel staat alleen in een pijler die publiek verborgen is", () => {
    // Zodra iemand zo'n item naar personeel of geld verplaatst, wordt het publiek zichtbaar en
    // moet het doel eerst gerepareerd worden. Deze test valt dan, met de naam erbij.
    const doodEnZichtbaar = AANBOD.filter(
      (a) =>
        pijlerIsFlexwerk(a.pijler) &&
        (omgeleid.has(padVan(aanbodHref(a))) || omgeleid.has(padVan(a.start.href)) || (a.voorbeelden ? omgeleid.has(padVan(a.voorbeelden.href)) : false)),
    ).map((a) => `${a.naam} (pijler ${a.pijler})`);
    expect(doodEnZichtbaar, "dit item wordt publiek getoond maar komt nergens aan").toEqual([]);
  });

  it("de zes netwerk- en op-locatiepakketten staan niet meer in het aanbod", () => {
    const slugs = AANBOD.map((a) => a.slug);
    for (const s of [
      "wifi-op-de-werkvloer",
      "veilige-werkplek",
      "portofoon-in-de-app",
      "toegang-op-kenteken",
      "sleutelkluis",
      "badges-en-labels-printen",
    ]) {
      expect(slugs, `${s}: de pagina stuurt door en het werkgeversscherm is weg`).not.toContain(s);
    }
  });

  it("llms.txt wijst niet naar /uitzendbureau, dat doorstuurt", () => {
    const src = readFileSync(join(ROOT, "app/llms.txt/route.ts"), "utf8");
    expect(src).not.toContain("/uitzendbureau");
    expect(src).toContain("/starten-als-uitzendkracht");
  });
});
