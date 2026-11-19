import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leesLetterMaten, maakMeter, schatMeter } from "@/lib/advertentie/letter-maat";
import { logoBoom2, merkwoord } from "@/lib/logo/ontwerp2";
import { BRANCHES, LOGO_AANTAL, SFEER_SJABLONEN, SFEREN, SJABLONEN, VARIANT_IDS, logoAantal, logoBesluit, logoVrij, type Logo, type LogoNr } from "@/lib/logo/regels";
import { logosVan, sjablonenVan } from "@/lib/logo/sjablonen";
import { heeftTeken, tekenNamen, tekenVerhouding } from "@/lib/logo/tekens";
import { BRANCHE_TEKENS, SFEER_TEKENS, TREFWOORDEN, kiesTekens, tekensUitTekst } from "@/lib/logo/tekens/trefwoorden";

// Logo maker versie 2: negen logo's per aanvraag, per sfeer een eigen set, met tekens uit een open bibliotheek die bij de
// woorden van het bedrijf passen. De watermerkbeslissing blijft even streng (zie ook tests/logo-maker.test.ts).

const ROOT = join(__dirname, "..");
const basis = { naam: "Urban Wolf", branche: "kleding", kleur: "rood", sfeer: "streetwear" } as const;

describe("de tekens (lib/logo/tekens)", () => {
  it("staan in de repo, met licentie en bron, en zijn niet te groot", () => {
    const map = join(ROOT, "lib", "logo", "tekens");
    expect(tekenNamen().length).toBeGreaterThanOrEqual(300);
    expect(statSync(join(map, "phosphor-fill.json")).size).toBeLessThan(300_000);
    expect(readFileSync(join(map, "LICENSE-phosphor.txt"), "utf8")).toMatch(/^MIT License/);
    const leesmij = readFileSync(join(map, "README.md"), "utf8");
    expect(leesmij).toContain("phosphor-icons/core");
    expect(leesmij).toContain("MIT");
    for (const naam of ["bicycle", "crown", "lightning", "mountains", "bread", "scissors"]) {
      expect(heeftTeken(naam), naam).toBe(true);
      expect(tekenVerhouding(naam)).toBeGreaterThan(0.3);
    }
    expect(heeftTeken("constructor")).toBe(false);
  });

  it("elke naam in de trefwoorden, per soort bedrijf en per sfeer bestaat", () => {
    const namen = [...TREFWOORDEN.map(([teken]) => teken), ...Object.values(BRANCHE_TEKENS).flat(), ...Object.values(SFEER_TEKENS).flat(), "star-four", "sparkle", "hexagon"];
    expect(namen.filter((n) => !heeftTeken(n))).toEqual([]);
    for (const b of BRANCHES) expect(Object.hasOwn(BRANCHE_TEKENS, b.id), b.id).toBe(true);
    for (const s of SFEREN) expect((SFEER_TEKENS[s.id] ?? []).length, s.id).toBe(3);
  });

  it("vindt het teken bij de woorden van het bedrijf, Nederlands en Engels", () => {
    const eerste = (naam: string, slogan?: string) => tekensUitTekst(naam, slogan)[0];
    expect(eerste("Fietsenmaker Van Dijk")).toBe("bicycle");
    expect(eerste("Bakkerij De Korenbloem")).toBe("bread");
    expect(eerste("Kapsalon Noor")).toBe("scissors");
    expect(eerste("Schildersbedrijf Jansen")).toBe("paint-roller");
    expect(eerste("Royal Kings")).toBe("crown");
    expect(eerste("Noordkaap", "Outdoor gear")).toBe("compass-rose");
    expect(eerste("Thunder Gym")).toBe("lightning");
    expect(eerste("Koffiebar Zuid")).toBe("coffee");
    expect(eerste("Hondenuitlaatservice Max")).toBe("dog");
    expect(eerste("Studio Lente")).toBe("aperture");
    // korte stammen moeten het hele woord zijn: geen ei bij "eigen", geen schild bij "schilder", geen vis bij "visie"
    expect(tekensUitTekst("Eigen Visie")).not.toContain("egg");
    expect(tekensUitTekst("Eigen Visie")).not.toContain("fish");
    expect(tekensUitTekst("Schildersbedrijf")).not.toContain("shield-star");
    expect(tekensUitTekst("Xqz")).toEqual([]);
  });

  it("zonder treffer volgt het teken de soort bedrijf en dan de sfeer; een kledingmerk krijgt het teken van zijn sfeer", () => {
    expect(kiesTekens({ naam: "Xqz", branche: "bouw", sfeer: "strak" })).toEqual({ tekens: ["hammer", "buildings", "hard-hat"], eigen: false });
    expect(kiesTekens({ naam: "Xqz", branche: "kleding", sfeer: "gothic" })).toEqual({ tekens: ["crown", "sword", "skull"], eigen: false });
    expect(kiesTekens({ naam: "Xqz", branche: "anders", sfeer: "luxe" }).tekens[0]).toBe("diamond");
    const fiets = kiesTekens({ naam: "Fietsenmaker Van Dijk", branche: "techniek", sfeer: "strak" });
    expect(fiets.eigen).toBe(true);
    expect(fiets.tekens[0]).toBe("bicycle");
    expect(new Set(fiets.tekens).size).toBe(3);
  });

  it("de tekengegevens komen niet in de bundel van de browser", () => {
    const client = [join(ROOT, "lib", "logo", "regels.ts"), ...["logo", "studio", "advertentie", "starters"].flatMap((m) => readdirSync(join(ROOT, "components", "marketing", m)).map((f) => join(ROOT, "components", "marketing", m, f))), join(ROOT, "components", "admin", "AdvertentieBeheer.tsx")];
    for (const bestand of client) expect(readFileSync(bestand, "utf8"), bestand).not.toMatch(/from "@\/lib\/logo\/(tekens|sjablonen|ontwerp)|phosphor-fill/);
  });
});

describe("negen logo's per aanvraag", () => {
  it("elke sfeer heeft negen verschillende sjablonen die bestaan", () => {
    for (const s of SFEREN) {
      const lijst = SFEER_SJABLONEN[s.id];
      expect(lijst.length, s.id).toBe(LOGO_AANTAL);
      expect(new Set(lijst).size, s.id).toBe(LOGO_AANTAL);
      for (const id of lijst) expect(Object.hasOwn(SJABLONEN, id), id).toBe(true);
    }
  });

  it("het negende is altijd het beeldmerk; met een eigen teken is het achtste het embleem", () => {
    expect(sjablonenVan({ naam: "Xqz", branche: "anders", sfeer: "sport" })[8]).toBe("teken");
    expect(sjablonenVan({ naam: "Xqz", branche: "anders", sfeer: "sport" })).not.toContain("embleem");
    const fiets = sjablonenVan({ naam: "Fietsenmaker Van Dijk", branche: "techniek", sfeer: "sport" });
    expect(fiets[7]).toBe("embleem");
    expect(new Set(fiets).size).toBe(9);
    expect(logosVan({ versie: 2, invoer: basis }).map((l) => l.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // een aanvraag van vóór versie 2 houdt zijn zes logo's
    expect(logosVan({ invoer: basis }).length).toBe(6);
    expect(logoAantal({})).toBe(6);
    expect(logoAantal({ versie: 2 })).toBe(9);
  });

  it("een korte naam is het merkwoord, een lange wordt een afkorting", () => {
    expect(merkwoord("NOVA")).toBe("NOVA");
    expect(merkwoord("Royal Kings")).toBe("Royal Kings");
    expect(merkwoord("Schildersbedrijf Van der Westhuizen")).toBe("SW");
    expect(merkwoord("Bakkerij De Korenbloem")).toBe("BK");
    expect(merkwoord("Jansen & Zonen Installatietechniek")).toBe("JZI");
    expect(merkwoord("Arbeidsongeschiktheid")).toBe("A");
  });

  it("elk logo van elke sfeer geeft een boom, op elke ondergrond en met een lange, korte en vreemde naam", () => {
    for (const s of SFEREN) {
      for (const naam of ["Jo", "Urban Wolf", "Schildersbedrijf Van der Westhuizen & Zonen", "Café Zoë 24/7"]) {
        for (let nr = 1; nr <= 9; nr++) {
          expect(() => logoBoom2(nr as LogoNr, { naam, slogan: "Sinds jaar en dag", branche: "bouw", kleur: "blauw", sfeer: s.id }, { soort: "thema", thema: "donker" }, 200, true, schatMeter), `${s.id} ${nr} ${naam}`).not.toThrow();
        }
      }
    }
    for (const v of VARIANT_IDS) expect(() => logoBoom2(3, basis, { soort: "variant", variant: v }, 200, false, schatMeter)).not.toThrow();
    const stijl = (og: Parameters<typeof logoBoom2>[2]) => (logoBoom2(1, basis, og, 200, false, schatMeter).boom.props as { style: { background?: string } }).style.background;
    expect(stijl({ soort: "thema", thema: "donker" })).toBe("#0B0B0C");
    expect(stijl({ soort: "thema", thema: "licht" })).toBe("#FFFFFF");
    expect(stijl({ soort: "variant", variant: "kleur-wit" })).toBe("#FFFFFF");
    for (const v of ["kleur", "wit", "zwart"] as const) expect(stijl({ soort: "variant", variant: v }), v).toBeUndefined();
    expect(logoBoom2(1, basis, { soort: "variant", variant: "icoon" }, 256, false, schatMeter)).toMatchObject({ breedte: 256, hoogte: 256 });
    expect(JSON.stringify(logoBoom2(1, basis, { soort: "thema", thema: "donker" }, 200, true, schatMeter).boom)).toContain("VOORBEELD");
  });
});

describe("het voorbeeld van versie 2: ondergrond kiezen verandert niets aan de bescherming", () => {
  const rij = (status: Logo["status"], gekozen?: LogoNr): Pick<Logo, "status" | "aanvraag" | "versie"> => ({ versie: 2, status, ...(gekozen ? { aanvraag: { logo: gekozen, naam: "Test", email: "test@voorbeeld.test", op: "2026-11-19T10:00:00.000Z" } } : {}) });

  it("niet vrijgegeven: klein en met watermerk op elke ondergrond, wat er ook gevraagd wordt", () => {
    for (const thema of ["donker", "licht", "kleur", undefined] as const) {
      for (const variant of VARIANT_IDS) {
        for (let nr = 1; nr <= 9; nr++) {
          expect(logoBesluit({ logo: rij("aangevraagd", 3), nr: nr as LogoNr, beheerder: false, variant, thema })).toEqual({ watermerk: true, thema: thema ?? "donker", variant: "kleur-wit", breedte: 400, hoogte: 300 });
        }
      }
    }
  });

  it("vrijgegeven: alleen het gekozen logo is schoon; de andere acht houden hun watermerk", () => {
    const vrij = rij("vrijgegeven", 8);
    expect(logoBesluit({ logo: vrij, nr: 8, beheerder: false, variant: "wit", thema: "licht" })).toEqual({ watermerk: false, thema: null, variant: "wit", breedte: 2400, hoogte: 1800 });
    for (const nr of [1, 2, 3, 4, 5, 6, 7, 9] as LogoNr[]) expect(logoBesluit({ logo: vrij, nr, beheerder: false, variant: "kleur" }).watermerk, String(nr)).toBe(true);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => logoVrij(vrij, n as LogoNr))).toEqual([8]);
  });

  it("de route weigert een nummer buiten de set van de aanvraag en houdt het geheugen per ondergrond apart", () => {
    const route = readFileSync(join(ROOT, "app", "api", "logo-maker", "[id]", "beeld", "route.ts"), "utf8");
    expect(route).toContain("nr > logoAantal(logo)");
    expect(route).toContain("`logo:${id}:${nr}:${besluit.thema ?? \"v1\"}`");
    expect(readFileSync(join(ROOT, "lib", "logo", "store.ts"), "utf8")).toContain("aanvraag.logo > logoAantal(logo)");
  });
});

describe("de breedte van tekst uit het lettertype", () => {
  it("leest de maten uit een TTF en meet een woord", () => {
    const map = join(ROOT, "public", "fonts", "advertentie");
    expect(existsSync(join(map, "Kanit-BlackItalic.ttf"))).toBe(true);
    const kanit = leesLetterMaten(readFileSync(join(map, "Kanit-BlackItalic.ttf")));
    const meet = maakMeter({ Kanit: kanit });
    const w = meet("Kanit", "NOVA");
    expect(w).toBeGreaterThan(2);
    expect(w).toBeLessThan(3.6);
    expect(meet("Kanit", "II")).toBeLessThan(meet("Kanit", "WW"));
    // een teken dat het lettertype niet heeft en een onbekend lettertype tellen als een gemiddelde letter
    expect(meet("Kanit", "\u{4E2D}")).toBe(0.6);
    expect(meet("Bestaat niet", "ab")).toBe(1.2);
    expect(kanit.tekens.has(0x41)).toBe(true);
  });
});
