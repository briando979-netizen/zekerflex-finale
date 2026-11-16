import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { koersDatumTekst, leesEcbKoersen, naarEuroCents } from "@/lib/integrations/wisselkoers";
import { leesRdw, rdwOmschrijving } from "@/lib/integrations/rdw";
import { dagenTot, leesAanbestedingen, voegSamen } from "@/lib/integrations/tenderned";
import { linkWaarschuwingen } from "@/lib/shop/link-product";
import { GRATIS_DIENSTEN } from "@/lib/gratis/diensten";
import { ADMIN_HUBS } from "@/lib/admin/nav";

// Drie gratis open bronnen (16 nov 2026, eigenaar: "go"): ECB-wisselkoersen (Winkel-AI), RDW Open Data (wagenpark) en
// TenderNed (aanbestedingen). Voorbeeldantwoorden zoals gemeten op 16 nov vanaf de server.

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("wisselkoersen van de ECB", () => {
  const XML = `<gesmes:Envelope><Cube><Cube time='2026-11-13'><Cube currency='USD' rate='1.1052'/><Cube currency='CNY' rate='7.3738'/><Cube currency='GBP' rate='0.83559'/></Cube></Cube></gesmes:Envelope>`;
  const k = leesEcbKoersen(XML);

  it("de dagkoersen gelezen, en omgerekend naar eurocenten", () => {
    expect(k).toEqual({ datum: "2026-11-13", koersen: { USD: 1.1052, CNY: 7.3738, GBP: 0.83559 } });
    expect(naarEuroCents(29, "USD", k)).toBe(26);
    expect(naarEuroCents(1000, "cny", k)).toBe(136);
    expect(naarEuroCents(1250, "EUR", k)).toBe(1250);
    expect(naarEuroCents(100, "JPY", k)).toBeNull();
    expect(naarEuroCents(100, "constructor", k)).toBeNull();
    expect(leesEcbKoersen("<html>storing</html>")).toBeNull();
    expect(koersDatumTekst("2026-11-13")).toBe("13 november 2026");
  });

  it("de Winkel-AI noemt de omgerekende prijs met de koersdatum, en zonder koers blijft het: zelf omrekenen", () => {
    const p = { titel: "Pen", omschrijving: "", fotos: [], prijsCents: 29, valuta: "USD" };
    expect(linkWaarschuwingen(p, { euroCents: 26, koersDatum: "13 november 2026" })[0]).toContain("Tegen de koers van de Europese Centrale Bank van 13 november 2026 is dat € 0,26");
    expect(linkWaarschuwingen(p)[0]).toContain("reken hem zelf om");
    expect(lees("components/admin/WinkelAI.tsx")).toContain("else if (d.inkoopEuroCents) setInkoop(");
  });
});

describe("RDW Open Data", () => {
  const AURIS = [{ kenteken: "16RSL9", voertuigsoort: "Personenauto", merk: "TOYOTA", handelsbenaming: "TOYOTA AURIS", vervaldatum_apk: "20270513", eerste_kleur: "BLAUW", tweede_kleur: "Niet geregistreerd", datum_eerste_toelating: "20110721", toegestane_maximum_massa_voertuig: "1805", massa_rijklaar: "1465" }];

  it("merk en model zonder dubbel merk, APK als kalenderdag, kleur, brandstof en bouwjaar", () => {
    const v = leesRdw(AURIS, [{ kenteken: "16RSL9", brandstof_omschrijving: "Benzine" }]);
    expect(v).toEqual({ kenteken: "16RSL9", merkModel: "Toyota Auris", kleur: "blauw", apk: "2027-05-13", brandstof: "benzine", soort: "Personenauto", laadvermogenKg: null, bouwjaar: 2011 });
    expect(rdwOmschrijving(v!)).toBe("Toyota Auris, blauw, benzine (2011)");
  });

  it("een bedrijfsauto krijgt zijn laadvermogen; een onbekend kenteken is null", () => {
    const bus = leesRdw([{ ...AURIS[0], voertuigsoort: "Bedrijfsauto", merk: "FORD", handelsbenaming: "TRANSIT", toegestane_maximum_massa_voertuig: "3500", massa_rijklaar: "2100" }], null);
    expect(bus?.laadvermogenKg).toBe(1400);
    expect(bus?.merkModel).toBe("Ford Transit");
    expect(leesRdw([], null)).toBeNull();
  });

  it("de route: alleen ingelogd en begrensd per gebruiker; het wagenpark heeft de knop", () => {
    const route = lees("app/api/rdw/route.ts");
    expect(route).toContain("await requirePrincipal()");
    expect(route).toContain('name: "rdw-kenteken"');
    expect(lees("components/ritten/RittenBeheer.tsx")).toContain("/api/rdw?kenteken=");
  });
});

