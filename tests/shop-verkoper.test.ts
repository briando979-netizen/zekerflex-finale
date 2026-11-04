import { describe, expect, it } from "vitest";
import {
  VERKOOP_COMMISSIE_PCT,
  VERKOPER_VAST_NA_DAGEN,
  adresZichtbaar,
  commissieCents,
  euroNaarCents,
  isTrackCode,
  trackUrl,
  verdeelPerVerkoper,
  verkoopStatus,
  verkoopTotalen,
  verkoperSlug,
  vraagtNieuweBeoordeling,
  zichtbaarInShop,
} from "@/lib/shop/verkoper-core";
import { nieuwProductSchema, wijzigProductSchema } from "@/lib/shop/verkoper-schema";

const dag = 86_400_000;
const nu = new Date("2026-11-04T12:00:00Z");

describe("verkopers op de marktplaats: geld", () => {
  it("commissie is een vast percentage van het verkoopbedrag, afgerond op centen", () => {
    expect(VERKOOP_COMMISSIE_PCT).toBe(12);
    expect(commissieCents(10_000)).toBe(1200);
    expect(commissieCents(2495)).toBe(299); // 299,4 → 299
    expect(commissieCents(0)).toBe(0);
    expect(commissieCents(-500)).toBe(0);
    expect(commissieCents(Number.NaN)).toBe(0);
  });

  it("splitst een bestelling per verkoper en laat ZekerFlex-eigen regels weg", () => {
    const delen = verdeelPerVerkoper(
      [
        { priceCents: 1000, qty: 2, sellerTenantId: "a" },
        { priceCents: 500, qty: 1, sellerTenantId: "b" },
        { priceCents: 1500, qty: 1, sellerTenantId: "a" },
        { priceCents: 999, qty: 3 },
      ],
      495,
    );
    expect(delen).toHaveLength(2);
    const a = delen.find((d) => d.tenantId === "a")!;
    expect(a).toMatchObject({ regels: 2, stuks: 3, verkoopCents: 3500, verzendCents: 0, commissieCents: 420, uitbetalingCents: 3080 });
    const b = delen.find((d) => d.tenantId === "b")!;
    expect(b.uitbetalingCents).toBe(500 - 60);
  });

  it("verzendkosten gaan alleen naar de verkoper als de hele bestelling van hem is", () => {
    const [alleen] = verdeelPerVerkoper([{ priceCents: 2000, qty: 1, sellerTenantId: "a" }], 495);
    expect(alleen).toMatchObject({ verzendCents: 495, commissieCents: 240, uitbetalingCents: 2000 + 495 - 240 });
    const gemengd = verdeelPerVerkoper([{ priceCents: 2000, qty: 1, sellerTenantId: "a" }, { priceCents: 100, qty: 1 }], 495);
    expect(gemengd[0]?.verzendCents).toBe(0);
    const tweeVerkopers = verdeelPerVerkoper([{ priceCents: 2000, qty: 1, sellerTenantId: "a" }, { priceCents: 100, qty: 1, sellerTenantId: "b" }], 495);
    expect(tweeVerkopers.every((d) => d.verzendCents === 0)).toBe(true);
  });

  it("een bestelling zonder verkopersproducten geeft niets", () => {
    expect(verdeelPerVerkoper([{ priceCents: 1000, qty: 1, sellerTenantId: null }], 0)).toEqual([]);
  });
});

describe("verkopers op de marktplaats: stand van een verkoop", () => {
  const order = (status: Parameters<typeof verkoopStatus>[0]["status"], dagenOud: number) => ({ status, createdAt: new Date(nu.getTime() - dagenOud * dag) });
  const niets = { verzonden: false, uitbetaald: false };

  it("volgt de bestelling: wacht, versturen, onderweg, vast, uitbetaald, vervallen", () => {
    expect(verkoopStatus(order("PENDING_PAYMENT", 0), niets, nu)).toBe("wacht");
    expect(verkoopStatus(order("RECEIVED", 1), niets, nu)).toBe("verzenden");
    expect(verkoopStatus(order("RECEIVED", 40), niets, nu)).toBe("verzenden"); // nooit vast zonder verzending
    expect(verkoopStatus(order("SHIPPED", 5), { verzonden: true, uitbetaald: false }, nu)).toBe("onderweg");
    expect(verkoopStatus(order("SHIPPED", VERKOPER_VAST_NA_DAGEN), { verzonden: true, uitbetaald: false }, nu)).toBe("vast");
    expect(verkoopStatus(order("SHIPPED", 60), { verzonden: true, uitbetaald: true }, nu)).toBe("uitbetaald");
    expect(verkoopStatus(order("CANCELLED", 60), { verzonden: true, uitbetaald: false }, nu)).toBe("vervallen");
    expect(verkoopStatus(order("PAYMENT_FAILED", 0), niets, nu)).toBe("vervallen");
  });

  it("het adres van de koper alleen na betaling", () => {
    expect(adresZichtbaar("wacht")).toBe(false);
    expect(adresZichtbaar("vervallen")).toBe(false);
    expect(adresZichtbaar("verzenden")).toBe(true);
    expect(adresZichtbaar("onderweg")).toBe(true);
  });

  it("totalen tellen alleen betaalde, niet vervallen verkopen", () => {
    const r = (status: Parameters<typeof verkoopTotalen>[0][number]["status"], uit: number) => ({ status, verkoopCents: 1000, verzendCents: 0, commissieCents: 120, uitbetalingCents: uit });
    const t = verkoopTotalen([r("wacht", 880), r("vervallen", 880), r("verzenden", 880), r("onderweg", 880), r("vast", 880), r("uitbetaald", 880)]);
    expect(t).toEqual({ bestellingen: 4, omzetCents: 4000, commissieCents: 480, teVersturen: 1, lopendCents: 1760, vastCents: 880, uitbetaaldCents: 880 });
  });
});

