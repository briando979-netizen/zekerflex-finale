import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHIFT_TEMPLATES } from "@/lib/shifts/catalogus";
import { SHIFT_CATEGORIES } from "@/lib/shifts/category";
import { SECTOR_TEMPLATE } from "@/lib/klusconcept/concept";
import { brancheOpties, categorieVan, euroTekst, kiezerWeergave, VEELGEKOZEN_AANTAL, veelgekozen, zoekSjablonen, type KiezerSjabloon } from "@/lib/shifts/sjabloon-kiezer";
import { SJABLOON_EN, SJABLOON_NL, vulIn } from "@/lib/shifts/sjabloon-kiezer-teksten";

// De functiekiezer van de klus-wizard (22 nov 2026, eigenaar: "ziet er slordig uit"): regels in plaats van fotokaarten,
// zoeken, één branchemenu en een korte lijst eerst. De sjablonen zelf (lib/shifts/catalogus.ts) blijven zoals ze zijn.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

const alle: KiezerSjabloon[] = SHIFT_TEMPLATES.map((t) => ({ key: t.key, label: t.label, rateCents: Math.max(t.hourlyRateCents, 1_620), branche: t.branche }));
const keys = (l: readonly KiezerSjabloon[]) => l.map((t) => t.key);

describe("de catalogus in de kiezer", () => {
  it("heeft alle 64 sjablonen in 15 branches", () => {
    expect(alle).toHaveLength(64);
    expect(brancheOpties(alle).map((c) => c.key)).toEqual(SHIFT_CATEGORIES.map((c) => c.key));
  });

  it("neemt de eigen branche van een sjabloon, anders die van de titel", () => {
    expect(categorieVan({ label: "Eender wat", branche: "zorg" }).key).toBe("zorg");
    expect(categorieVan({ label: "Kassamedewerker" }).key).toBe("retail");
  });
});

describe("veelgekozen", () => {
  it("is een korte lijst van hooguit 8 verschillende functies uit de catalogus", () => {
    const lijst = veelgekozen(alle);
    expect(lijst).toHaveLength(VEELGEKOZEN_AANTAL);
    expect(new Set(keys(lijst)).size).toBe(lijst.length);
    for (const t of lijst) expect(alle).toContain(t);
  });

  it("begint met de functies waar de sectorpagina's naar verwijzen, daarna de vaste volgorde", () => {
    const uitSectoren = [...new Set(Object.values(SECTOR_TEMPLATE))];
    expect(keys(veelgekozen(alle)).slice(0, uitSectoren.length)).toEqual(uitSectoren);
    expect(keys(veelgekozen(alle))).toEqual(["horeca", "magazijn", "schoonmaak", "vakkenvuller", "promotie", "bezorger", "kassa", "verkoop"]);
  });

  it("zet een gekozen functie die er niet bij valt vooraan, zonder de lijst langer te maken", () => {
    const lijst = veelgekozen(alle, VEELGEKOZEN_AANTAL, "kok");
    expect(lijst[0]?.key).toBe("kok");
    expect(lijst).toHaveLength(VEELGEKOZEN_AANTAL);
    expect(keys(lijst)).not.toContain("verkoop");
    // een gekozen functie die er al bij zit verschuift niets
    expect(keys(veelgekozen(alle, VEELGEKOZEN_AANTAL, "magazijn"))).toEqual(keys(veelgekozen(alle)));
  });

  it("werkt ook met een korte catalogus", () => {
    expect(veelgekozen(alle.slice(0, 3))).toHaveLength(3);
    expect(veelgekozen([])).toEqual([]);
  });
});

