import { describe, expect, it } from "vitest";
import { HOOFDKNOP, bedrijfTrechter, bezoekPerPagina, paginaVan, type BedrijfFeiten, type BezoekRij } from "@/lib/admin/werkgever-trechter-kern";

// Vaste "nu" met zone: de test hangt niet af van het moment van draaien.
const NU = new Date("2026-11-12T18:00:00+01:00");
const dagenTerug = (d: number) => new Date(NU.getTime() - d * 86_400_000);

const bedrijf = (dagen: number, extra: Partial<BedrijfFeiten> = {}): BedrijfFeiten => ({
  aangemeld: dagenTerug(dagen),
  echt: true,
  kvk: false,
  geverifieerd: false,
  vestiging: false,
  klusGeplaatst: false,
  klusGepubliceerd: false,
  toewijzing: false,
  ...extra,
});

describe("bedrijven per stap", () => {
  const lijst: BedrijfFeiten[] = [
    bedrijf(2, { kvk: true, vestiging: true }),
    bedrijf(10, { kvk: true, geverifieerd: true, vestiging: true, klusGeplaatst: true, klusGepubliceerd: true, toewijzing: true }),
    bedrijf(40, { kvk: true, vestiging: true, klusGeplaatst: true }),
    bedrijf(1, { echt: false, kvk: true, klusGeplaatst: true }), // testbedrijf: telt nooit mee
  ];
  const tel = (dagen: 7 | 30 | null) => Object.fromEntries(bedrijfTrechter(lijst, NU, dagen).map((s) => [s.key, s.aantal]));

  it("telt per venster alleen echte bedrijven die toen zijn aangemeld", () => {
    expect(tel(7)).toEqual({ aangemeld: 1, kvk: 1, geverifieerd: 0, vestiging: 1, klusGeplaatst: 0, klusGepubliceerd: 0, toewijzing: 0 });
    expect(tel(30)).toEqual({ aangemeld: 2, kvk: 2, geverifieerd: 1, vestiging: 2, klusGeplaatst: 1, klusGepubliceerd: 1, toewijzing: 1 });
    expect(tel(null)).toEqual({ aangemeld: 3, kvk: 3, geverifieerd: 1, vestiging: 3, klusGeplaatst: 2, klusGepubliceerd: 1, toewijzing: 1 });
  });

  it("de stappen staan in de volgorde van de route", () => {
    expect(bedrijfTrechter([], NU, 7).map((s) => s.label)).toEqual(["Aangemeld", "KvK gekoppeld", "Geverifieerd", "Vestiging", "Klus geplaatst", "Klus gepubliceerd", "Eerste toewijzing"]);
  });
});

describe("bezoek en hoofdknop", () => {
  it("herkent de pagina, ook met een zoekvraag of een schuine streep erachter", () => {
    expect(paginaVan("/klus-plaatsen?functie=horeca&plaats=Utrecht")).toBe("/klus-plaatsen");
    expect(paginaVan("/prijzen/")).toBe("/prijzen");
    expect(paginaVan("/voor-bedrijven#faq")).toBe("/voor-bedrijven");
    expect(paginaVan("/voor-freelancers")).toBeNull();
    expect(paginaVan("/demo-bekijken")).toBeNull();
  });

  it("de hoofdknop is aanmelden, klus plaatsen of een demo; niet inloggen, menu of de cookiemelding", () => {
    for (const ja of ["Organisatie aanmelden", "Gratis klus plaatsen", "Plaats deze klus", "Zet deze klus klaar", "Vraag een demo aan", "Demo aanvragen"]) expect(HOOFDKNOP.test(ja), ja).toBe(true);
    for (const nee of ["Inloggen", "Menu", "Accepteren", "Sluiten", "Chat openen", "Ik zoek werk"]) expect(HOOFDKNOP.test(nee), nee).toBe(false);
  });

  it("telt unieke sessies per pagina en per venster, en klikken alleen op de hoofdknop van die pagina", () => {
    const rij = (type: BezoekRij["type"], path: string, sessionId: string, dagen: number, label: string | null = null): BezoekRij => ({ type, path, sessionId, label, at: dagenTerug(dagen) });
    const rijen: BezoekRij[] = [
      rij("PAGEVIEW", "/voor-bedrijven", "a", 1),
      rij("PAGEVIEW", "/voor-bedrijven", "a", 1), // dezelfde sessie telt één keer
      rij("PAGEVIEW", "/voor-bedrijven", "b", 20),
      rij("CLICK", "/voor-bedrijven", "a", 1, "Organisatie aanmelden"),
      rij("CLICK", "/voor-bedrijven", "b", 20, "Menu"), // geen hoofdknop
      rij("PAGEVIEW", "/klus-plaatsen?functie=horeca", "c", 3),
      rij("CLICK", "/klus-plaatsen", "c", 3, "Plaats deze klus"),
      rij("PAGEVIEW", "/demo", "d", 45), // buiten 30 dagen
      rij("PAGEVIEW", "/prijzen", "e", -1), // in de toekomst: telt niet
    ];
    const zeven = Object.fromEntries(bezoekPerPagina(rijen, NU, 7).map((p) => [p.pagina, [p.sessies, p.klikken]]));
    const dertig = Object.fromEntries(bezoekPerPagina(rijen, NU, 30).map((p) => [p.pagina, [p.sessies, p.klikken]]));
    expect(zeven).toEqual({ "/voor-bedrijven": [1, 1], "/voor-bureaus": [0, 0], "/klus-plaatsen": [1, 1], "/prijzen": [0, 0], "/demo": [0, 0] });
    expect(dertig).toEqual({ "/voor-bedrijven": [2, 1], "/voor-bureaus": [0, 0], "/klus-plaatsen": [1, 1], "/prijzen": [0, 0], "/demo": [0, 0] });
  });
});