describe("verkopers op de marktplaats: producten", () => {
  it("alleen goedgekeurd staat in de shop", () => {
    expect(zichtbaarInShop("goedgekeurd")).toBe(true);
    expect(zichtbaarInShop("in_beoordeling")).toBe(false);
    expect(zichtbaarInShop("gepauzeerd")).toBe(false);
    expect(zichtbaarInShop("afgewezen")).toBe(false);
  });

  it("prijs en voorraad wijzigen zonder nieuwe beoordeling, inhoud niet", () => {
    expect(vraagtNieuweBeoordeling({})).toBe(false);
    expect(vraagtNieuweBeoordeling({ naam: "Nieuw" })).toBe(true);
    expect(vraagtNieuweBeoordeling({ omschrijving: "x" })).toBe(true);
    expect(vraagtNieuweBeoordeling({ categorie: "Kleding" })).toBe(true);
    expect(vraagtNieuweBeoordeling({ fotoUploadId: "abc" })).toBe(true);
  });

  it("maakt een leesbare, unieke url-naam", () => {
    expect(verkoperSlug("Café-schort Één Maat!", "A1b2C3")).toBe("cafe-schort-een-maat-a1b2c3");
    expect(verkoperSlug("???", "ff00aa")).toBe("product-ff00aa");
    expect(verkoperSlug("x".repeat(100), "abcdef").length).toBeLessThanOrEqual(67);
  });

  it("leest een prijs in euro's", () => {
    expect(euroNaarCents("24,95")).toBe(2495);
    expect(euroNaarCents("€ 12")).toBe(1200);
    expect(euroNaarCents("12.5")).toBe(1250);
    expect(euroNaarCents("1.234,50")).toBeNull();
    expect(euroNaarCents("abc")).toBeNull();
    expect(euroNaarCents("")).toBeNull();
  });

  it("controleert de invoer van een nieuw product", () => {
    const goed = { naam: "Werkhandschoen", omschrijving: "Stevige handschoen met grip, maat 9 en 10.", categorie: "Werk & PBM", prijsCents: 1295, voorraad: 5, fotoUploadId: "upload12345" };
    expect(nieuwProductSchema.safeParse(goed).success).toBe(true);
    expect(nieuwProductSchema.safeParse({ ...goed, categorie: "Wapens" }).success).toBe(false);
    expect(nieuwProductSchema.safeParse({ ...goed, prijsCents: 50 }).success).toBe(false);
    expect(nieuwProductSchema.safeParse({ ...goed, omschrijving: "kort" }).success).toBe(false);
    expect(nieuwProductSchema.safeParse({ ...goed, maten: [{ maat: "M", voorraad: 1 }, { maat: "m", voorraad: 2 }] }).success).toBe(false);
    expect(wijzigProductSchema.safeParse({ voorraad: { v1: -1 } }).success).toBe(false);
    expect(wijzigProductSchema.safeParse({ pauze: true }).success).toBe(true);
  });
});

describe("verkopers op de marktplaats: verzenden", () => {
  it("accepteert alleen nette track-en-tracecodes", () => {
    expect(isTrackCode("3SABCD1234567")).toBe(true);
    expect(isTrackCode("JJD-0001")).toBe(true);
    expect(isTrackCode("12345")).toBe(false);
    expect(isTrackCode("<script>")).toBe(false);
    expect(isTrackCode("a b c d e f")).toBe(false);
  });

  it("maakt een volglink per vervoerder", () => {
    expect(trackUrl("PostNL", "3SABC123")).toBe("https://jouw.postnl.nl/track-and-trace/3SABC123");
    expect(trackUrl("DHL", "JJD0001")).toContain("tracking-id=JJD0001");
    expect(trackUrl("Anders", "ABC123")).toBeNull();
  });
});