describe("zoeken en filteren", () => {
  it("zonder zoekwoord en branche komt alles terug, in de vaste volgorde", () => {
    expect(keys(zoekSjablonen(alle))).toEqual(keys(alle));
    expect(keys(zoekSjablonen(alle, { zoek: "   ", branche: "alle" }))).toEqual(keys(alle));
  });

  it("zoekt in de functienaam, ook op een deel van een woord, zonder op hoofdletters te letten", () => {
    expect(keys(zoekSjablonen(alle, { zoek: "kok" }))).toEqual(["kok"]);
    expect(keys(zoekSjablonen(alle, { zoek: "MAGAZIJN" }))).toEqual(["magazijn"]);
    expect(keys(zoekSjablonen(alle, { zoek: "heftr" }))).toEqual(["heftruck"]);
  });

  it("negeert accenten", () => {
    const lijst: KiezerSjabloon[] = [{ key: "a", label: "Café medewerker", rateCents: 1_620 }];
    expect(keys(zoekSjablonen(lijst, { zoek: "cafe" }))).toEqual(["a"]);
    expect(keys(zoekSjablonen(lijst, { zoek: "CAFÉ" }))).toEqual(["a"]);
  });

  it("alle woorden moeten passen", () => {
    expect(keys(zoekSjablonen(alle, { zoek: "bediening horeca" }))).toEqual(["horeca"]);
    expect(zoekSjablonen(alle, { zoek: "bediening magazijn" })).toEqual([]);
  });

  it("vindt ook op de branche en zet een treffer in de naam eerst", () => {
    const horeca = zoekSjablonen(alle, { zoek: "horeca" });
    expect(horeca[0]?.key).toBe("horeca");
    expect(horeca).toHaveLength(7);
    for (const t of horeca) expect(categorieVan(t).key).toBe("horeca");
  });

  it("rangschikt een woordbegin voor een treffer midden in de naam, en die voor alleen de branche", () => {
    const lijst: KiezerSjabloon[] = [
      { key: "a", label: "Inkoopkassa", rateCents: 1_620 },
      { key: "b", label: "Kassamedewerker", rateCents: 1_620 },
    ];
    expect(keys(zoekSjablonen(lijst, { zoek: "kassa" }))).toEqual(["b", "a"]);
    const branche: KiezerSjabloon[] = [
      { key: "x", label: "Magazijnmedewerker", rateCents: 1_620, branche: "kantoor" },
      { key: "y", label: "Kantoorhulp", rateCents: 1_620 },
    ];
    expect(keys(zoekSjablonen(branche, { zoek: "kantoor" }))).toEqual(["y", "x"]);
  });

  it("filtert op branche, ook samen met een zoekwoord", () => {
    const zorg = zoekSjablonen(alle, { branche: "zorg" });
    expect(zorg).toHaveLength(4);
    for (const t of zorg) expect(categorieVan(t).key).toBe("zorg");
    expect(keys(zoekSjablonen(alle, { branche: "horeca", zoek: "kok" }))).toEqual(["kok"]);
    expect(zoekSjablonen(alle, { branche: "zorg", zoek: "kok" })).toEqual([]);
  });

  it("geeft niets terug als er niets past", () => {
    expect(zoekSjablonen(alle, { zoek: "qqqq" })).toEqual([]);
  });
});

describe("wat de kiezer toont", () => {
  const leeg = { zoek: "", branche: "alle" as const, alles: false, gekozen: "" };

  it("eerst de korte lijst", () => {
    const w = kiezerWeergave(alle, leeg);
    expect(w.modus).toBe("veelgekozen");
    expect(w.items).toHaveLength(VEELGEKOZEN_AANTAL);
  });

  it("zoeken, een branche kiezen of uitklappen toont meteen alle passende functies", () => {
    expect(kiezerWeergave(alle, { ...leeg, zoek: "kok" })).toMatchObject({ modus: "resultaten" });
    expect(kiezerWeergave(alle, { ...leeg, branche: "bouw" }).items).toHaveLength(4);
    expect(kiezerWeergave(alle, { ...leeg, alles: true }).items).toHaveLength(64);
  });

  it("een zoekwoord van alleen spaties telt niet als zoeken", () => {
    expect(kiezerWeergave(alle, { ...leeg, zoek: "  " }).modus).toBe("veelgekozen");
  });
});

describe("tarief in de lijst", () => {
  it("schrijft het Nederlands met komma en het Engels met punt", () => {
    expect(euroTekst(1_620)).toBe("€ 16,20");
    expect(euroTekst(1_950, "nl")).toBe("€ 19,50");
    expect(euroTekst(1_620, "en")).toBe("€ 16.20");
  });
});

describe("de teksten", () => {
  it("Nederlands en Engels hebben dezelfde sleutels en geen enkele is leeg", () => {
    expect(Object.keys(SJABLOON_EN).sort()).toEqual(Object.keys(SJABLOON_NL).sort());
    for (const set of [SJABLOON_NL, SJABLOON_EN]) {
      for (const [k, v] of Object.entries(set)) {
        if (k === "branches") continue;
        expect(String(v).trim(), k).not.toBe("");
      }
      expect(Object.keys(set.branches).sort()).toEqual(SHIFT_CATEGORIES.map((c) => c.key).sort());
      for (const v of Object.values(set.branches)) expect(v.trim()).not.toBe("");
    }
  });

  it("de Nederlandse brancheteksten zijn die van de catalogus (geen eigen afwijking)", () => {
    for (const c of SHIFT_CATEGORIES) expect(SJABLOON_NL.branches[c.key], c.key).toBe(c.label);
  });

  it("de plaatshouders staan in beide talen", () => {
    for (const set of [SJABLOON_NL, SJABLOON_EN]) {
      expect(set.toonAlle).toContain("{n}");
      expect(set.gevondenMeer).toContain("{n}");
      expect(set.vanaf).toContain("{bedrag}");
      expect(set.geenResultaat).toContain("{zoek}");
    }
    expect(vulIn(SJABLOON_NL.toonAlle, { n: 64 })).toBe("Toon alle 64 functies");
    expect(vulIn(SJABLOON_NL.vanaf, { bedrag: "€ 16,20" })).toBe("vanaf € 16,20 per uur");
    expect(vulIn(SJABLOON_EN.vanaf, { bedrag: "€ 16.20" })).toBe("from € 16.20 per hour");
  });
});

