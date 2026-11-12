import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { vulIn } from "@/lib/i18n/vul-in";

// De werker-app (/dashboard) is vijftalig (NL/EN/PL/RO/UK). Een tekst die los in een component staat, blijft voor
// een werker in het Pools of Roemeens Nederlands. Hier: elke sleutel van de woordenlijst bestaat in alle vijf de
// talen, is niet leeg en heeft dezelfde plaatshouders, en de omgezette schermen halen hun tekst uit de lijst.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;

/** Alle blaadjes van een woordenboek als "pad" → tekst (functies en lijsten: alleen de vorm). */
function blaadjes(waarde: unknown, pad: string, uit: Map<string, string>): void {
  if (typeof waarde === "string") uit.set(pad, waarde);
  else if (typeof waarde === "function") uit.set(pad, "()");
  else if (Array.isArray(waarde)) {
    uit.set(`${pad}[]`, String(waarde.length));
    waarde.forEach((w, i) => blaadjes(w, `${pad}[${i}]`, uit));
  } else if (waarde && typeof waarde === "object") {
    for (const [k, v] of Object.entries(waarde)) blaadjes(v, pad ? `${pad}.${k}` : k, uit);
  }
}

const plaatshouders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

// Elke sectie die losse tekst uit een component haalt komt hier bij (de naam in de woordenlijst).
const SECTIES = ["los", "verzekering", "paspoort", "uitzendContract"] as const;

describe("woordenlijst van de werker-app: omgezette secties", () => {
  const per = Object.fromEntries(
    TALEN.map((t) => {
      const m = new Map<string, string>();
      for (const sectie of SECTIES) blaadjes((FREELANCER_DICTS[t] as unknown as Record<string, unknown>)[sectie], sectie, m);
      return [t, m];
    }),
  ) as Record<(typeof TALEN)[number], Map<string, string>>;

  it("elke sleutel staat in alle vijf de talen", () => {
    const sleutels = [...per.nl.keys()];
    expect(sleutels.length).toBeGreaterThan(120);
    for (const sectie of SECTIES) expect(sleutels.some((k) => k.startsWith(`${sectie}.`)), sectie).toBe(true);
    for (const t of TALEN) expect([...per[t].keys()].sort(), t).toEqual([...sleutels].sort());
  });

  it("niets is leeg, en de plaatshouders ({naam}, {n}, …) zijn in elke taal dezelfde", () => {
    for (const [pad, nl] of per.nl) {
      for (const t of TALEN) {
        const tekst = per[t].get(pad) ?? "";
        expect(tekst.trim().length, `${t} ${pad}`).toBeGreaterThan(0);
        expect(plaatshouders(tekst), `${t} ${pad}`).toBe(plaatshouders(nl));
      }
    }
  });

  it("een andere taal is echt vertaald, niet de Nederlandse tekst teruggezet (behalve woorden die gelijk zijn)", () => {
    for (const t of ["en", "pl", "ro", "uk"] as const) {
      const gelijk = [...per.nl].filter(([pad, nl]) => nl.length > 12 && per[t].get(pad) === nl);
      expect(gelijk, t).toEqual([]);
    }
  });

  it("de maanden zijn twaalf en vulIn zet er waarden in", () => {
    for (const t of TALEN) expect(FREELANCER_DICTS[t].los.ervaring.maanden, t).toHaveLength(12);
    expect(vulIn(FREELANCER_DICTS.pl.los.menu.verborgen, { naam: "Acme" })).toBe("Ukryto: Acme");
    expect(vulIn("{n} van 5", { n: 4 })).toBe("4 van 5");
    expect(vulIn("{onbekend} blijft", {})).toBe("{onbekend} blijft");
  });
});

describe("omgezette schermen halen hun tekst uit de woordenlijst", () => {
  const ROOT = process.cwd();
  const bestanden = [
    "HoursCorrectionPrompt",
    "ShiftMenu",
    "HiddenEmployersList",
    "ShiftMap",
    "ErvaringLijst",
    "CancellationClaimButton",
    "CompanyReviewInline",
    "PickSubstituteButton",
    "ReplacementTakeoverButton",
    "PassportShare",
    "UitzendContractCard",
  ];
  for (const naam of bestanden) {
    it(`${naam} gebruikt useFT en heeft geen losse Nederlandse zin meer`, () => {
      const src = readFileSync(path.join(ROOT, "components/app", `${naam}.tsx`), "utf8");
      expect(src).toMatch(/useFT\(\)(\.\w+)?/);
      // de oude zinnen mogen er niet meer in staan
      for (const zin of ["Kopieer link", "Eerdere overeenkomsten", "Annuleer", "Toon weer", "Laden…", "Kaart niet beschikbaar", "Meer opties", "Jouw review", "Kies als vervanger", "Neem klus over", "Verwijderen mislukt", "Ja, akkoord"]) {
        expect(src, zin).not.toContain(zin);
      }
    });
  }
});

describe("omgezette serverpagina's halen hun tekst uit de woordenlijst", () => {
  const ROOT = process.cwd();
  for (const [pagina, oud] of [
    ["app/dashboard/verzekering/page.tsx", ["Wat is gedekt", "Een schade melden", "Jouw verzekeringsbewijs"]],
    ["app/dashboard/paspoort/page.tsx", ["Nog geen profiel", "Profiel in opbouw"]],
  ] as const) {
    it(`${pagina} gebruikt getFreelancerDict en heeft de oude zinnen niet meer`, () => {
      const src = readFileSync(path.join(ROOT, pagina), "utf8");
      expect(src).toContain("getFreelancerDict");
      for (const zin of oud) expect(src, zin).not.toContain(zin);
    });
  }
});
