import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BLOKTEKST_SYSTEEM, KOP_MAX, TEKST_MAX, blokTekstInvoer, blokTekstVraag, getallenTeControleren, leesBlokTekst } from "@/lib/sites/bloktekst";

// De bouwer → "Schrijf met AI" (13 nov): een voorstel voor de kop en de tekst van één blok. Het model krijgt alleen wat de
// ondernemer invulde, zijn antwoord wordt soepel gelezen, en er verandert niets tot de ondernemer het voorstel gebruikt.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const INVOER = blokTekstInvoer({ soort: "Tekst", bedrijf: "Bakkerij Jansen", plaats: "Zwolle", kop: "Over ons", tekst: "Wij bakken sinds 1998 elke dag vers brood.", wens: "korter" });

describe("wat het model krijgt", () => {
  it("alleen wat ingevuld is; lege velden gaan niet mee", () => {
    const vraag = blokTekstVraag(blokTekstInvoer({ soort: "Tekst", bedrijf: "Bakkerij Jansen" }));
    expect(vraag).toContain('"bedrijf": "Bakkerij Jansen"');
    for (const sleutel of ["plaats", "huidigeKop", "huidigeTekst", "wensVanDeOndernemer"]) expect(vraag).not.toContain(sleutel);
    expect(blokTekstVraag(INVOER)).toContain('"wensVanDeOndernemer": "korter"');
  });

  it("de opdracht verbiedt verzinnen en vraagt JSON", () => {
    expect(BLOKTEKST_SYSTEEM).toContain("Verzin niets");
    expect(BLOKTEKST_SYSTEEM).toContain("keurmerken");
    expect(BLOKTEKST_SYSTEEM).toContain('{"kop": "...", "tekst": "..."}');
  });

  it("invoer wordt begrensd en rommel wordt leeg", () => {
    const i = blokTekstInvoer({ soort: 4, bedrijf: "x".repeat(500), tekst: "y".repeat(9000), wens: null });
    expect(i.soort).toBe("");
    expect(i.bedrijf).toHaveLength(100);
    expect(i.tekst).toHaveLength(2000);
    expect(i.wens).toBe("");
  });
});

describe("het antwoord soepel lezen", () => {
  it("gewoon antwoord, zonder opmaak en zonder punt achter de kop", () => {
    expect(leesBlokTekst({ kop: "**Vers brood, elke dag.**", tekst: "## Welkom\n- Wij bakken elke dag vers.\n- Kom langs in Zwolle." })).toEqual({ kop: "Vers brood, elke dag", tekst: "Welkom\nWij bakken elke dag vers.\nKom langs in Zwolle." });
  });

  it("een object of lijst waar tekst hoort, en andere sleutels", () => {
    expect(leesBlokTekst({ titel: "Welkom", text: ["Eerste zin hier.", "Tweede zin hier."] })).toEqual({ kop: "Welkom", tekst: "Eerste zin hier.\n\nTweede zin hier." });
    expect(leesBlokTekst({ kop: { nl: "Welkom" }, tekst: { a: "Wij helpen je graag verder." } })).toEqual({ kop: "Welkom", tekst: "Wij helpen je graag verder." });
  });

  it("te lang wordt op een woordgrens afgeknipt; HTML gaat eruit", () => {
    const u = leesBlokTekst({ kop: "k ".repeat(200), tekst: `<p>${"woord ".repeat(400)}</p><script>alert(1)</script>` });
    expect(u!.kop.length).toBeLessThanOrEqual(KOP_MAX);
    expect(u!.tekst.length).toBeLessThanOrEqual(TEKST_MAX);
    expect(u!.tekst).not.toMatch(/[<>]/);
    expect(u!.tekst.endsWith("woord")).toBe(true);
  });

  it("geen bruikbare tekst = null (dan krijgt de ondernemer een nette melding)", () => {
    for (const raw of [null, undefined, "tekst", 4, [], {}, { kop: "Alleen een kop" }, { tekst: "kort" }]) expect(leesBlokTekst(raw)).toBeNull();
  });
});

describe("getallen nalopen", () => {
  it("een getal dat de ondernemer zelf noemde is goed; een nieuw getal staat op de lijst", () => {
    expect(getallenTeControleren({ kop: "Al sinds 1998", tekst: "Meer dan 500 tevreden klanten en 25 soorten brood." }, INVOER)).toEqual(["500", "25"]);
    expect(getallenTeControleren({ kop: "Vers brood", tekst: "Elke dag vers, sinds 1998." }, INVOER)).toEqual([]);
  });
});

describe("de route en het scherm", () => {
  it("de route is voor de beheerder van het bedrijf, begrensd, en slaat niets op", () => {
    const route = bron("app/api/werkgever/sites/slim/bloktekst/route.ts");
    expect(route).toContain("const tenantId = await siteTenantOf(p);");
    expect(route).toContain('enforceRateLimit({ name: "site-bloktekst", identifier: tenantId');
    expect(route).not.toMatch(/prisma|kvSet|saveSite/);
    const ai = bron("lib/sites/bloktekst-ai.ts");
    expect(ai).not.toMatch(/prisma|kvSet|saveSite/);
    // het logboek krijgt alleen de soort fout, nooit de tekst
    expect(ai).toContain('logger.warn("bloktekst: AI gaf geen antwoord", { purpose: BLOKTEKST_PURPOSE, error: (err as Error).message.slice(0, 160) });');
  });

  it("er verandert niets tot de ondernemer 'Gebruik dit' kiest", () => {
    const hulp = bron("components/studio/BlokTekstHulp.tsx");
    expect(hulp.match(/onGebruik\(/g) ?? []).toHaveLength(1);
    expect(hulp.indexOf("onGebruik(")).toBeGreaterThan(hulp.indexOf('className="btn-primary"'));
    expect(hulp).toContain("Niet gebruiken");
    expect(hulp).not.toContain("useEffect");
    // een leeg voorstel voor de kop laat de eigen kop staan
    expect(hulp).toContain("kop: voorstel.kop || kop");
  });

  it("de hulp staat bij de blokken met een kop en een tekst, en de regels zijn veilig voor oude Safari", () => {
    const bouwer = bron("components/app/SiteBuilder.tsx");
    expect(bouwer.match(/\{schrijfHulp\(/g) ?? []).toHaveLength(3);
    expect(bouwer).toContain("key={block.id}");
    const regels = bron("lib/sites/bloktekst.ts");
    expect(regels).not.toMatch(/\(\?<[=!]/);
    expect(regels).not.toMatch(/^import /m);
  });
});