describe("het scherm (bron-controle)", () => {
  const galerij = lees("components/app/SjabloonGalerij.tsx");

  it("geen foto's van mensen, geen horizontale scrollbalk en geen afgebroken woorden", () => {
    expect(galerij).not.toMatch(/<img|\.photo|loading="lazy"/);
    expect(galerij).not.toContain("overflow-x-auto");
    expect(galerij).not.toMatch(/hyphens-auto|overflow-wrap:anywhere/);
  });

  it("toegankelijk: zoekveld met label, knoppen met aria-pressed, aankondiging van het aantal", () => {
    expect(galerij).toContain('type="search"');
    expect(galerij).toMatch(/<label htmlFor=\{`\$\{id\}-zoek`\}/);
    expect(galerij).toMatch(/<label htmlFor=\{`\$\{id\}-branche`\}/);
    expect(galerij).toContain("aria-pressed={actief}");
    expect(galerij).toContain('aria-live="polite"');
    // tikdoel van minstens 44 px
    expect(galerij).toContain("min-h-[3.5rem]");
    expect(galerij).toContain("min-h-[44px]");
  });

  it("Enter in het zoekveld dient nooit het formulier van de wizard in", () => {
    expect(galerij).toContain("e.preventDefault();");
    expect(galerij).toContain("e.stopPropagation();");
  });

  it("geen nieuwe kleurklasse zonder regel voor de donkere modus: alleen klassen die al een regel hebben", () => {
    const css = lees("app/globals.css");
    for (const klasse of ["text-ink", "text-neutralx-600", "text-neutralx-500", "bg-white", "border-hair", "border-hairstrong", "bg-brand-50", "hover\\\\:bg-paper-soft", "text-brand-600", "divide-hair"]) {
      expect(css, klasse).toMatch(new RegExp(`\\.app-scope\\[data-theme="dark"\\] \\.${klasse}`));
    }
  });

  it("de wizard en /klus-plaatsen gebruiken hem met 'Of vul het zelf in'", () => {
    const form = lees("components/app/NewShiftForm.tsx");
    expect(form).toContain("teksten={locale === \"en\" ? SJABLOON_EN : SJABLOON_NL}");
    expect(form).toContain("onEigen={() => titelRef.current?.focus()}");
    expect(lees("components/marketing/KlusConcept.tsx")).toContain("onEigen={() => setTpl(ANDERS)}");
  });

  // 23 nov 2026 (schermcontrole van de live site): onder de kiezer op /klus-plaatsen stond nog een gewone keuzelijst "Functie" voor
  // dezelfde keuze, en de kiezer heette "(optioneel)" terwijl Vakkenvuller al was voorgekozen. Nu is de kiezer de functiekeuze.
  it("/klus-plaatsen heeft één bediening voor de functie: de kiezer, zonder (optioneel) en zonder tweede keuzelijst", () => {
    const concept = lees("components/marketing/KlusConcept.tsx");
    expect(concept).toContain("<SjabloonGalerij");
    expect(concept).toMatch(/kop="Kies een functie"\s+verplicht\s/);
    expect(concept).not.toMatch(/<select data-track="klus-functie"/);
    expect(concept).not.toContain("<optgroup");
    expect(concept).not.toContain("Iets anders");
    expect(concept).not.toContain("groepen.map");
    // de voorgekozen functie en "Of vul het zelf in" werken zoals voorheen
    expect(concept).toContain("gekozen={tpl === ANDERS ? \"\" : tpl}");
    expect(concept).toContain("onKies={(key) => pickTemplate(key)}");
    expect(concept).toContain("{tpl === ANDERS ? (");
  });

  it("de kiezer laat (optioneel) weg als hij de functiekeuze van de pagina is, en houdt het in de wizard van de werkgever", () => {
    expect(galerij).toContain("{!verplicht && <span");
    expect(galerij).toContain("verplicht = false");
    const form = lees("components/app/NewShiftForm.tsx");
    expect(form).toContain("<SjabloonGalerij");
    expect(form).not.toContain("verplicht");
  });

  it("het bewaarde concept en de server-opslag blijven werken: de functie komt nog steeds uit de gekozen sjabloon of de eigen naam", () => {
    const concept = lees("components/marketing/KlusConcept.tsx");
    expect(concept).toContain('const title = tpl === ANDERS ? eigen.trim() : (templates.find((t) => t.key === tpl)?.label ?? "");');
    expect(concept).toContain("localStorage.setItem(CONCEPT_KEY, JSON.stringify(concept));");
    expect(concept).toMatch(/const concept: Concept = \{\s*v: 1,\s*title,/);
    // de functie begint voorgekozen (via ?functie= of de eerste) en een andere functie neemt tarief, pauze en omschrijving mee
    expect(concept).toContain("const first = templates.find((t) => t.key === initial.templateKey) ?? templates[0];");
    expect(concept).toContain("setBreakMinutes(t.breakMinutes);");
  });
});
