import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VASTE_PAGINAS, isStandaardPaginaIndeling, isVastePagina, normalizePaginaIndeling, standaardPaginaIndeling, zichtbareSecties, type VastePaginaId } from "@/lib/ontwerp/vaste-paginas";

// De indeling van de vaste pagina's (Site-ontwerper, tabblad Pagina's, 13 nov): de onderdelen onder de kop verslepen en
// verbergen. Zonder eigen indeling is een pagina precies zoals hij was.

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));

import { getPaginaIndeling, getPaginaIndelingen, resetPaginaIndeling, setPaginaIndeling } from "@/lib/ontwerp/vaste-paginas-store";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const PAGINAS = Object.keys(VASTE_PAGINAS) as VastePaginaId[];
const OUD: Record<VastePaginaId, string[]> = {
  "voor-bedrijven": ["systeem", "cijfers", "rekentools", "faq", "slot"],
  "voor-freelancers": ["voordelen", "stappen", "faq", "slot"],
  prijzen: ["tarieven", "api", "faq", "slot"],
  "over-ons": ["verhaal", "oprichter", "uitgangspunten", "werkenbij", "slot"],
  uitzendbureau: ["pijlers", "verwachtingen", "stappen", "fasen", "ervaring", "routes", "verloning", "werkgevers", "faq", "slot"],
  beveiliging: ["cijfers", "maatregelen", "logboek", "melden", "slot"],
  contact: ["email", "direct", "google"],
  "voor-bureaus": ["pakketten", "waarom", "faq", "slot"],
  abonnementen: ["pakketten", "faq", "slot"],
  "werkgever-start": ["cijfers", "volgers", "beoordelingen", "werk", "berichten", "facturen"],
};
// het startscherm van de werkgevers-app staat buiten de site
const bestand = (p: VastePaginaId) => (p === "werkgever-start" ? "app/werkgever/page.tsx" : `app/(marketing)/${p}/page.tsx`);

beforeEach(() => kv.clear());

describe("de standaard is de oude pagina", () => {
  it("dezelfde onderdelen in dezelfde volgorde, niets verborgen", () => {
    for (const p of PAGINAS) {
      expect(standaardPaginaIndeling(p)).toEqual({ volgorde: OUD[p], verborgen: [] });
      expect(zichtbareSecties(p, null)).toEqual(OUD[p]);
      expect(isStandaardPaginaIndeling(p, standaardPaginaIndeling(p))).toBe(true);
    }
  });

  it("elk onderdeel heeft een naam en een uitleg in een gewone zin", () => {
    for (const p of PAGINAS) {
      const s = VASTE_PAGINAS[p].secties;
      expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
      for (const x of s) {
        expect(x.naam.length, x.id).toBeGreaterThan(3);
        expect(x.uitleg.endsWith("."), x.id).toBe(true);
      }
      expect(VASTE_PAGINAS[p].pad).toBe(p === "werkgever-start" ? "/werkgever" : `/${p}`);
    }
  });
});

describe("een eigen indeling", () => {
  it("verslepen en verbergen", () => {
    const i = normalizePaginaIndeling("voor-bedrijven", { volgorde: ["faq", "systeem", "cijfers", "rekentools", "slot"], verborgen: ["cijfers"] });
    expect(zichtbareSecties("voor-bedrijven", i)).toEqual(["faq", "systeem", "rekentools", "slot"]);
    expect(isStandaardPaginaIndeling("voor-bedrijven", i)).toBe(false);
  });

  it("onbekende en dubbele onderdelen vallen weg; wat ontbreekt komt achteraan", () => {
    const i = normalizePaginaIndeling("voor-freelancers", { volgorde: ["slot", "slot", "constructor", "systeem", 4, "faq"], verborgen: ["toString", "faq", "faq"] });
    expect(i).toEqual({ volgorde: ["slot", "faq", "voordelen", "stappen"], verborgen: ["faq"] });
  });

  it("onleesbare invoer geeft de standaard", () => {
    for (const raw of [null, undefined, "x", 3, [], { volgorde: "x", verborgen: 4 }]) expect(normalizePaginaIndeling("voor-bedrijven", raw)).toEqual(standaardPaginaIndeling("voor-bedrijven"));
  });

  it("alleen de bekende pagina's tellen, geen sleutel uit het prototype", () => {
    expect(isVastePagina("voor-bedrijven")).toBe(true);
    for (const v of ["constructor", "toString", "klussen", "", null, 3]) expect(isVastePagina(v)).toBe(false);
  });
});

