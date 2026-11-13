import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASIS_LOCALES,
  JURIDISCH_REGEL,
  KANDIDAAT_TALEN,
  LOCALES,
  LOCALE_LABELS,
  MACHINE_LOCALES,
  STEEKPROEF_DREMPEL,
  TAAL_META,
  basisLocale,
  isLocale,
  isMachineLocale,
  taalLabel,
  taalRichting,
  type Locale,
} from "@/lib/i18n/config";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { FOUTEN, foutenVoor } from "@/lib/i18n/fouten";
import { WORKER_PUSH } from "@/lib/i18n/worker-push";
import { genHashKlopt, renderGenIndex } from "@/lib/i18n/talen-motor";
import { GEN_LADERS } from "@/lib/i18n/gen";
import { OVERRIDE_LADERS } from "@/lib/i18n/overrides";

// Bewaker van de talen-motor (13 nov 2026, poortwachter 86). Een machinetaal komt pas in MACHINE_LOCALES (en dus in
// LOCALES / de taalkiezer) als zijn gegenereerde bestand er is en de steekproef klopt; een gegenereerd bestand wordt
// nooit met de hand aangepast; geen enkele taal komt in een client-bundel via een statische import.
const wortel = process.cwd();
const lees = (p: string) => readFileSync(join(wortel, p), "utf8");
const genMap = join(wortel, "lib/i18n/gen");
const genBestanden = () => readdirSync(genMap).filter((f) => /^freelancer\.\w+\.ts$/.test(f));

function bronBestanden(map: string, uit: string[] = []): string[] {
  for (const e of readdirSync(join(wortel, map), { withFileTypes: true })) {
    const p = `${map}/${e.name}`;
    if (e.isDirectory()) {
      if (!["node_modules", ".next"].includes(e.name)) bronBestanden(p, uit);
    } else if (/\.(ts|tsx)$/.test(e.name)) uit.push(p);
  }
  return uit;
}

describe("talen: taalmeta en lijsten", () => {
  it("elke taal in LOCALES heeft meta, een kiezertekst en een richting", () => {
    for (const l of LOCALES) {
      expect(TAAL_META[l].naam, l).toBeTruthy();
      expect(LOCALE_LABELS[l], l).toContain(l.toUpperCase());
      expect(["ltr", "rtl"]).toContain(taalRichting(l));
    }
  });

  it("een machinetaal heet 'Automatisch vertaald' in de kiezer, een handgemaakte niet", () => {
    expect(taalLabel("tr")).toBe("Türkçe (TR) · Automatisch vertaald");
    expect(taalLabel("pl")).toBe("Polski (PL)");
    for (const l of BASIS_LOCALES) expect(TAAL_META[l].machinaal).toBe(false);
    for (const l of MACHINE_LOCALES) expect(LOCALE_LABELS[l as Locale]).toContain("Automatisch vertaald");
  });

  it("de kandidaten zijn bekend, ar is rechts-naar-links en staat nog niet in LOCALES (eigen RTL-stap)", () => {
    for (const t of KANDIDAAT_TALEN) expect(TAAL_META[t].machinaal).toBe(true);
    expect(TAAL_META.ar.dir).toBe("rtl");
    expect(isLocale("ar")).toBe(false);
    for (const l of LOCALES) if (taalRichting(l) === "rtl") expect(existsSync(join(wortel, "lib/i18n/gen", `freelancer.${l}.ts`))).toBe(true);
  });

  it("de tabellen met handgemaakte tekst hebben precies de basistalen; een machinetaal valt terug op het Engels", () => {
    expect(Object.keys(FREELANCER_DICTS).sort()).toEqual([...BASIS_LOCALES].sort());
    expect(Object.keys(WORKER_PUSH).sort()).toEqual([...BASIS_LOCALES].sort());
    for (const [k, t] of Object.entries(FOUTEN)) expect(Object.keys(t).sort(), k).toEqual([...BASIS_LOCALES].sort());
    expect(basisLocale("pl")).toBe("pl");
    expect(basisLocale("tr" as Locale)).toBe("en");
    expect(foutenVoor("tr" as Locale)).toEqual(foutenVoor("en"));
    expect(isMachineLocale("tr")).toBe((MACHINE_LOCALES as readonly string[]).includes("tr"));
  });

  it("de juridische regel noemt Nederlands en Engels", () => {
    expect(JURIDISCH_REGEL).toContain("Deze tekst is in het Nederlands en Engels geldig");
  });
});

