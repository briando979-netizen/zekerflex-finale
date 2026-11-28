import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/config";
import { WIN_PADEN, WIN_STANDAARD, WIN_TALEN, WIN_TEKST, winHreflang, winTaalVanPad } from "@/lib/marketing/werken-in-nederland";
import { vulUitzend } from "@/lib/i18n/uitzend-aanvraag";

// "Werken in Nederland" in vijf talen (28 nov 2026): elke taal een eigen pagina, hreflang naar elkaar, in de sitemap en de
// voettekst, en de root-layout zet <html lang> op de taal van het adres. Plus: geen beloftes die niet kloppen.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");

describe("werken in Nederland: vijf talen", () => {
  it("elke taal is een taal van de app en heeft een eigen, uniek adres met een pagina", () => {
    for (const t of WIN_TALEN) {
      expect((LOCALES as readonly string[]).includes(t), t).toBe(true);
      const bestand = `app/(marketing)${WIN_PADEN[t]}/page.tsx`;
      expect(existsSync(path.join(ROOT, bestand)), bestand).toBe(true);
      expect(lees(bestand)).toContain(`winMetadata("${t}")`);
      expect(lees(bestand)).toContain(`<WerkenInNederland taal="${t}" />`);
    }
    expect(new Set(Object.values(WIN_PADEN)).size).toBe(WIN_TALEN.length);
  });

  it("hreflang: alle vijf talen plus x-default (Engels), met het volledige adres", () => {
    const h = winHreflang("https://zekerflex.com");
    expect(Object.keys(h).sort()).toEqual([...WIN_TALEN, "x-default"].sort());
    expect(h.pl).toBe("https://zekerflex.com/pl/praca-w-holandii");
    expect(h["x-default"]).toBe(`https://zekerflex.com${WIN_PADEN[WIN_STANDAARD]}`);
  });

  it("de taal van het adres, ook met een slash erachter; elk ander adres null", () => {
    expect(winTaalVanPad("/pl/praca-w-holandii")).toBe("pl");
    expect(winTaalVanPad("/uk/robota-v-niderlandakh/")).toBe("uk");
    expect(winTaalVanPad("/werken-in-nederland")).toBe("nl");
    expect(winTaalVanPad("/")).toBeNull();
    expect(winTaalVanPad("/pl")).toBeNull();
    expect(winTaalVanPad(null)).toBeNull();
  });

  it("elke taal heeft dezelfde opbouw en titels/beschrijvingen op Google-lengte", () => {
    const nl = WIN_TEKST.nl;
    for (const t of WIN_TALEN) {
      const x = WIN_TEKST[t];
      expect(x.kenmerken.length, t).toBe(nl.kenmerken.length);
      expect(x.stappen.length, t).toBe(nl.stappen.length);
      expect(x.nodig.length, t).toBe(nl.nodig.length);
      expect(x.eerlijk.length, t).toBe(nl.eerlijk.length);
      expect(x.faq.length, t).toBe(nl.faq.length);
      // " · ZekerFlex" komt er nog achter (titelsjabloon van de root-layout)
      expect(`${x.title} · ZekerFlex`.length, `${t}: ${x.title}`).toBeLessThanOrEqual(60);
      expect(x.description.length, `${t}: ${x.description}`).toBeLessThanOrEqual(160);
      expect(x.description.length, t).toBeGreaterThan(100);
    }
    expect(new Set(WIN_TALEN.map((t) => WIN_TEKST[t].title)).size).toBe(WIN_TALEN.length);
  });

  it("het aantal talen klopt met de app: 5 met de hand plus de machinetalen (lib/i18n/config.ts)", () => {
    const aantal = LOCALES.length;
    expect(aantal).toBeGreaterThan(5);
    for (const t of WIN_TALEN) expect(WIN_TEKST[t].kenmerken[1]?.kop.startsWith(`${aantal} `), `${t}: ${WIN_TEKST[t].kenmerken[1]?.kop}`).toBe(true);
  });

  it("eerlijk: geen woonruimte of reis, geen uitzendbureau, vanaf 18, en geen bank, voorschot of snelle uitbetaling", () => {
    const nl = WIN_TEKST.nl;
    expect(nl.eerlijk.join(" ")).toMatch(/geen woonruimte en geen vervoer/);
    expect(nl.eerlijk.join(" ")).toMatch(/ZekerFlex is geen uitzendbureau/);
    expect(nl.nodig.join(" ")).toMatch(/18 jaar/);
    for (const t of WIN_TALEN) {
      // waar het werk is: alleen Nederland, of met de vlag werk-in-belgie ook België; geen "altijd in Nederland" meer in de vragen
      expect(WIN_TEKST[t].plaatsMetBelgie, t).toMatch(/Belgi|Бельгі/);
      expect(WIN_TEKST[t].plaatsMetBuitenland, t).not.toMatch(/Belgi|Бельгі/);
      expect(WIN_TEKST[t].faq.map((f) => f.a).join(" "), t).not.toMatch(/altijd in Nederland|always in the Netherlands|zawsze w Holandii|mereu în Olanda/);
      const alles = JSON.stringify(WIN_TEKST[t]).toLowerCase();
      expect(alles, t).not.toMatch(/zekerflex bank|voorschot|advance|zaliczk|avans|аванс|sneller uitbetaald|instant payout|huisvesting geregeld/);
    }
  });

  it("sitemap, voettekst en <html lang> kennen de vijf pagina's", () => {
    const sitemap = lees("app/sitemap.ts");
    for (const t of WIN_TALEN) expect(sitemap, t).toContain(`entry(WIN_PADEN.${t}, 0.7, "monthly"), alternates: { languages: winHreflang(SITE.url) } }`);
    const voet = lees("components/marketing/SiteFooter.tsx");
    expect(voet).toContain("WIN_TALEN.map((t) => (");
    expect(voet).toContain("href={WIN_PADEN[t]} hrefLang={t} lang={t}");
    expect(lees("app/layout.tsx")).toContain('winTaalVanPad(kop.get("x-pathname")) ?? (await getLocale())');
    // de knoppen zetten de taal voor het aanmelden (zelfde cookie als de taalknop)
    expect(lees("components/marketing/TaalStartLink.tsx")).toContain("onClick={() => bewaarTaalKeuze(taal)}");
    // met de vlag werk-in-belgie of werk-in-buitenland aan zegt het eerste punt dat er ook diensten buiten Nederland zijn
    const scherm = lees("components/marketing/WerkenInNederland.tsx");
    expect(scherm).toContain("featureEnabled(WERK_IN_BELGIE_VLAG).catch(() => false)");
    expect(scherm).toContain("featureEnabled(WERK_IN_BUITENLAND_VLAG).catch(() => false)");
    // elk land gaat voor België: met werk-in-buitenland aan klopt "alleen België" niet meer
    expect(scherm).toContain("metBuitenland ? t.plaatsMetBuitenland : metBelgie ? t.plaatsMetBelgie : null");
  });
});

describe("oude browsers", () => {
  it("vulUitzend werkt zonder replaceAll (Safari vóór 13.1) en vult een $-teken letterlijk in", () => {
    expect(lees("lib/i18n/uitzend-aanvraag.ts")).not.toContain(".replaceAll(");
    expect(vulUitzend("{klant} via {bureau}, {klant}", { klant: "Magazijn", bureau: "Flex $& Bureau" })).toBe("Magazijn via Flex $& Bureau, Magazijn");
  });
});
