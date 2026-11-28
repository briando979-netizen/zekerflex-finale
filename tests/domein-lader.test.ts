import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STEEKPROEF_DREMPEL, type Locale } from "@/lib/i18n/config";
import { maakDomein } from "@/lib/i18n/domein";
import { voegSamen } from "@/lib/i18n/samenvoegen";
import { voegSamen as viaWerkerLader } from "@/lib/i18n/freelancer-lader";
import { genHashKlopt, renderDomeinIndex } from "@/lib/i18n/talen-motor";

// De lader per domein (28 nov 2026, lib/i18n/domein.ts): inloggen, chat, hulpcentrum, … in elke taal, zonder dat alle talen
// tegelijk in een browserbundel komen. Een handgemaakte taal direct, een machinetaal uit zijn eigen bestand over het Engels heen.
interface T {
  kop: string;
  knop: { ja: string; nee: string };
}
const basis = {
  nl: { kop: "Inloggen", knop: { ja: "Ja", nee: "Nee" } },
  en: { kop: "Log in", knop: { ja: "Yes", nee: "No" } },
  pl: { kop: "Zaloguj się", knop: { ja: "Tak", nee: "Nie" } },
  ro: { kop: "Autentificare", knop: { ja: "Da", nee: "Nu" } },
  uk: { kop: "Увійти", knop: { ja: "Так", nee: "Ні" } },
};

describe("domein-lader", () => {
  it("een handgemaakte taal staat er meteen", async () => {
    const d = maakDomein<T>(basis, {});
    expect(d.vast("pl")).toBe(basis.pl);
    expect(await d.laad("ro")).toBe(basis.ro);
  });

  it("een machinetaal komt uit zijn bestand, over het Engels heen (wat ontbreekt blijft Engels)", async () => {
    const d = maakDomein<T>(basis, { de: async () => ({ dict: { kop: "Anmelden", knop: { ja: "Ja" } } }) });
    expect(d.vast("de" as Locale)).toBeNull();
    const de = await d.laad("de" as Locale);
    expect(de.kop).toBe("Anmelden");
    expect(de.knop.ja).toBe("Ja");
    expect(de.knop.nee).toBe("No");
    expect(d.engels).toBe(basis.en);
  });

  it("zonder bestand, of als het laden mislukt: het Engels", async () => {
    const zonder = maakDomein<T>(basis, {});
    expect(await zonder.laad("fr" as Locale)).toBe(basis.en);
    const kapot = maakDomein<T>(basis, { it: async () => Promise.reject(new Error("chunk kwijt")) });
    expect(await kapot.laad("it" as Locale)).toBe(basis.en);
  });

  it("een geladen taal wordt één keer opgehaald", async () => {
    let keer = 0;
    const d = maakDomein<T>(basis, { es: async () => ((keer += 1), { dict: { kop: "Iniciar sesión" } }) });
    await d.laad("es" as Locale);
    await d.laad("es" as Locale);
    expect(keer).toBe(1);
  });

  it("voegSamen staat los van het werker-woordenboek, en de werker-lader geeft dezelfde functie door", () => {
    expect(viaWerkerLader).toBe(voegSamen);
    expect(readFileSync(join(process.cwd(), "lib/i18n/samenvoegen.ts"), "utf8")).not.toMatch(/freelancer/);
    expect(readFileSync(join(process.cwd(), "lib/i18n/domein.ts"), "utf8")).not.toMatch(/from ["']@\/lib\/i18n\/freelancer/);
  });

  it("inloggen gebruikt de lader: geen AUTH_DICTS[taal] meer buiten auth.ts", () => {
    const bestanden = [
      "components/auth/LoginForm.tsx", "components/auth/RegisterForm.tsx", "components/auth/ResendVerification.tsx", "components/auth/WijzigEmail.tsx",
      "components/auth/AuthShell.tsx", "components/app/OnboardingForm.tsx", "components/app/IdScan.tsx", "components/app/IdScanTelefoon.tsx",
      "app/login/page.tsx", "app/register/page.tsx", "app/verifieer-email/page.tsx",
    ];
    for (const f of bestanden) {
      const s = readFileSync(join(process.cwd(), f), "utf8");
      expect(s, f).not.toMatch(/AUTH_DICTS\[/);
      expect(s, f).toMatch(/\bAUTH\b/);
    }
  });
});

describe("domein-lader: gegenereerde bestanden", () => {
  // elk domein met zijn index; een nieuw domein komt hier bij (en in DOMEINEN in scripts/talen-motor.mjs)
  const DOMEINEN = [{ naam: "auth", laders: "AUTH_LADERS", typeNaam: "AuthDict", typeBron: "@/lib/i18n/auth" }];
  const gen = join(process.cwd(), "lib/i18n/gen");

  for (const info of DOMEINEN) {
    it(`${info.naam}: elk bestand ongewijzigd (hash), steekproef boven de drempel, de index is precies de lijst`, () => {
      const patroon = new RegExp(`^${info.naam}\\.(\\w+)\\.ts$`);
      const bestanden = readdirSync(gen).filter((f) => patroon.test(f));
      const talen = bestanden.map((f) => patroon.exec(f)?.[1] ?? "").sort();
      for (const f of bestanden) {
        const s = readFileSync(join(gen, f), "utf8");
        expect(genHashKlopt(s), `${f} is met de hand aangepast`).toBe(true);
        expect(Number(/"percentage": (\d+)/.exec(s)?.[1]), `steekproef van ${f}`).toBeGreaterThanOrEqual(STEEKPROEF_DREMPEL);
      }
      expect(readFileSync(join(gen, `${info.naam}-index.ts`), "utf8").replace(/\r\n/g, "\n")).toBe(renderDomeinIndex(info, talen));
    });
  }
});
