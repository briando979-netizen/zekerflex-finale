import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installRegel } from "@/lib/app-vereist";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// 23 nov 2026 (eigenaar, na het bekijken van de live site): geen woord "test" in kopjes, badges en korte regels rond het
// installeren van de app. Het moet wel waar blijven: de app staat in de EU nog niet in de App Store (iPhone: uitnodiging via
// TestFlight) en Android zit in een besloten groep. In de uitleg-stappen mogen de echte productnamen staan, want de werker
// moet ze kunnen vinden.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const TEST = /test|тест/i;

describe("de korte installatieregel", () => {
  it("zegt: installeer met een uitnodiging, of open ZekerFlex gewoon in je browser", () => {
    expect(installRegel({ appStore: false, alleenApp: false })).toBe("iPhone en Android: installeer met een uitnodiging, of open ZekerFlex gewoon in je browser");
  });

  it("noemt de browser niet als de werker-omgeving alleen in de app mag (vlag werker-alleen-app aan)", () => {
    expect(installRegel({ appStore: false, alleenApp: true })).toBe("iPhone en Android: installeer met een uitnodiging");
  });

  it("gaat alleen over Android als de iPhone-app gewoon in de App Store staat", () => {
    expect(installRegel({ appStore: true, alleenApp: false })).toBe("Android: installeer met een uitnodiging, of open ZekerFlex gewoon in je browser");
    expect(installRegel({ appStore: true, alleenApp: true })).toBe("Android: installeer met een uitnodiging");
  });

  it("heeft het woord test niet, en belooft geen gewone winkelinstallatie of 'binnenkort'", () => {
    for (const appStore of [true, false]) {
      for (const alleenApp of [true, false]) {
        const regel = installRegel({ appStore, alleenApp });
        expect(regel).not.toMatch(TEST);
        expect(regel).not.toMatch(/binnenkort|download in de app store/i);
      }
    }
  });
});

describe("AppDownload (voorpagina, /flexwerk en /app)", () => {
  const bron = lees("components/marketing/AppDownload.tsx");

  it("gebruikt de korte regel (ook op /app zelf) en een link naar de uitleg op /app", () => {
    expect(bron.split("installRegel({ appStore, alleenApp })")).toHaveLength(3);
    expect(bron).toMatch(/<Link href="\/app"[^>]*>\s*zo werkt het\s*<\/Link>/);
  });

  it("heeft geen woord test in de badges en de kopjes van de uitleg", () => {
    const badges = [...bron.matchAll(/tracking-wide text-brand-mint">([^<]+)<\/span>\s*<span className="block text-sm font-bold">([^<]+)<\/span>/g)];
    expect(badges).toHaveLength(2);
    for (const b of badges) {
      expect(b[1], "bovenregel van de badge").not.toMatch(TEST);
      expect(b[2], "onderregel van de badge").not.toMatch(TEST);
    }
    const kopjes = [...bron.matchAll(/font-semibold text-white">([^<]+)<\/p>/g)].map((m) => m[1] ?? "");
    expect(kopjes).toEqual(["iPhone: installeer met een uitnodiging", "Android: installeer met een uitnodiging"]);
  });

  it("noemt de echte productnamen wel in de uitleg-stappen", () => {
    expect(bron).toContain("Installeer de gratis app TestFlight uit de App Store.");
    expect(bron).toContain("<em>Word tester</em>");
  });

  it("zegt dat de browser kan, alleen via de vlag (niet vast), en belooft niets over bedrijven die klussen plaatsen", () => {
    expect(bron).toContain("alleenApp");
    expect(bron).not.toMatch(/Je kunt ook gewoon in de browser beginnen/);
    expect(bron).not.toMatch(/bedrijven plaatsen|eerste bedrijven|plaatsen nu klussen/i);
  });
});

describe("het installatiescherm en de kaart in de werker-app (vijf talen)", () => {
  it("kopjes, knoppen en kaart hebben het woord test niet; de uitleg noemt TestFlight en Google Play wel", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      const t = d.appVereist;
      for (const k of ["kop", "winkelKop", "groepStap", "android", "iphone", "kaartKop", "kaartHoe", "kaartTekst", "installeerKnop"] as const) {
        expect(t[k], `${taal} ${k}`).not.toMatch(TEST);
      }
      expect(t.androidUitleg, `${taal} androidUitleg`).not.toMatch(TEST);
      expect(t.iphoneUitleg, `${taal} iphoneUitleg`).toContain("TestFlight");
      expect(t.android, `${taal} android`).toContain("Google Play");
    }
  });

  it("de koppen verschillen per taal (geen Nederlands in de andere talen)", () => {
    const nl = FREELANCER_DICTS.nl.appVereist;
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      if (taal === "nl") continue;
      for (const k of ["winkelKop", "groepStap", "iphone", "androidUitleg", "iphoneUitleg"] as const) {
        expect(d.appVereist[k], `${taal} ${k}`).not.toBe(nl[k]);
      }
    }
  });

  it("de Nederlandse tekst zegt wat er waar is: uitnodiging, Google-groep, geen winkelbelofte", () => {
    const nl = FREELANCER_DICTS.nl.appVereist;
    expect(nl.winkelKop).toBe("Of installeer met een uitnodiging");
    expect(nl.groepStap).toBe("Android stap 1: word lid van de Google-groep");
    expect(nl.iphone).toBe("iPhone: open de uitnodiging");
    for (const tekst of [nl.winkelKop, nl.groepStap, nl.android, nl.androidUitleg, nl.iphone, nl.iphoneUitleg]) {
      expect(tekst).not.toMatch(/binnenkort/i);
    }
  });
});

describe("andere plekken waar de werker de installatieregel ziet", () => {
  it("de menutegel en de linkpagina noemen geen testversie", () => {
    for (const f of ["lib/marketing/site-nav.ts", "lib/marketing/aanbod.ts", "app/links/page.tsx"]) {
      const regels = lees(f).split("\n").filter((r) => /Download de app/.test(r));
      expect(regels.length, f).toBeGreaterThan(0);
      for (const r of regels) expect(r, f).not.toMatch(/test|tester|testgroep/i);
    }
  });
});
