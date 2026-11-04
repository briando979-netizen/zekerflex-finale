import { describe, expect, it } from "vitest";
import { dealOpties, dealTotaal, isTestHost, metStap, schoneKeuze, statusVan, trechter, type DealInput, type DealPrijzen, type ScanLog } from "@/lib/scans/model";

// Scans & deals: het logboek van de gratis scans, wat de bezoeker daarna deed,
// en het voorstel op maat met echte prijzen.

const LOG: ScanLog = {
  sleutel: "website:0123456789abcdef",
  soort: "website",
  scanId: "0123456789abcdef",
  at: "2026-11-04T10:00:00.000Z",
  host: "bakkerij.nl",
  naam: "Bakkerij Jansen",
  plaats: "Utrecht",
  score: 62,
  samenvatting: "3 problemen, 2 aandachtspunten",
  rapport: "/website-check?r=0123456789abcdef",
  leadId: null,
  dealId: null,
  siteSlug: null,
  stappen: [{ stap: "gescand", at: "2026-11-04T10:00:00.000Z" }],
};

const PRIJZEN: DealPrijzen = {
  websiteCent: 49500,
  websiteKortingCent: 24750,
  beheer: [
    { key: "basis", label: "Basis", maandCent: 4900 },
    { key: "pro", label: "Pro", maandCent: 9900 },
  ],
  horecaBasisCent: 1900,
  horecaBundelCent: 6900,
  telefoonCent: 1250,
  uurfeeCent: 350,
};

const INPUT: DealInput = {
  soort: "website",
  score: 62,
  branche: "horeca",
  naam: "Bakkerij Jansen",
  problemen: ["Geen omschrijving voor Google", "Trage server"],
  probleemCategorieen: ["google", "snelheid"],
  reviewsOpSite: false,
  googleRating: null,
  googleAantal: 0,
  nieuweSite: true,
};

describe("logboek en status", () => {
  it("telt elke stap één keer, een stijlkeuze vaker", () => {
    let l = metStap(LOG, "nieuwe-site", "2026-11-04T10:01:00Z", "bakkerij-jansen");
    l = metStap(l, "nieuwe-site", "2026-11-04T10:02:00Z");
    l = metStap(metStap(l, "stijl", "t1", "premium"), "stijl", "t2", "luxe");
    expect(l.stappen.map((s) => s.stap)).toEqual(["gescand", "nieuwe-site", "stijl", "stijl"]);
    expect(LOG.stappen).toHaveLength(1); // niet aangepast
  });

  it("geeft de verste stap als status", () => {
    expect(statusVan(LOG)).toBe("alleen-gescand");
    expect(statusVan(metStap(LOG, "deal-bekeken", "t"))).toBe("verder-gekeken");
    expect(statusVan(metStap(metStap(LOG, "nieuwe-site", "t"), "aanvraag", "t"))).toBe("aanvraag");
    expect(statusVan(metStap(LOG, "deal-akkoord", "t"))).toBe("akkoord");
  });

  it("de trechter telt een latere stap ook voor de eerdere", () => {
    const logs = [LOG, metStap(LOG, "stijl", "t"), metStap(LOG, "aanvraag", "t"), metStap(LOG, "deal-akkoord", "t")];
    expect(trechter(logs)).toEqual({ gescand: 4, verder: 3, aanvraag: 2, akkoord: 1 });
  });

  it("maakt geen lead voor testadressen en onze eigen sites", () => {
    for (const h of ["example.com", "www.example.com", "shop.zekerflex.com", "bakkerij.test", "localhost", "10.0.0.1"]) expect(isTestHost(h), h).toBe(true);
    for (const h of ["bakkerij.nl", "examplebakkerij.nl", "marktzichtetenendrinken.nl"]) expect(isTestHost(h), h).toBe(false);
    expect(isTestHost(null)).toBe(false);
  });
});

describe("voorstel op maat", () => {
  it("kiest de opties die bij hen passen, met echte prijzen en korting", () => {
    const o = dealOpties(INPUT, PRIJZEN);
    const ids = o.map((x) => x.id);
    expect(ids).toEqual(["nieuwe-website", "beheer-basis", "beheer-pro", "google-reviews", "horeca", "personeel", "telefoon"]);
    const site = o.find((x) => x.id === "nieuwe-website")!;
    expect(site).toMatchObject({ eenmaligCent: 24750, aanbevolen: true });
    expect(site.prijsTekst).toContain("495");
    // traag: Pro aanbevolen, niet Basis
    expect(o.find((x) => x.id === "beheer-pro")?.aanbevolen).toBe(true);
    expect(o.find((x) => x.id === "beheer-basis")?.aanbevolen).toBe(false);
    expect(o.find((x) => x.id === "google-reviews")).toMatchObject({ aanbevolen: true, prijsTekst: "Gratis bij een ZekerFlex-account" });
    expect(o.find((x) => x.id === "horeca")).toMatchObject({ maandCent: 1900, aanbevolen: true });
    // Intl zet een harde spatie tussen € en het bedrag
    expect(o.find((x) => x.id === "personeel")?.prijsTekst?.replace(/\s/g, " ")).toBe("€ 3,50 per gewerkt uur");
  });

  it("verzint geen prijs: een rijschool krijgt 'prijs op aanvraag', zonder telefoonprijs geen telefoon", () => {
    const o = dealOpties({ ...INPUT, branche: "rijschool" }, { ...PRIJZEN, telefoonCent: null, websiteKortingCent: null });
    expect(o.find((x) => x.id === "rijschool")).toMatchObject({ maandCent: null, prijsTekst: "Prijs op aanvraag" });
    expect(o.some((x) => x.id === "telefoon")).toBe(false);
    expect(o.find((x) => x.id === "nieuwe-website")).toMatchObject({ eenmaligCent: 49500, prijsTekst: null });
  });

  it("een review-scan raadt Google-reviews aan, geen nieuwe website", () => {
    const o = dealOpties({ ...INPUT, soort: "reviews", branche: "algemeen", googleRating: 4.1, googleAantal: 23, nieuweSite: false }, PRIJZEN);
    expect(o.filter((x) => x.aanbevolen).map((x) => x.id)).toEqual(["google-reviews"]);
    expect(o.find((x) => x.id === "google-reviews")?.waarom).toContain("4,1 uit 23 reviews");
  });

  it("telt het totaal, en Basis en Pro nooit samen", () => {
    const o = dealOpties(INPUT, PRIJZEN);
    expect(dealTotaal(o, ["nieuwe-website", "beheer-pro", "horeca", "google-reviews"])).toEqual({ eenmaligCent: 24750, maandCent: 9900 + 1900 });
    expect(dealTotaal(o, ["beheer-basis", "beheer-pro"])).toEqual({ eenmaligCent: 0, maandCent: 9900 });
    expect(schoneKeuze(o, ["beheer-basis", "beheer-pro", "onzin", 7, "horeca", "horeca"])).toEqual(["beheer-pro", "horeca"]);
  });
});
