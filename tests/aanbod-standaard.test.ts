import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { standaardVragen } from "@/lib/marketing/aanbod-vragen";
import { AANBOD, aanbodDoorsturen, aanbodVan, eigenPaginas } from "@/lib/marketing/aanbod";

// De gewone opmaak van een aanbodpagina, rijker gemaakt (15 nov 2026, eigenaar: "die pagina's moeten indruk wekken; deze
// is karig"): alles uit het item zelf, geen verzonnen klanten, cijfers of reviews. /aanbod/rijschool stuurt door naar de
// uitgebreide rijschoolpagina, en een /aanbod/<slug> van een item met een eigen pagina komt nooit op een 404 uit.

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de standaardopmaak", () => {
  it("de vragen volgen uit het item: prijs, voor wie, hoe je begint, één login", () => {
    const horeca = AANBOD.find((a) => a.slug === "horeca");
    if (!horeca) throw new Error("geen horeca");
    const v = standaardVragen(horeca);
    expect(v.map((x) => x.vraag)).toEqual(["Wat kost horecasoftware?", "Voor wie is het?", "Hoe begin ik?", "Werkt het samen met de rest van ZekerFlex?"]);
    expect(v[0]?.antwoord).toBe("Abonnement per module. Een account aanmaken is gratis.");
    expect(v[2]?.antwoord).toContain(horeca.start.label);
    const opAanvraag = AANBOD.find((a) => !a.prijs && a.status === "beschikbaar");
    if (opAanvraag) expect(standaardVragen(opAanvraag)[0]?.antwoord).toMatch(/^Dat hangt af van wat je nodig hebt/);
  });

  it("geen verzonnen klanten, cijfers of reviews; één h1 en elke sectie een kopje", () => {
    const opmaak = lees("components/marketing/aanbod/AanbodStandaard.tsx")
      .split("\n")
      .filter((r) => !/^\s*(\/\/|\{\/\*)/.test(r))
      .join("\n");
    expect(opmaak).not.toMatch(/review|sterren|klanten gingen|tevreden klanten|\d+\s?%/i);
    expect(opmaak.match(/<h1/g)).toHaveLength(1);
    for (const m of opmaak.matchAll(/aria-labelledby="([^"]+)"/g)) expect(opmaak).toContain(`id="${m[1]}"`);
  });

  it("de pagina gebruikt de standaardopmaak, en geeft de vragen ook aan Google", () => {
    const route = lees("app/(marketing)/aanbod/[slug]/page.tsx");
    expect(route).toContain("<AanbodStandaard a={a} pijler={pijler} />");
    // de redactionele opmaak (lib/marketing/aanbod-redactioneel.ts) levert zijn eigen vragen
    expect(route).toContain("const faq = eigenOntwerp ? EFACTUUR_FAQ : redactioneel ? redactioneel.vragen.items : uitgebreid ? [] : standaardVragen(a);");
  });
});

describe("doorsturen", () => {
  it("/aanbod/rijschool gaat naar de rijschoolpagina (die sinds 22 nov 2026 doorstuurt); de voettekst linkt er niet meer naar", () => {
    expect(AANBOD.find((a) => a.slug === "rijschool")?.pagina).toBe("/rijschool-software");
    expect(lees("lib/ontwerp/menu.ts")).not.toContain('"/rijschool-software"');
    // 15 nov: dit gaf live een 404, want aanbodVan() kent rijschool niet (eigen pagina) en notFound() kwam eerst
    expect(aanbodDoorsturen("rijschool")).toBe("/rijschool-software");
    expect(aanbodVan("rijschool")).toBeUndefined();
    expect(aanbodDoorsturen("horeca")).toBeUndefined();
    expect(aanbodDoorsturen("bestaat-niet")).toBeUndefined();
    const route = lees("app/(marketing)/aanbod/[slug]/page.tsx");
    const doorsturen = route.indexOf("if (naar) permanentRedirect(naar);");
    const nietGevonden = route.indexOf("if (!a) notFound();");
    expect(doorsturen).toBeGreaterThan(0);
    // de doorverwijzing staat vóór notFound(), en in de pagina zelf (niet in generateMetadata)
    expect(doorsturen).toBeLessThan(nietGevonden);
    expect(route.indexOf("export default async function AanbodItemPagina")).toBeLessThan(doorsturen);
    // elk item met een eigen pagina stuurt door
    for (const x of AANBOD.filter((y) => y.pagina)) expect(aanbodDoorsturen(x.slug), x.slug).toBe(x.pagina);
  });

  it("elke /aanbod/<slug> bestaat: eigen pagina's sturen door, de rest krijgt een pagina", () => {
    expect(lees("app/(marketing)/aanbod/[slug]/page.tsx")).toContain("return [...eigenPaginas(), ...AANBOD.filter((a) => a.pagina)].map((a) => ({ slug: a.slug }));");
    const slugs = [...eigenPaginas(), ...AANBOD.filter((a) => a.pagina)].map((a) => a.slug).sort();
    expect(slugs).toEqual(AANBOD.map((a) => a.slug).sort());
    expect(eigenPaginas().some((a) => a.slug === "rijschool")).toBe(false);
  });
});
