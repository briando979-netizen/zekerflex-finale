import { describe, expect, it } from "vitest";
import { ALLE_ONDERDELEN, FASES, leesBeoordelingen, voortgang } from "@/lib/rijschool/leskaart";
import { AANTAL_VRAGEN, bewaarBeste, leesTheorie, ronde, THEORIE_ONDERDELEN } from "@/lib/rijschool/theorie";
import { websiteSchema, websiteVan, whatsappNummer } from "@/lib/rijschool/website";

describe("rijschool leskaart", () => {
  it("elk onderdeel heeft een unieke sleutel, uitleg en stappen", () => {
    const sleutels = ALLE_ONDERDELEN.map((o) => o.sleutel);
    expect(new Set(sleutels).size).toBe(sleutels.length);
    for (const o of ALLE_ONDERDELEN) {
      expect(o.uitleg.length).toBeGreaterThan(20);
      expect(o.stappen.length).toBeGreaterThanOrEqual(3);
    }
    expect(FASES.length).toBe(6);
  });

  it("onbekende onderdelen en scores buiten 1–5 vallen weg", () => {
    expect(leesBeoordelingen({ rotondes: { score: 4, notitie: " goed " }, onzin: { score: 3 }, inhalen: { score: 9 }, keren: { score: 2.5 } })).toEqual({
      rotondes: { score: 4, notitie: "goed" },
    });
    expect(leesBeoordelingen(null)).toEqual({});
  });

  it("de laatste beoordeling per onderdeel telt", () => {
    const v = voortgang([
      { at: "2026-11-02T09:00:00Z", beoordeling: { rotondes: { score: 4 } } },
      { at: "2026-10-20T09:00:00Z", beoordeling: { rotondes: { score: 1 }, inhalen: { score: 2 } } },
    ]);
    expect(v.stand.rotondes?.score).toBe(4);
    expect(v.stand.inhalen?.score).toBe(2);
    expect(v.aandacht).toEqual(["inhalen"]);
    expect(v.examenklaar).toBe(false);
    expect(v.procent).toBe(Math.round((6 / (ALLE_ONDERDELEN.length * 5)) * 100));
  });

  it("examenklaar als alles minstens zelfstandig is", () => {
    const alles = Object.fromEntries(ALLE_ONDERDELEN.map((o) => [o.sleutel, { score: 4 }]));
    const v = voortgang([{ at: "2026-11-02T09:00:00Z", beoordeling: alles }]);
    expect(v.examenklaar).toBe(true);
    expect(v.procent).toBe(80);
    expect(v.perFase.every((f) => f.procent === 80)).toBe(true);
  });
});

describe("rijschool theorie", () => {
  it("een ronde schudt de keuzes en wijst het goede antwoord aan", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const vragen = ronde("mix", 10, random);
    expect(vragen).toHaveLength(10);
    expect(new Set(vragen.map((v) => v.id)).size).toBe(10);
    for (const v of vragen) {
      expect(v.goed).toBeGreaterThanOrEqual(0);
      expect(v.opties[v.goed]).toBeTruthy();
    }
    // het goede antwoord staat niet altijd vooraan
    expect(vragen.some((v) => v.goed !== 0)).toBe(true);
  });

  it("elk onderdeel heeft vragen", () => {
    for (const o of THEORIE_ONDERDELEN) expect(ronde(o.sleutel, 50).length).toBeGreaterThanOrEqual(8);
    expect(AANTAL_VRAGEN).toBeGreaterThanOrEqual(36);
  });

  it("alleen een betere ronde wordt bewaard", () => {
    const at = "2026-11-03T10:00:00Z";
    let t = bewaarBeste({}, "voorrang", { goed: 6, totaal: 10, at });
    t = bewaarBeste(t, "voorrang", { goed: 5, totaal: 10, at });
    expect(t.voorrang?.goed).toBe(6);
    t = bewaarBeste(t, "voorrang", { goed: 9, totaal: 10, at });
    expect(t.voorrang?.goed).toBe(9);
    expect(leesTheorie({ voorrang: { goed: 11, totaal: 10, at }, onbekend: { goed: 1, totaal: 1, at } })).toEqual({});
  });
});

describe("rijschool website", () => {
  it("vult standaardteksten aan met naam en plaats", () => {
    const w = websiteVan({}, { naam: "Rijschool Vlot", plaats: "Zwolle" });
    expect(w.kop).toBe("Rijles in Zwolle bij Rijschool Vlot");
    expect(w.faq.length).toBeGreaterThan(0);
    expect(websiteVan({ kop: "Eigen kop" }, { naam: "X", plaats: "" }).kop).toBe("Eigen kop");
    expect(websiteVan({}, { naam: "X", plaats: "" }).kop).toBe("Rijles in de regio bij X");
  });

  it("ongeldige opgeslagen keuzes vallen terug op de standaard", () => {
    expect(websiteVan({ slagingspercentage: 300 }, { naam: "X", plaats: "Y" }).slagingspercentage).toBeNull();
    expect(websiteSchema.safeParse({ ...websiteVan({}, { naam: "X", plaats: "Y" }), whatsapp: "bel me" }).success).toBe(false);
  });

  it("WhatsApp-nummer naar internationaal formaat", () => {
    expect(whatsappNummer("06 12345678")).toBe("31612345678");
    expect(whatsappNummer("+31 6 1234 5678")).toBe("31612345678");
    expect(whatsappNummer("12345")).toBeNull();
  });
});