describe("TenderNed", () => {
  const nu = Date.parse("2026-11-16T12:00:00Z");
  const item = (p: Record<string, unknown>) => ({ publicatieId: "449437", typePublicatie: { code: "AAO" }, aanbestedingNaam: "Uitzendkrachten t/m schaal 8", opdrachtgeverNaam: "Gemeente Rijswijk", sluitingsDatum: "2026-12-01T13:00:00", publicatieDatum: "2026-11-15", procedure: { omschrijving: "Openbaar" }, europees: true, opdrachtBeschrijving: "Inhuur  van\nuitzendkrachten.", link: { href: "https://www.tenderned.nl/aankondigingen/overzicht/449437" }, ...p });

  it("alleen open aankondigingen; gesloten en gegunde vallen weg; de link gaat alleen naar TenderNed", () => {
    const lijst = leesAanbestedingen(
      {
        content: [
          item({}),
          item({ publicatieId: "2", sluitingsDatum: "2026-11-01T10:00:00" }),
          item({ publicatieId: "3", typePublicatie: { code: "AGO" } }),
          item({ publicatieId: "4", link: { href: "https://kwaad.example/x" } }),
          { publicatieId: "5" },
        ],
      },
      "personeel",
      nu,
    );
    expect(lijst.map((a) => a.id)).toEqual(["449437", "4"]);
    expect(lijst[0]).toMatchObject({ titel: "Uitzendkrachten t/m schaal 8", opdrachtgever: "Gemeente Rijswijk", sluit: "2026-12-01T13:00", procedure: "Openbaar", europees: true, omschrijving: "Inhuur van uitzendkrachten." });
    expect(lijst[1]?.link).toBe("https://www.tenderned.nl/aankondigingen/overzicht/4");
    expect(leesAanbestedingen({ iets: "anders" }, "personeel", nu)).toEqual([]);
  });

  it("samenvoegen zonder dubbelen, wat het eerst sluit bovenaan; dagen tot het sluiten", () => {
    const a = leesAanbestedingen({ content: [item({ publicatieId: "1", sluitingsDatum: "2026-12-10T10:00:00" }), item({ publicatieId: "2" })] }, "personeel", nu);
    const b = leesAanbestedingen({ content: [item({ publicatieId: "2" })] }, "schoonmaak", nu);
    const samen = voegSamen([a, b]);
    expect(samen.map((x) => `${x.id}:${x.groep}`)).toEqual(["2:personeel", "1:personeel"]);
    expect(dagenTot("2026-12-01T13:00", nu)).toBe(15);
  });

  it("de pagina staat in het beheermenu onder Sales & groei, alleen voor platformbeheerders", () => {
    expect(ADMIN_HUBS.find((h) => h.id === "groei")?.pages.some((p) => p.href === "/admin/aanbestedingen")).toBe(true);
    expect(lees("app/admin/aanbestedingen/page.tsx")).toContain('hasRole(principal, "PLATFORM_ADMIN")');
  });
});

describe("Alles gratis", () => {
  it("de drie bronnen staan in de lijst, gratis, met hun host", () => {
    for (const [id, host] of [["wisselkoersen", "www.ecb.europa.eu"], ["rdw", "opendata.rdw.nl"], ["tenderned", "www.tenderned.nl"]] as const) {
      const d = GRATIS_DIENSTEN.find((x) => x.id === id);
      expect(d?.status, id).toBe("gratis");
      expect(d?.hosts, id).toContain(host);
    }
  });
});