describe("de opslag", () => {
  it("geen eigen versie = null; bewaren en teruglezen per pagina; gelijk aan de standaard wist hem", async () => {
    expect(await getPaginaIndeling("voor-bedrijven")).toBeNull();
    const eigen = await setPaginaIndeling("voor-bedrijven", { volgorde: ["faq", ...OUD["voor-bedrijven"]], verborgen: ["cijfers"] });
    expect(eigen?.volgorde[0]).toBe("faq");
    // de andere pagina blijft de standaard
    expect(await getPaginaIndeling("voor-freelancers")).toBeNull();
    await setPaginaIndeling("voor-freelancers", { volgorde: OUD["voor-freelancers"], verborgen: ["stappen"] });
    expect(Object.keys(await getPaginaIndelingen()).sort()).toEqual(["voor-bedrijven", "voor-freelancers"]);
    expect(PAGINAS).toHaveLength(10);
    expect(await setPaginaIndeling("voor-bedrijven", standaardPaginaIndeling("voor-bedrijven"))).toBeNull();
    expect((await getPaginaIndeling("voor-freelancers"))?.verborgen).toEqual(["stappen"]);
    await resetPaginaIndeling("voor-freelancers");
    // niets eigen meer = de sleutel weg
    expect(kv.has("ontwerp:vaste-paginas")).toBe(false);
  });

  it("rommel in de opslag breekt de pagina niet", async () => {
    kv.set("ontwerp:vaste-paginas", { constructor: { volgorde: ["x"] }, "voor-bedrijven": "kapot", onbekend: 3 });
    expect(await getPaginaIndeling("voor-bedrijven")).toEqual(standaardPaginaIndeling("voor-bedrijven"));
    expect(zichtbareSecties("voor-bedrijven", await getPaginaIndeling("voor-bedrijven"))).toEqual(OUD["voor-bedrijven"]);
  });
});

describe("de pagina's, het paneel en de route", () => {
  it("elke pagina heeft precies de onderdelen uit de lijst, in de oude volgorde, en toont ze via de indeling", () => {
    for (const p of PAGINAS) {
      const src = bron(bestand(p));
      expect(src).toContain(`zichtbareSecties("${p}", await getPaginaIndeling("${p}"))`);
      expect(src).toContain("<Fragment key={id}>{onderdelen[id]}</Fragment>");
      const sleutels = [...src.matchAll(/^ {4}([a-z]+): \($/gm)].map((m) => m[1]);
      expect(sleutels, p).toEqual(OUD[p]);
      // de kop blijft vast bovenaan: hij staat in de pagina zelf, vóór de onderdelen
      const begin = src.indexOf("  return (\n    <>");
      expect(begin).toBeGreaterThan(0);
      expect(src.slice(begin, src.indexOf("zichtbaar.map(")).split("\n").length, p).toBeGreaterThan(5);
    }
  });

  it("de vragen voor Google (FAQPage) staan er alleen als het onderdeel met de vragen zichtbaar is", () => {
    const src = bron("app/(marketing)/uitzendbureau/page.tsx");
    const voorwaarde = src.indexOf('{zichtbaar.includes("faq") ? (');
    const faqPage = src.indexOf('"@type": "FAQPage"');
    expect(voorwaarde).toBeGreaterThan(0);
    expect(faqPage).toBeGreaterThan(voorwaarde);
    // er staat maar één zo'n blok, en het sluit met ": null" vóór de rest van de pagina
    expect(src.split('"@type": "FAQPage"')).toHaveLength(2);
    expect(src.indexOf(") : null}", faqPage)).toBeLessThan(src.indexOf("<UitzendJobBoard"));
    // geen andere vaste pagina heeft FAQ-gegevens buiten de indeling om
    for (const p of PAGINAS) if (p !== "uitzendbureau") expect(bron(bestand(p)), p).not.toContain("FAQPage");
  });
  it("het paneel staat in het tabblad Pagina's, met verslepen", () => {
    const ontwerper = bron("components/admin/ontwerper/Ontwerper.tsx");
    expect(ontwerper).toContain("<VastePaginasPaneel onVoorbeeldPad={setVoorbeeldPad} onVernieuw={verversVoorbeeld} />");
    const paneel = bron("components/admin/ontwerper/VastePaginasPaneel.tsx");
    expect(paneel).toContain("{...sleep.lijst}");
    expect(paneel).toContain("<SleepGreep");
    expect(paneel).toContain('data-sleep-rij=""');
    // een clientbestand: alleen het type uit de regels, niet de opslag
    expect(paneel).not.toContain("vaste-paginas-store");
  });

  it("de route is alleen voor de platformbeheerder", () => {
    const route = bron("app/api/admin/ontwerp/vaste-paginas/route.ts");
    expect(route.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g) ?? []).toHaveLength(3);
    // pagina's met een bewaartijd worden na het opslaan meteen ververst
    expect(route.match(/revalidatePath\(VASTE_PAGINAS\[pagina\]\.pad\)/g) ?? []).toHaveLength(2);
  });
});
