import { describe, expect, it } from "vitest";
import {
  antwoordSjabloon,
  getal,
  haalbaarDoel,
  inhaalTempo,
  leesInvoer,
  maakVoorstellen,
  positie,
  reviewsNodig,
  scoreScan,
  themasUitReviews,
  volgendDoel,
  websiteSignalen,
  type Profiel,
  type ScanFeiten,
} from "@/lib/review-scan/model";

const NU = new Date("2026-11-04T12:00:00Z");
const dagenGeleden = (d: number) => new Date(NU.getTime() - d * 86_400_000).toISOString();
const vol: Profiel = { telefoon: true, website: true, openingstijden: true, fotos: 10, status: "OPERATIONAL" };
const leeg: Profiel = { telefoon: false, website: false, openingstijden: false, fotos: 0, status: null };

describe("leesInvoer", () => {
  it("herkent Google-links, websites en gewone tekst", () => {
    expect(leesInvoer("ChIJN1t_tDeuEmsRUsoyG83frY4")).toEqual({ soort: "placeId", placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" });
    expect(leesInvoer("https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnopqrstu")).toEqual({ soort: "placeId", placeId: "ChIJabcdefghijklmnopqrstu" });
    expect(leesInvoer("https://maps.app.goo.gl/AbC123xyz")).toEqual({ soort: "kort", url: "https://maps.app.goo.gl/AbC123xyz" });
    expect(leesInvoer("g.page/r/CXyz123abc/review")).toEqual({ soort: "kort", url: "https://g.page/r/CXyz123abc/review" });
    expect(leesInvoer("https://www.google.com/maps/place/Bakkerij+Jansen/@52.0907,5.1214,17z/data=!3m1")).toEqual({ soort: "maps", naam: "Bakkerij Jansen", lat: 52.0907, lng: 5.1214 });
    expect(leesInvoer("bakkerijjansen.nl")).toEqual({ soort: "website", url: "https://bakkerijjansen.nl/" });
    expect(leesInvoer("  Bakkerij  Jansen Utrecht ")).toEqual({ soort: "tekst", tekst: "Bakkerij Jansen Utrecht" });
  });

  it("loopt door Googles toestemmingspagina heen", () => {
    const via = "https://consent.google.com/ml?continue=" + encodeURIComponent("https://www.google.com/maps/place/Kapper+Kees/@52.1,5.2,17z");
    expect(leesInvoer(via)).toEqual({ soort: "maps", naam: "Kapper Kees", lat: 52.1, lng: 5.2 });
  });

  it("maakt van rare invoer gewone zoektekst, nooit een link", () => {
    expect(leesInvoer("javascript:alert(1)").soort).toBe("tekst");
    expect(leesInvoer("ftp://bestanden.nl/x").soort).toBe("tekst");
  });
});

describe("doelen", () => {
  it("rekent uit hoeveel vijfsterrenreviews nodig zijn", () => {
    expect(reviewsNodig(4.3, 100, 4.5)).toBe(40); // (430 + 200) / 140 = 4,5
    expect(reviewsNodig(4.5, 10, 4.5)).toBe(0);
    expect(reviewsNodig(3.0, 2, 4.0)).toBe(2);
    expect(reviewsNodig(4.0, 10, 5)).toBe(0);
  });

  it("kiest een haalbaar volgend doel, nooit boven 4,8", () => {
    expect(volgendDoel(4.1)).toBe(4.4);
    expect(volgendDoel(4.6)).toBe(4.7);
    expect(volgendDoel(4.75)).toBe(4.8);
    expect(volgendDoel(4.8)).toBeNull();
    expect(volgendDoel(null)).toBeNull();
  });

  it("noemt alleen een haalbaar doel (een groot bedrijf krijgt geen doel van duizenden reviews)", () => {
    expect(haalbaarDoel(4.3, 100)).toEqual({ van: 4.3, naar: 4.6, nodig: 75 });
    expect(haalbaarDoel(4.7, 117044)).toBeNull();
    expect(haalbaarDoel(4.9, 20)).toBeNull();
    expect(haalbaarDoel(null, 0)).toBeNull();
    expect(getal(117044)).toBe("117.044");
    expect(inhaalTempo({ rating: 4.5, aantal: 10 }, [{ naam: "Groot", rating: 4.6, aantal: 5000, mapsUrl: null }])).toBeNull();
  });

  it("noemt de sterkste concurrent om in te halen", () => {
    const c = [
      { naam: "Sterk", rating: 4.6, aantal: 160, mapsUrl: null },
      { naam: "Veel maar slecht", rating: 3.9, aantal: 500, mapsUrl: null },
    ];
    expect(inhaalTempo({ rating: 4.5, aantal: 40 }, c)).toEqual({ naam: "Sterk", aantal: 160, perMaand: 20 });
    expect(inhaalTempo({ rating: 4.5, aantal: 600 }, c)).toBeNull();
  });
});

describe("score", () => {
  it("geeft de volle score aan een topbedrijf", () => {
    const f: ScanFeiten = {
      rating: 4.9,
      aantal: 300,
      reviews: [{ rating: 5, tekst: "Top", geplaatst: dagenGeleden(3), wanneer: "3 dagen geleden" }],
      profiel: vol,
      concurrenten: [{ naam: "B", rating: 4.2, aantal: 40, mapsUrl: null }],
      website: null,
    };
    const s = scoreScan(f, NU);
    expect(s.score).toBe(100);
    expect(s.oordeel).toBe("Uitstekend");
  });

  it("zonder concurrenten telt dat onderdeel niet mee en blijft de schaal 0-100", () => {
    const s = scoreScan({ rating: null, aantal: 0, reviews: [], profiel: leeg, concurrenten: [], website: null }, NU);
    expect(s.onderdelen.map((o) => o.id)).toEqual(["beoordeling", "aantal", "actueel", "profiel"]);
    expect(s.score).toBe(0);
    expect(s.oordeel).toBe("Werk aan de winkel");
  });

  it("weegt weinig reviews minder zwaar bij de positie", () => {
    const c = [
      { naam: "Weinig", rating: 4.9, aantal: 5, mapsUrl: null },
      { naam: "Gemiddeld", rating: 4.5, aantal: 50, mapsUrl: null },
    ];
    expect(positie({ rating: 4.8, aantal: 200 }, c)).toEqual({ plek: 1, van: 3 });
    expect(positie({ rating: 4.0, aantal: 3 }, c)).toEqual({ plek: 3, van: 3 });
    expect(positie({ rating: 4.0, aantal: 3 }, [])).toBeNull();
  });
});

describe("wat klanten zeggen", () => {
  it("vindt onderwerpen in positieve en negatieve reviews", () => {
    const t = themasUitReviews([
      { rating: 1, tekst: "Veel te lang moeten wachten op ons eten.", geplaatst: null, wanneer: null },
      { rating: 5, tekst: "Heel vriendelijk personeel!", geplaatst: null, wanneer: null },
      { rating: 3, tekst: "Prima, wel wat duur.", geplaatst: null, wanneer: null },
    ]);
    expect(t[0]).toEqual({ id: "snelheid", label: "Snelheid en wachttijd", positief: 0, negatief: 1 });
    expect(t.find((x) => x.id === "service")).toMatchObject({ positief: 1, negatief: 0 });
    expect(t.find((x) => x.id === "prijs")).toBeUndefined(); // 3 sterren telt niet mee
  });

  it("geeft een net standaardantwoord, bij kritiek met een gesprek buiten Google", () => {
    expect(antwoordSjabloon({ rating: 5 }, "Bakkerij Jansen")).toContain("Bakkerij Jansen");
    expect(antwoordSjabloon({ rating: 1 }, "Bakkerij Jansen")).toMatch(/contact met ons/);
  });
});

describe("voorstellen", () => {
  const basis: ScanFeiten = {
    rating: 4.1,
    aantal: 12,
    reviews: [
      { rating: 1, tekst: "Lang wachten en onvriendelijk.", geplaatst: dagenGeleden(120), wanneer: "4 maanden geleden" },
      { rating: 5, tekst: "Lekker!", geplaatst: dagenGeleden(200), wanneer: null },
    ],
    profiel: { ...vol, openingstijden: false, fotos: 3 },
    concurrenten: [],
    website: { reviewsOpSite: false, reviewLink: false, ratingSchema: false },
  };

  it("zet het belangrijkste eerst en koppelt de juiste actie", () => {
    const v = maakVoorstellen(basis, NU);
    const ids = v.map((x) => x.id);
    expect(ids.slice(0, 2)).toEqual(["meer-reviews", "reageer-kritiek"]);
    expect(v[0]?.actie).toBe("verzoeken");
    expect(ids).toEqual(expect.arrayContaining(["recent", "openingstijden", "fotos", "site-knop", "site-score"]));
    expect(v.every((x, i) => i === 0 || ["hoog", "middel", "laag"].indexOf(x.impact) >= ["hoog", "middel", "laag"].indexOf(v[i - 1]!.impact))).toBe(true);
  });

  it("adviseert nooit alleen tevreden klanten te vragen", () => {
    const meer = maakVoorstellen(basis, NU).find((x) => x.id === "meer-reviews");
    expect(meer?.uitleg).toMatch(/iedereen/);
    expect(meer?.uitleg).toMatch(/Alleen tevreden klanten vragen mag volgens Google niet/);
  });

  it("een gesloten bedrijf staat bovenaan", () => {
    const v = maakVoorstellen({ ...basis, profiel: { ...basis.profiel, status: "CLOSED_TEMPORARILY" } }, NU);
    expect(v[0]?.id).toBe("status");
  });
});

describe("websiteSignalen", () => {
  it("ziet reviews, de reviewknop en sterren-gegevens op de website", () => {
    const html = `<html><body><h2>Reviews van klanten</h2><a href="https://g.page/r/abc123/review">Schrijf een review</a><script type="application/ld+json">{"aggregateRating": {"ratingValue": 4.7}}</script></body></html>`;
    expect(websiteSignalen(html)).toEqual({ reviewsOpSite: true, reviewLink: true, ratingSchema: true });
  });

  it("telt het woord review in een script niet als reviews op de site", () => {
    expect(websiteSignalen(`<html><body><p>Welkom</p><script>var review = 1;</script></body></html>`)).toEqual({ reviewsOpSite: false, reviewLink: false, ratingSchema: false });
  });
});
