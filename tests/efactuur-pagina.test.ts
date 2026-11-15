import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EFACTUUR_FAQ, EFACTUUR_FUNCTIES, EFACTUUR_STAPPEN, EFACTUUR_ZIT_ERIN } from "@/lib/marketing/efactuur-pagina";
import { AANBOD, PIJLERS } from "@/lib/marketing/aanbod";

// /aanbod/e-facturatie als volledige softwarepagina (15 nov 2026, eigenaar: "dezelfde weergave als de factuurpagina van
// Jortt"), met onze eigen teksten en alleen wat nu echt kan: Peppol is er nog niet (geen toegangspunt), en een betaalverzoek
// of QR-betalen liep via ZekerFlex Bank (uit) of Stripe (dicht).

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");
/** wat een bezoeker leest: de inhoud en de pagina zonder het uitleg-commentaar (dat zegt juist wat er niet op staat) */
const alleTekst = () =>
  JSON.stringify({ EFACTUUR_FAQ, EFACTUUR_FUNCTIES, EFACTUUR_STAPPEN, EFACTUUR_ZIT_ERIN }) +
  lees("components/marketing/aanbod/EfactuurPagina.tsx")
    .split("\n")
    .filter((r) => !/^\s*(\/\/|\{\/\*)/.test(r))
    .join("\n");

describe("e-facturatie: alleen wat echt kan", () => {
  it("Peppol staat er als 'komt eraan', overal", () => {
    expect(EFACTUUR_FUNCTIES.find((f) => /Peppol/.test(f.titel))?.binnenkort).toBe(true);
    expect(EFACTUUR_ZIT_ERIN.find((r) => /Peppol/.test(r.wat))?.binnenkort).toBe(true);
    for (const f of EFACTUUR_FUNCTIES.filter((x) => !x.binnenkort)) expect(f.tekst, f.titel).not.toMatch(/Peppol-netwerk bezorgt|via Peppol verstuurd/i);
    const item = AANBOD.find((a) => a.slug === "e-facturatie");
    expect(item?.tekst).not.toMatch(/ontvang het via het Peppol-netwerk/);
    expect(item?.punten.join(" ")).toContain("Peppol-netwerk: komt eraan");
  });

  it("geen betaalverzoek, QR-betalen of bank (ZekerFlex Bank staat uit, Stripe is dicht)", () => {
    expect(alleTekst()).not.toMatch(/betaalverzoek|QR|ZekerFlex Bank|iDEAL/i);
    const geld = PIJLERS.find((p) => p.sleutel === "geld");
    expect(`${geld?.kort} ${geld?.intro}`).not.toMatch(/betaalverzoek|QR/i);
    const facturen = AANBOD.find((a) => a.slug === "facturen-en-betalen");
    expect(`${facturen?.naam} ${facturen?.kort} ${facturen?.tekst} ${facturen?.punten.join(" ")}`).not.toMatch(/betaalverzoek|QR/i);
  });

  it("voorbeelden zijn als voorbeeld gemarkeerd en de bedragen kloppen", () => {
    const pagina = lees("components/marketing/aanbod/EfactuurPagina.tsx");
    expect(pagina.match(/>Voorbeeld</g)?.length).toBeGreaterThanOrEqual(4);
    // 40 uur × € 31 + 40 × € 3,50 platformkosten, plus 21% btw
    const sub = 40 * 31 + 40 * 3.5;
    expect((sub * 1.21).toFixed(2)).toBe("1669.80");
    expect(pagina).toContain("€ 1.669,80");
    expect(pagina).toContain("€ 289,80");
  });
});

describe("de pagina", () => {
  it("e-facturatie krijgt het eigen ontwerp, de andere aanbodpagina's de standaardopmaak", () => {
    const route = lees("app/(marketing)/aanbod/[slug]/page.tsx");
    expect(route).toContain('const eigenOntwerp = a.slug === "e-facturatie";');
    expect(route).toContain("<EfactuurPagina a={a} pijlerNaam={pijler.naam} pijlerSleutel={pijler.sleutel} />");
    expect(route).toContain("<AanbodStandaard a={a} pijler={pijler} />");
  });

  it("de vragen gaan ook als FAQPage naar Google, via ldJson (geen JSON.stringify in een script)", () => {
    const route = lees("app/(marketing)/aanbod/[slug]/page.tsx");
    expect(route).toContain('"@type": "FAQPage"');
    expect(route).toContain("ldJson([dienst, breadcrumbJsonLd(");
    expect(EFACTUUR_FAQ.length).toBeGreaterThanOrEqual(5);
  });

  it("één h1, en elke sectie heeft een kopje", () => {
    const pagina = lees("components/marketing/aanbod/EfactuurPagina.tsx");
    expect(pagina.match(/<h1/g)).toHaveLength(1);
    const labels = [...pagina.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    for (const id of labels) expect(pagina, id).toContain(`id="${id}"`);
  });
});
