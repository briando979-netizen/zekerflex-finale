import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement, isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { STEEKPROEF_DREMPEL } from "@/lib/i18n/config";
import { deelVertaling, maakSiteT, siteSleutel, verzamelTeksten, vt, vulInMet } from "@/lib/i18n/site";
import { genHashKlopt, renderSiteIndex } from "@/lib/i18n/talen-motor";

// De openbare site in elke taal (28 nov 2026, lib/i18n/site.ts). De Nederlandse zin is de sleutel; een vertaling komt alleen uit
// een gegenereerd bestand lib/i18n/gen/site.<taal>.ts met een kloppende hash en een steekproef boven de drempel. Die bestanden laadt
// alleen de server (lib/i18n/site-lader.ts): nooit een clientbundel.
const wortel = process.cwd();
const TRAAG = 60_000;

function bronBestanden(map: string, uit: string[] = []): string[] {
  for (const e of readdirSync(join(wortel, map), { withFileTypes: true })) {
    const p = `${map}/${e.name}`;
    if (e.isDirectory()) {
      if (!["node_modules", ".next"].includes(e.name)) bronBestanden(p, uit);
    } else if (/\.(ts|tsx)$/.test(e.name)) uit.push(p);
  }
  return uit;
}
const lees = (p: string): string => readFileSync(join(wortel, p), "utf8");

describe("site-talen: de vertaalfunctie", () => {
  it("zonder vertaling blijft de zin precies staan, ook met zijn spaties", () => {
    const tx = maakSiteT(undefined);
    expect(tx("Vind flexwerk")).toBe("Vind flexwerk");
    expect(tx("Nog ")).toBe("Nog ");
  });

  it("met vertaling: de sleutel is de zin met samengevoegde witruimte, de spaties eromheen blijven", () => {
    const tx = maakSiteT({ "Vind flexwerk": "Finde Flexarbeit", "Nog {n} klussen": "Noch {n} Jobs" });
    expect(tx("Vind flexwerk")).toBe("Finde Flexarbeit");
    expect(tx("Vind\n      flexwerk")).toBe("Finde Flexarbeit");
    expect(tx(" Vind flexwerk ")).toBe(" Finde Flexarbeit ");
    expect(tx("Nog {n} klussen", { n: 3 })).toBe("Noch 3 Jobs");
    expect(tx("Onbekende zin")).toBe("Onbekende zin");
    expect(siteSleutel("  a \n b ")).toBe("a b");
  });

  it("vt geeft de zin ongewijzigd terug (alleen een merkteken voor het zoekscript)", () => {
    expect(vt("Plaats een klus")).toBe("Plaats een klus");
  });

  it("vulInMet zet elementen op hun plek en laat een onbekende plaatshouder staan", () => {
    const link = createElement("a", { href: "/contact" }, "contact");
    const uit = vulInMet("Vragen? Kijk bij {contact} of {onbekend}.", { contact: link });
    expect(uit[0]).toBe("Vragen? Kijk bij ");
    expect(isValidElement(uit[1])).toBe(true);
    expect(uit[2]).toBe(" of {onbekend}.");
  });

  it("verzamelTeksten vindt de tekstvelden in genest menu, deelVertaling geeft alleen wat vertaald is", () => {
    const menu = [{ label: "Werken", href: "/werken", items: [{ title: "Klussen", desc: "Alle klussen", href: "/klussen" }] }];
    const zinnen = verzamelTeksten(menu);
    expect([...zinnen].sort()).toEqual(["Alle klussen", "Klussen", "Werken"]);
    const tx = maakSiteT({ Werken: "Arbeiten", Klussen: "Jobs" });
    expect(deelVertaling(tx, zinnen)).toEqual({ Werken: "Arbeiten", Klussen: "Jobs" });
  });
});

describe("site-talen: gegenereerde bestanden", () => {
  const genMap = join(wortel, "lib/i18n/gen");
  const siteBestanden = () => readdirSync(genMap).filter((f) => /^site\.\w+\.ts$/.test(f));

  it("elk sitebestand is ongewijzigd (hash), heeft een steekproef boven de drempel, en de index is precies de lijst", () => {
    const talen = siteBestanden().map((f) => /^site\.(\w+)\.ts$/.exec(f)?.[1] ?? "").sort();
    for (const f of siteBestanden()) {
      const s = lees(`lib/i18n/gen/${f}`);
      expect(genHashKlopt(s), `${f} is met de hand aangepast`).toBe(true);
      const pct = /"percentage": (\d+)/.exec(s)?.[1];
      expect(Number(pct), `steekproef van ${f}`).toBeGreaterThanOrEqual(STEEKPROEF_DREMPEL);
    }
    expect(existsSync(join(genMap, "site-index.ts"))).toBe(true);
    expect(lees("lib/i18n/gen/site-index.ts").replace(/\r\n/g, "\n")).toBe(renderSiteIndex(talen));
  });

  it("alleen de server laadt de sitevertalingen: geen clientbestand importeert de lader of een sitebestand", () => {
    const fout: string[] = [];
    for (const f of [...bronBestanden("lib"), ...bronBestanden("components"), ...bronBestanden("app")]) {
      if (f.startsWith("lib/i18n/gen/")) continue;
      const s = lees(f);
      const client = /^\s*["']use client["']/.test(s);
      if (/from ["']@\/lib\/i18n\/gen\/site\./.test(s) || /import\(["']@\/lib\/i18n\/gen\/site\./.test(s)) fout.push(`${f}: importeert een sitebestand`);
      if (client && /from ["']@\/lib\/i18n\/(site-lader|gen\/site-index)["']/.test(s)) fout.push(`${f}: clientbestand importeert de lader`);
    }
    expect(fout).toEqual([]);
  }, TRAAG);

  it("geen tx(`…${x}`) met een sjabloon op de site: dat vindt het zoekscript niet (gebruik een plaatshouder)", () => {
    const fout: string[] = [];
    for (const map of ["app/(marketing)", "components/marketing", "lib/marketing"]) {
      for (const f of bronBestanden(map)) if (/\b(tx|vt)\(\s*`[^`]*\$\{/.test(lees(f))) fout.push(f);
    }
    expect(fout).toEqual([]);
  }, TRAAG);
});
