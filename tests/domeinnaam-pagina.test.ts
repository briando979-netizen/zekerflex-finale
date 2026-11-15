import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDEL_TLDS, EXTENSIES, euroPrijs } from "@/lib/domeinen/extensies";
import {
  BUNDEL_TEKST,
  DOMEIN_FAQ,
  DOMEIN_STAPPEN,
  DOMEIN_VOORDELEN,
  VERHUIS_STAPPEN,
  domeinFaqJsonLd,
  goedkoopsteEersteJaar,
  prijsKaarten,
} from "@/lib/domeinen/pagina-teksten";

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const pagina = lees("app/(marketing)/domeinnaam/page.tsx");
const alleTekst = [
  ...DOMEIN_FAQ.flatMap((v) => [v.q, v.a]),
  ...DOMEIN_STAPPEN.flatMap((s) => [s.titel, s.tekst]),
  ...VERHUIS_STAPPEN.flatMap((s) => [s.titel, s.tekst]),
  ...DOMEIN_VOORDELEN.flatMap((v) => [v.titel, v.tekst]),
  pagina,
].join("\n");

describe("/domeinnaam (opbouw zoals een domeinwinkel, eigen inhoud)", () => {
  it("heeft de zoekbalk in de kop, met een anker waar de knoppen naartoe gaan", () => {
    expect(pagina).toContain('id="zoek"');
    expect(pagina.indexOf("<DomeinZoeker />")).toBeLessThan(pagina.indexOf('aria-labelledby="stappen-titel"'));
    expect(pagina).toContain('primaryHref="#zoek"');
    // in drie stappen, verhuizen in drie stappen, vier voordelen
    expect(DOMEIN_STAPPEN).toHaveLength(3);
    expect(VERHUIS_STAPPEN).toHaveLength(3);
    expect(DOMEIN_VOORDELEN).toHaveLength(4);
    for (const id of ["stappen-titel", "bundel-titel", "voordelen-titel", "verhuizen-titel", "prijzen-titel", "faq-titel"]) {
      expect(pagina, id).toContain(`aria-labelledby="${id}"`);
      expect(pagina, id).toContain(`id="${id}"`);
    }
  });

  it("belooft geen online betalen zolang dat dicht staat, en verzint geen cijfers of beoordelingen", () => {
    // 15 nov: de oude vraag zei "Betalen kan met iDEAL of je kaart"; een bezoeker vraagt aan en een mens neemt contact op
    expect(alleTekst).not.toMatch(/iDEAL|creditcard|met je kaart|betaalverzoek|Bank/);
    expect(alleTekst).not.toMatch(/miljoen|\d[\d.]*\+? (klanten|domeinen|ondernemers)|sterren|★|beoordeling|review(s)? van klanten/i);
    expect(alleTekst).not.toMatch(/korting|actie|gratis eerste jaar|tijdelijk/i);
    expect(DOMEIN_FAQ.some((v) => /binnen één werkdag/i.test(v.a))).toBe(true);
  });

  it("haalt de prijzen uit de prijslijst (geen vaste bedragen in de pagina)", () => {
    expect(pagina).not.toMatch(/€\s?\d/);
    const laagste = goedkoopsteEersteJaar();
    expect(laagste).toBeDefined();
    for (const e of EXTENSIES) expect(laagste?.prijsCent ?? 0).toBeLessThanOrEqual(e.prijsCent);
    const kaarten = prijsKaarten();
    expect(kaarten.map((k) => k.tld)).toEqual(EXTENSIES.filter((e) => e.populair).map((e) => e.tld));
    const nl = EXTENSIES.find((e) => e.tld === "nl");
    expect(kaarten.find((k) => k.tld === "nl")).toMatchObject({ eersteJaar: euroPrijs(nl?.prijsCent ?? -1), daarna: euroPrijs(nl?.verlengCent ?? -1) });
    // "inbegrepen bij je website" alleen bij de bundel
    for (const k of kaarten) expect(k.inBundel).toBe((BUNDEL_TLDS as readonly string[]).includes(k.tld));
    expect(BUNDEL_TEKST).toBe(".nl, .com, .eu of .be");
  });

  it("geeft zoekmachines precies de vragen die op de pagina staan", () => {
    const ld = domeinFaqJsonLd() as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(ld.mainEntity.map((v) => v.name)).toEqual(DOMEIN_FAQ.map((v) => v.q));
    expect(ld.mainEntity.map((v) => v.acceptedAnswer.text)).toEqual(DOMEIN_FAQ.map((v) => v.a));
    expect(pagina).toContain("domeinFaqJsonLd()");
    expect(pagina).toContain("<FaqList items={DOMEIN_FAQ} />");
    expect(pagina).not.toMatch(/JSON\.stringify/);
  });
});
