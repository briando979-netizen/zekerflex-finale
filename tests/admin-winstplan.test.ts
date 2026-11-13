import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gebiedenVan, isTestbedrijf, nodigVoorKosten, stapVanNu, winstStappen, type WinstStand } from "@/lib/admin/winstplan";
import { ADMIN_HUBS } from "@/lib/admin/nav";

// Beheer → Geld → Weg naar winst (13 nov): waar ZekerFlex staat, wat er nodig is om de kosten te dekken en de stap van nu.
// Alleen echte cijfers: wat niet gemeten is wordt een streepje, geen schatting.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const NUL: WinstStand = { betalen: false, omzet30Cents: 0, omzetOoitCents: 0, kostenMaandCents: 21266, werkers: 86, werkersGeverifieerd: 30, bedrijven: 4, echteKlussen: 0, urenstaten: 12, websiteKlanten: 1 };

describe("wat er nodig is", () => {
  it("naar boven afgerond, per inkomstenlijn apart", () => {
    expect(nodigVoorKosten(21266, 350, 4900)).toEqual({ uren: 61, websites: 5 });
    expect(nodigVoorKosten(35000, 350, 4900)).toEqual({ uren: 100, websites: 8 });
  });

  it("zonder ingevulde kosten rekenen we niets uit", () => {
    for (const k of [null, 0, -5]) expect(nodigVoorKosten(k, 350, 4900)).toBeNull();
    expect(nodigVoorKosten(21266, 0, 4900)).toBeNull();
  });
});

describe("de stappen", () => {
  it("betalen dicht is de stap van nu, en die is van de eigenaar", () => {
    const stappen = winstStappen(NUL);
    expect(stappen.map((s) => s.id)).toEqual(["betalen", "opdrachtgever", "uren", "betaald", "kosten"]);
    expect(stapVanNu(stappen)).toMatchObject({ id: "betalen", wie: "jij" });
    expect(stappen.every((s) => !s.klaar)).toBe(true);
  });

  it("nog niet gemeten telt niet als open", () => {
    expect(stapVanNu(winstStappen({ ...NUL, betalen: null }))?.id).toBe("betalen");
  });

  it("urenstaten van alleen het testbedrijf tellen niet als de eerste gewerkte uren", () => {
    const s = winstStappen({ ...NUL, betalen: true });
    expect(stapVanNu(s)?.id).toBe("opdrachtgever");
    expect(s.find((x) => x.id === "uren")?.klaar).toBe(false);
  });

  it("stap voor stap tot de kosten gedekt zijn", () => {
    const met = (extra: Partial<WinstStand>) => stapVanNu(winstStappen({ ...NUL, betalen: true, ...extra }))?.id ?? null;
    expect(met({ echteKlussen: 3, urenstaten: 0 })).toBe("uren");
    expect(met({ echteKlussen: 3 })).toBe("betaald");
    expect(met({ echteKlussen: 3, omzetOoitCents: 5000, omzet30Cents: 5000 })).toBe("kosten");
    expect(met({ echteKlussen: 3, omzetOoitCents: 30000, omzet30Cents: 21266 })).toBeNull();
    // zonder ingevulde kosten is "gedekt" nooit klaar
    expect(met({ echteKlussen: 3, omzetOoitCents: 30000, omzet30Cents: 30000, kostenMaandCents: null })).toBe("kosten");
  });

  it("elke stap wijst naar een bestaande beheerpagina", () => {
    const inMenu = new Set(ADMIN_HUBS.flatMap((h) => h.pages.map((p) => p.href)));
    for (const s of winstStappen(NUL)) expect(inMenu.has(s.href), s.href).toBe(true);
  });
});

describe("waar de werkers wonen", () => {
  it("alleen gebieden met drie of meer staan apart; de rest telt samen", () => {
    const u = gebiedenVan(["1012 LG", "1013AB", "1055 XX", "3011 AA", "3012 BB", "9601 CC", null, "", "geen", "0123 AB"]);
    expect(u.gebieden).toEqual([{ gebied: "10", aantal: 3 }]);
    expect(u.verspreid).toBe(3);
    expect(u.zonder).toBe(4);
  });

  it("de grootste eerst", () => {
    const u = gebiedenVan([...Array(3).fill("3011 AA"), ...Array(5).fill("1012 LG")]);
    expect(u.gebieden.map((g) => g.gebied)).toEqual(["10", "30"]);
  });
});

describe("de pagina", () => {
  const src = bron("app/admin/winstplan/page.tsx");

  it("alleen voor de platformbeheerder, in het menu bij Geld, en alleen lezen", () => {
    expect(src).toContain('hasRole(principal, "PLATFORM_ADMIN")');
    expect(ADMIN_HUBS.flatMap((h) => h.pages).some((p) => p.href === "/admin/winstplan" && p.label === "Weg naar winst")).toBe(true);
    expect(src).not.toMatch(/\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\(|kvSet/);
  });

  it("omzet telt alleen wat betaald is, en het testbedrijf telt niet mee als opdrachtgever", () => {
    expect(src.match(/status: "PAID"/g) ?? []).toHaveLength(2);
    expect(src).toContain('const BETAALD_SHOP = ["RECEIVED", "CONFIRMED", "SHIPPED"] as const;');
    expect(src).toContain("tenants.filter((t) => !isTestbedrijf(t.name))");
    expect(isTestbedrijf("Test bedrijven")).toBe(true);
    expect(isTestbedrijf("Testa Bouw B.V.")).toBe(false);
    expect(isTestbedrijf("Bakkerij Jansen")).toBe(false);
  });

  it("geen schatting: onbekend is een streepje, en de tarieven komen uit de eigen bron", () => {
    expect(src).toContain('s.kostenMaandCents === null ? "—"');
    expect(src).toContain('s.betalen === null ? "—"');
    expect(src).toContain("BASE_FEE_PER_HOUR_CENTS");
    expect(src).toContain("WEBSITE_PLANS.basis.priceCentsPerMonth");
    // geen los bedrag in de tekst
    expect(src).not.toMatch(/€\s?\d/);
  });

  it("geen namen of adressen van werkers: alleen de postcode voor het tellen per gebied", () => {
    expect(src).toContain("prisma.freelancerProfile.findMany({ select: { homePostalCode: true } })");
    expect(src).not.toMatch(/fullName|email|homeStreet|bsn|iban/i);
  });
});