describe("talen: gegenereerde bestanden", () => {
  it("een taal in MACHINE_LOCALES heeft zijn bestand, een lader en een steekproef boven de drempel", () => {
    for (const l of MACHINE_LOCALES as readonly string[]) {
      const pad = `lib/i18n/gen/freelancer.${l}.ts`;
      expect(existsSync(join(wortel, pad)), `${pad} ontbreekt`).toBe(true);
      expect(Object.hasOwn(GEN_LADERS, l), `${l} staat niet in lib/i18n/gen/index.ts`).toBe(true);
      const pct = /"percentage": (\d+)/.exec(lees(pad))?.[1];
      expect(Number(pct), `steekproef van ${l}`).toBeGreaterThanOrEqual(STEEKPROEF_DREMPEL);
    }
  });

  it("elk gegenereerd bestand is ongewijzigd (hash) en de index is precies de lijst bestanden", () => {
    const talen = genBestanden().map((f) => /^freelancer\.(\w+)\.ts$/.exec(f)?.[1] ?? "");
    for (const f of genBestanden()) expect(genHashKlopt(lees(`lib/i18n/gen/${f}`)), `${f} is met de hand aangepast: zet verbeteringen in lib/i18n/overrides`).toBe(true);
    expect(lees("lib/i18n/gen/index.ts").replace(/\r\n/g, "\n")).toBe(renderGenIndex(talen));
    expect(Object.keys(GEN_LADERS).sort()).toEqual([...talen].sort());
  });

  it("een override hoort bij een machinetaal en een bestaand overrides-bestand", () => {
    for (const l of Object.keys(OVERRIDE_LADERS)) {
      expect(TAAL_META).toHaveProperty(l);
      expect(existsSync(join(wortel, "lib/i18n/overrides", `${l}.ts`)), l).toBe(true);
    }
  });

  it("niemand importeert een gegenereerd bestand of een override statisch: alleen de lader via de index", () => {
    const fout: string[] = [];
    for (const f of [...bronBestanden("lib"), ...bronBestanden("components"), ...bronBestanden("app")]) {
      if (f.startsWith("lib/i18n/gen/")) continue;
      const s = lees(f);
      if (/from ["']@\/lib\/i18n\/(gen\/freelancer\.|overrides\/\w)/.test(s)) fout.push(f);
      if (/\bimport\(["']@\/lib\/i18n\/(gen\/freelancer|overrides\/\w)/.test(s)) fout.push(f);
    }
    expect(fout).toEqual([]);
  });

  it("freelancer.ts bevat geen talen-motor: alleen de vijf handgemaakte woordenboeken, de lader staat apart", () => {
    const s = lees("lib/i18n/freelancer.ts");
    expect(s).not.toMatch(/i18n\/gen|overrides|talen-motor|import\(/);
    expect(lees("lib/i18n/freelancer-lader.ts")).toMatch(/GEN_LADERS/);
    expect(lees("components/i18n/useFT.ts")).toContain("laadFreelancerDict");
  });

  it("het script is de enige schrijver naar lib/i18n/gen", () => {
    const schrijvers = [...bronBestanden("lib"), ...bronBestanden("app"), ...bronBestanden("components")].filter((f) => /i18n\/gen/.test(lees(f)) && /writeFile/.test(lees(f)));
    expect(schrijvers).toEqual([]);
  });
});