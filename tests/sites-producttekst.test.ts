import { afterEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { LEGE_WINKEL, type SiteDoc, type SiteProduct } from "@/lib/sites/types";

// Studio → Webshop → Slim → Producttekst schrijven: de AI stelt een korte zin en een
// omschrijving voor uit alleen de gegevens van de eigenaar, we lezen het antwoord soepel,
// en wat niet in die gegevens staat (een getal, een materiaal) moet de eigenaar nalopen.
// De route slaat niets op en kijkt alleen in de eigen webshop.

const chatJson = vi.fn();
const llmConfigProblem = vi.fn<() => string | null>(() => null);
vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined,
  chatJson: (...a: unknown[]) => chatJson(...a),
  llmConfigProblem: () => llmConfigProblem(),
}));
const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), requirePrincipal: () => requirePrincipal() }));
const siteTenantOf = vi.fn();
vi.mock("@/lib/sites/access", () => ({ siteTenantOf: (...a: unknown[]) => siteTenantOf(...a) }));
const winkelSiteOf = vi.fn();
vi.mock("@/lib/sites/store", () => ({ winkelSiteOf: (...a: unknown[]) => winkelSiteOf(...a) }));
const enforceRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...a) }));

import { KORTE_TEKST_MAX, knipOpWoord, leesProductTekst, productTekstInvoer, productTekstVraag, teControleren, zonderGoedeTekst } from "@/lib/sites/producttekst";
import { POST } from "@/app/api/werkgever/sites/slim/producttekst/route";

const product = (over: Partial<SiteProduct> = {}): SiteProduct => ({
  id: "paaaaaaa1",
  naam: "Hoodie",
  slug: "hoodie",
  prijsCents: 4995,
  oudePrijsCents: null,
  korteTekst: "",
  omschrijving: "",
  fotos: [],
  categorie: "Kleding",
  zichtbaar: true,
  uitverkocht: false,
  opties: [{ naam: "Maat", waarden: ["S", "M", "L"] }],
  ...over,
});

const site = (producten: SiteProduct[]): SiteDoc =>
  ({ id: "saaaaaaa1", tenantId: "t1", slug: "shop", bedrijf: { naam: "Shop De Vries" }, pages: [], media: [], liveBuild: null, builds: [], winkel: { ...LEGE_WINKEL, producten }, createdAt: "", updatedAt: "" }) as unknown as SiteDoc;

const verzoek = (body: unknown) => new Request("http://localhost/api/werkgever/sites/slim/producttekst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

afterEach(() => {
  vi.clearAllMocks();
  llmConfigProblem.mockReturnValue(null);
});

describe("wat het model krijgt", () => {
  it("alleen de eigen gegevens, zonder lege velden", () => {
    const i = productTekstInvoer(product(), "Shop De Vries");
    expect(i).toMatchObject({ naam: "Hoodie", categorie: "Kleding", prijs: "€ 49,95", keuzes: [{ naam: "Maat", waarden: ["S", "M", "L"] }] });
    const vraag = productTekstVraag(i);
    expect(vraag).toContain('"product": "Hoodie"');
    expect(vraag).toContain('"winkel": "Shop De Vries"');
    expect(vraag).not.toContain("huidigeOmschrijving");
    expect(productTekstVraag(productTekstInvoer(product({ omschrijving: "Zacht en warm." }), ""))).toContain('"huidigeOmschrijving": "Zacht en warm."');
  });

  it("producten zonder goede tekst: zonder korte zin of met (bijna) geen omschrijving, die online staan eerst", () => {
    const goed = product({ id: "pgoed0001", korteTekst: "Warm", omschrijving: "x".repeat(100) });
    const verborgen = product({ id: "pverb0001", zichtbaar: false });
    const kaal = product({ id: "pkaal0001" });
    expect(zonderGoedeTekst([verborgen, goed, kaal]).map((p) => p.id)).toEqual(["pkaal0001", "pverb0001"]);
  });
});

describe("leesProductTekst (soepel)", () => {
  it("het gewone antwoord", () => {
    expect(leesProductTekst({ korteTekst: "Een warme hoodie.", omschrijving: "Een hoodie voor koude dagen.\n\nKies je maat: S, M of L." })).toEqual({ korteTekst: "Een warme hoodie.", omschrijving: "Een hoodie voor koude dagen.\n\nKies je maat: S, M of L." });
  });

  it("een lijst, een object in een object, alinea's als lijst, andere namen en opmaak", () => {
    expect(leesProductTekst([{ product: { tagline: "**Warm**", beschrijving: ["## Over", "- Een hoodie voor koude dagen.", "Kies je maat."] } }])).toEqual({ korteTekst: "Warm", omschrijving: "Over\n\nEen hoodie voor koude dagen.\n\nKies je maat." });
    expect(leesProductTekst({ KorteTekst: "Warm", Omschrijving: '"Een hoodie voor koude dagen."' })?.omschrijving).toBe("Een hoodie voor koude dagen.");
  });

  it("zonder korte zin: de eerste zin van de omschrijving; een losse tekst is de omschrijving", () => {
    expect(leesProductTekst({ omschrijving: "Een hoodie voor koude dagen. Kies je maat." })?.korteTekst).toBe("Een hoodie voor koude dagen.");
    expect(leesProductTekst("Een hoodie voor koude dagen, in drie maten.")?.omschrijving).toBe("Een hoodie voor koude dagen, in drie maten.");
  });

  it("te lang wordt afgeknipt op een woord; niets bruikbaars is null", () => {
    const t = leesProductTekst({ korteTekst: "woord ".repeat(60), omschrijving: "Een zin. ".repeat(300) });
    expect(t?.korteTekst.length).toBeLessThanOrEqual(KORTE_TEKST_MAX);
    expect(t?.korteTekst.endsWith("woord")).toBe(true);
    expect(t?.omschrijving.length).toBeLessThanOrEqual(1200);
    expect(t?.omschrijving.endsWith(".")).toBe(true);
    expect(leesProductTekst({ korteTekst: "Warm" })).toBeNull();
    expect(leesProductTekst({ omschrijving: "Kort" })).toBeNull();
    expect(leesProductTekst(null)).toBeNull();
    expect(leesProductTekst(42)).toBeNull();
  });

  it("knipOpWoord laat korte tekst staan en eindigt nooit op een komma", () => {
    expect(knipOpWoord("kort", 10)).toBe("kort");
    expect(knipOpWoord("een, twee, drie, vier", 12)).toBe("een, twee");
  });
});

describe("teControleren", () => {
  const invoer = productTekstInvoer(product({ naam: "Hoodie 2.0", omschrijving: "Van katoen." }), "Shop");

  it("noemt getallen en feitwoorden die niet in de gegevens staan", () => {
    expect(teControleren({ korteTekst: "Een warme hoodie.", omschrijving: "Van 100% biologisch katoen, met 2 jaar garantie. Ook als versie 2.0." }, invoer)).toEqual(["100%", "2 jaar", "biologisch", "garantie"]);
  });

  it("wat de eigenaar zelf schreef, telt als gegeven: geen meldingen", () => {
    expect(teControleren({ korteTekst: "Hoodie 2.0 van katoen.", omschrijving: "Kies uit S, M of L. Voor € 49,95." }, invoer)).toEqual([]);
  });
});

describe("POST /api/werkgever/sites/slim/producttekst", () => {
  const beheerder = { userId: "u1", email: "a@shop.test", fullName: "A", emailVerifiedAt: null, grants: [], memberships: [], managedBranchIds: [] } satisfies Principal;

  const klaar = () => {
    requirePrincipal.mockResolvedValue(beheerder);
    siteTenantOf.mockResolvedValue("t1");
    winkelSiteOf.mockResolvedValue(site([product()]));
    enforceRateLimit.mockResolvedValue({ ok: true });
  };

  it("geeft een voorstel uit het product van de eigen webshop, en slaat niets op", async () => {
    klaar();
    chatJson.mockResolvedValue({ korteTekst: "Een warme hoodie.", omschrijving: "Een hoodie voor koude dagen, met 2 jaar garantie." });
    const res = await POST(verzoek({ productId: "paaaaaaa1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voorstel: { korteTekst: "Een warme hoodie.", omschrijving: "Een hoodie voor koude dagen, met 2 jaar garantie.", controleer: ["2 jaar", "garantie"] } });
    expect(winkelSiteOf).toHaveBeenCalledWith("t1");
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "winkel-producttekst", identifier: "t1", limit: 60, windowSeconds: 3600 }));
    const vraag = chatJson.mock.calls[0]?.[0] as { purpose: string; messages: { role: string; content: string }[] };
    expect(vraag.purpose).toBe("winkel-producttekst");
    expect(vraag.messages[0]?.content).toMatch(/Verzin niets/);
    expect(vraag.messages[1]?.content).toContain('"product": "Hoodie"');
  });

  it("een product van een andere winkel (of verwijderd) bestaat niet", async () => {
    klaar();
    const res = await POST(verzoek({ productId: "pbestaatn1" }));
    expect(res.status).toBe(404);
    expect(chatJson).not.toHaveBeenCalled();
  });

  it("een onzinnig product-id wordt geweigerd", async () => {
    klaar();
    expect((await POST(verzoek({ productId: "../../x" }))).status).toBe(422);
  });

  it("de AI is weg: een Nederlandse melding, geen Engelse fout", async () => {
    klaar();
    chatJson.mockRejectedValue(AppError.upstream("LLM request timed out after 30000ms"));
    const res = await POST(verzoek({ productId: "paaaaaaa1" }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/^De AI kan nu geen tekst schrijven/);
    llmConfigProblem.mockReturnValue("geen model");
    chatJson.mockClear();
    expect((await POST(verzoek({ productId: "paaaaaaa1" }))).status).toBe(503);
    expect(chatJson).not.toHaveBeenCalled();
  });

  it("een onbruikbaar antwoord gooit niet alles weg maar zegt het netjes", async () => {
    klaar();
    chatJson.mockResolvedValue({ iets: "anders" });
    const res = await POST(verzoek({ productId: "paaaaaaa1" }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe("De AI gaf geen bruikbare tekst. Probeer het nog een keer.");
  });

  it("te vaak in een uur: 429 met Retry-After", async () => {
    klaar();
    enforceRateLimit.mockRejectedValue(AppError.rateLimited("Te veel.", 120, 60));
    const res = await POST(verzoek({ productId: "paaaaaaa1" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(chatJson).not.toHaveBeenCalled();
  });
});
