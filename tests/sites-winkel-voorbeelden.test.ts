import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Voorbeeldwebshops per ontwerp (11 nov 2026): voor elk ontwerp van Webshop openen
// een complete winkel op /site/voorbeeldwinkel-<ontwerp>. Ze moeten door dezelfde
// controle als een opslag in de studio, elke foto heeft een bron in CREDITS.md,
// niets is van een echt bedrijf, en als voorbeeld wordt er nooit iets besteld.

process.env.SITE_BUILDER_DIR = mkdtempSync(join(tmpdir(), "zf-winkelvoorbeeld-"));
const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
  kvListKeys: async (prefix: string) => [...store.keys()].filter((k) => k.startsWith(prefix)),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyValueStore: {
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        if (store.has(data.key)) throw new Prisma.PrismaClientKnownRequestError("dubbel", { code: "P2002", clientVersion: "5" });
        store.set(data.key, data.value);
        return data;
      },
    },
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined, privateRateLimitIdentifier: (s: string) => s }));
const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));
const importRemoteImage = vi.fn();
vi.mock("@/lib/media/clean-image", () => ({ importRemoteImage: (...a: unknown[]) => importRemoteImage(...a) }));

const { WINKEL_VOORBEELDEN, winkelVoorbeeldFotos, winkelVoorbeeldKaartfoto, winkelVoorbeeldPaginas, winkelVoorbeeldProductId, winkelVoorbeeldThema, winkelVoorbeeldVoorOntwerp, winkelVoorbeeldVoorSlug, winkelVoorbeeldWinkel } = await import("@/lib/sites/winkel-voorbeelden");
const { WEBSHOP_TEMPLATES } = await import("@/lib/sites/webshop-templates");
const { pexelsUrl } = await import("@/lib/sites/branche-voorbeelden");
const { slugify } = await import("@/lib/sites/types");
const { siteSaveSchema } = await import("@/lib/sites/schema");
const { renderFunctiesPagina, renderPage, renderWinkelPagina } = await import("@/lib/sites/render");
const { berekenBestelling, LEGE_INVOER } = await import("@/lib/sites/winkel");
const { winkelCheck } = await import("@/lib/sites/winkel-check");
const { betaalOpties } = await import("@/lib/sites/winkel-betalen");
const { ensureWinkelVoorbeeld, winkelVoorbeeldKaart } = await import("@/lib/sites/winkel-demo");
const { createSite, liveSiteBySlug } = await import("@/lib/sites/store");
const route = await import("@/app/site/[slug]/[[...path]]/route");
const fotoRoute = await import("@/app/(marketing)/voorbeeldsites/foto/[id]/route");
type SiteDoc = import("@/lib/sites/types").SiteDoc;
type WinkelVoorbeeld = import("@/lib/sites/winkel-voorbeelden").WinkelVoorbeeld;

const ROOT = join(__dirname, "..");
const CREDITS = readFileSync(join(ROOT, "public", "voorbeeldsites", "CREDITS.md"), "utf8");
const opts = { root: "/site/x/", origin: "https://zekerflex.com", version: "v1", noindex: true };
const NU = new Date("2026-11-11T12:00:00+01:00");
const html = (s: string) => s.replace(/&/g, "&amp;");

/** De winkel als site, met een nepfoto per foto (zoals na het aanmaken). */
function alsSite(v: WinkelVoorbeeld): SiteDoc {
  const fotos = winkelVoorbeeldFotos(v);
  const keys = Object.keys(fotos);
  const media = keys.map((k, i) => ({ id: `mfoto${String(i).padStart(5, "0")}`, file: `mfoto${String(i).padStart(5, "0")}.webp`, width: 1600, height: 1000, alt: fotos[k]!.alt, bron: "internet" as const }));
  const id = (k: string) => media[keys.indexOf(k)]?.id ?? null;
  return { id: "svoorbeeld1", tenantId: `voorbeeld:winkel-${v.id}`, soort: "webshop", slug: v.slug, theme: winkelVoorbeeldThema(v), bedrijf: v.bedrijf, pages: winkelVoorbeeldPaginas(v, id), winkel: winkelVoorbeeldWinkel(v, id), media, liveBuild: null, builds: [], createdAt: "", updatedAt: "", voorbeeld: true };
}

const alle = WINKEL_VOORBEELDEN.map((v) => [v.id, v] as const);

describe("voorbeeldwebshops per ontwerp", () => {
  it("elk ontwerp heeft een voorbeeldwinkel op /site/voorbeeldwinkel-<ontwerp>", () => {
    expect(WINKEL_VOORBEELDEN.map((v) => v.id).sort()).toEqual(WEBSHOP_TEMPLATES.map((t) => t.id).sort());
    expect(new Set(WINKEL_VOORBEELDEN.map((v) => v.slug)).size).toBe(WINKEL_VOORBEELDEN.length);
    expect(new Set(WINKEL_VOORBEELDEN.map((v) => v.code)).size).toBe(WINKEL_VOORBEELDEN.length);
    for (const v of WINKEL_VOORBEELDEN) {
      expect(v.slug).toBe(`voorbeeldwinkel-${v.id}`);
      expect(v.slug).toMatch(/^[a-z0-9-]{3,40}$/);
      // createSite maakt het adres van de naam bij het aanmaken
      expect(slugify(`Voorbeeldwinkel ${v.id}`)).toBe(v.slug);
      expect(winkelVoorbeeldVoorSlug(v.slug)).toBe(v);
      expect(winkelVoorbeeldVoorOntwerp(v.id)).toBe(v);
      expect(winkelVoorbeeldKaartfoto(v.id)).toBe(`/voorbeeldsites/foto/${v.id}`);
    }
    expect(winkelVoorbeeldVoorSlug("bakkerij-jansen")).toBeNull();
    expect(winkelVoorbeeldVoorOntwerp("constructor")).toBeNull();
  });

  it("elke foto komt één keer voor en staat met zijn nummer in CREDITS.md", () => {
    const nummers = WINKEL_VOORBEELDEN.flatMap((v) => Object.values(winkelVoorbeeldFotos(v)).map((f) => f.pexels));
    expect(new Set(nummers).size).toBe(nummers.length);
    for (const n of nummers) {
      expect(Number.isInteger(n) && n > 0).toBe(true);
      expect(CREDITS, `foto ${n} in CREDITS.md`).toContain(`Pexels, foto ${n} |`);
    }
  });

  it.each(alle)("%s: 10 tot 12 producten met foto, eerlijke prijzen, opties, een aanbieding en iets wat uitverkocht is", (_, v) => {
    expect(v.producten.length).toBeGreaterThanOrEqual(10);
    expect(v.producten.length).toBeLessThanOrEqual(12);
    const categorieen = new Set(v.producten.map((p) => p.categorie));
    expect(categorieen.size).toBeGreaterThanOrEqual(2);
    expect(categorieen.size).toBeLessThanOrEqual(4);
    for (const p of v.producten) {
      expect(Number.isInteger(p.prijsCents) && p.prijsCents > 0, p.naam).toBe(true);
      if (p.oudePrijsCents !== undefined) expect(Number.isInteger(p.oudePrijsCents) && p.oudePrijsCents > p.prijsCents, p.naam).toBe(true);
      expect(p.sleutel).toMatch(/^[a-z]+$/);
      expect(["hero", "over"]).not.toContain(p.sleutel);
      expect(p.foto.alt.length).toBeGreaterThan(10);
      expect(winkelVoorbeeldProductId(v, p)).toMatch(/^p[a-z0-9]{6,20}$/);
    }
    expect(new Set(v.producten.map((p) => p.sleutel)).size).toBe(v.producten.length);
    expect(new Set(v.producten.map((p) => slugify(p.naam))).size).toBe(v.producten.length);
    expect(v.producten.some((p) => p.uitverkocht)).toBe(true);
    expect(v.producten.some((p) => p.opties?.length)).toBe(true);
    expect(v.producten.some((p) => p.oudePrijsCents !== undefined)).toBe(true);
    expect(v.producten.find((p) => p.sleutel === v.uitgelicht.sleutel)?.uitverkocht).toBeFalsy();
    // elk product krijgt zijn eigen foto
    const s = alsSite(v);
    for (const p of s.winkel!.producten) expect(p.fotos).toHaveLength(1);
    expect(new Set(s.winkel!.producten.map((p) => p.fotos[0])).size).toBe(s.winkel!.producten.length);
  });

  it.each(alle)("%s: gaat door de controle van de studio, zonder iets van een echt bedrijf", (_, v) => {
    const s = alsSite(v);
    const parsed = siteSaveSchema.safeParse({ theme: s.theme, bedrijf: s.bedrijf, pages: s.pages, winkel: s.winkel });
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
    expect(v.bedrijf.telefoon).toBe("");
    expect(v.bedrijf.email).toBe("");
    expect(v.bedrijf.kvk).toBe("");
    expect(v.bedrijf.straat).toBe("");
    // betalen zonder rekeningnummer: dat zou van iemand anders kunnen zijn
    expect(s.winkel!.betalen?.iban).toBe("");
    expect(betaalOpties(s.winkel!)).toEqual(["afhalen", "rembours"]);
    for (const p of s.pages) for (const b of p.blocks) if (b.type === "reviews") {
      expect(b.props.kop).toContain("(voorbeeld)");
      for (const r of b.props.items) expect(r.naam).toBe("Voorbeeldklant");
    }
    // het ontwerp: zijn kleuren, in de stijl van een nieuwe webshop
    const t = WEBSHOP_TEMPLATES.find((x) => x.id === v.id)!;
    expect(s.theme).toMatchObject({ kleur: t.theme.kleur, accent: t.theme.accent, stijl: "premium" });
    expect(s.pages.map((p) => p.slug)).toEqual(["", "assortiment", "over-ons", "verzenden-en-retourneren", "voorwaarden", "contact"]);
  });

  it.each(alle)("%s: de winkelcheck vindt niets aan producten, prijzen en Google, en de wettelijke pagina's staan erin", (_, v) => {
    const check = winkelCheck({ site: alsSite(v), unpublished: false, canPublish: true });
    const punten = check.punten.filter((p) => ["producten", "prijzen", "google"].includes(p.groep) && p.id !== "uitverkocht-zichtbaar");
    expect(punten.map((p) => p.titel)).toEqual([]);
    expect(check.punten.filter((p) => p.id.startsWith("pagina-"))).toEqual([]);
  });

  it.each(alle)("%s: afrekenen werkt tot het bestellen, met verzendmethode, kortingscode, betaalmethode en btw", (_, v) => {
    const w = winkelVoorbeeldWinkel(v, () => "mfoto00000");
    const p = w.producten.find((x) => !x.uitverkocht && x.voorraad == null)!;
    const aantal = Math.min(99, Math.ceil((v.korting.minimumCents ?? 0) / p.prijsCents) + 1);
    const bezorgen = w.verzendmethoden!.find((m) => m.soort === "bezorgen" && m.gebied === "nl")!;
    const invoer = {
      ...LEGE_INVOER,
      aantallen: { [p.id]: aantal },
      keuzes: { [p.id]: (p.opties ?? []).map((o) => o.waarden[0]!) },
      levering: "bezorgen" as const,
      verzend: bezorgen.id,
      naam: "Test Klant",
      email: "klant@voorbeeld.test",
      telefoon: "0612345678",
      straat: "Dorpsstraat 1",
      postcode: "1234 AB",
      plaats: "Zonnedorp",
      betaalmethode: "rembours",
      kortingscode: v.korting.code.toLowerCase(),
    };
    const { concept, fouten } = berekenBestelling(w, invoer, { nu: NU, kortingGebruikt: 0 });
    expect(fouten).toEqual([]);
    expect(concept!.korting?.code).toBe(v.korting.code);
    expect(concept!.korting!.cents).toBeGreaterThan(0);
    expect(concept!.betaalmethode).toBe("rembours");
    expect(concept!.verzending?.id).toBe(bezorgen.id);
    expect(concept!.btw).toBeDefined();
    const btwErbij = v.btw.inclusief ? 0 : concept!.btw!.totaalCents;
    expect(concept!.totaalCents).toBe(concept!.subtotaalCents - concept!.korting!.cents + concept!.bezorgkostenCents + btwErbij);
    // uitverkocht is niet te bestellen
    const op = w.producten.find((x) => x.uitverkocht)!;
    const weg = berekenBestelling(w, { ...invoer, aantallen: { [op.id]: 1 }, keuzes: { [op.id]: (op.opties ?? []).map((o) => o.waarden[0]!) }, kortingscode: "" }, { nu: NU });
    expect(weg.fouten).toContain(`${op.naam} is uitverkocht.`);
  });

  it("eten rekent 9% btw, de koffiemolen 21%; de vakwinkel rekent exclusief btw", () => {
    const eten = winkelVoorbeeldWinkel(winkelVoorbeeldVoorOntwerp("eten")!, () => null);
    const molen = eten.producten.find((p) => p.btw === 21)!;
    const koffie = eten.producten.find((p) => p.btw === undefined && !p.uitverkocht && !p.opties)!;
    const invoer = { ...LEGE_INVOER, aantallen: { [molen.id]: 1, [koffie.id]: 1 }, naam: "Test", email: "t@voorbeeld.test", telefoon: "0612345678", verzend: "vwafhalen", betaalmethode: "afhalen" };
    const { concept } = berekenBestelling(eten, invoer, { nu: NU });
    expect(concept!.btw!.regels.map((r) => r.tarief).sort((a, b) => a - b)).toEqual([9, 21]);
    const vak = winkelVoorbeeldVoorOntwerp("vakwinkel")!;
    expect(vak.btw.inclusief).toBe(false);
    const s = alsSite(vak);
    const voorwaarden = s.pages.find((p) => p.slug === "voorwaarden")!;
    expect(JSON.stringify(voorwaarden.blocks)).toContain("zijn exclusief btw");
    const verzenden = s.pages.find((p) => p.slug === "verzenden-en-retourneren")!;
    expect(JSON.stringify(verzenden.blocks)).toContain("Alle bedragen zijn exclusief btw.");
    expect(renderWinkelPagina(s, { soort: "winkel" }, opts)).toContain("excl. btw");
  });

  it.each(alle)("%s: een complete webshop met de voorbeeldbalk, en bestellen zegt dat er niets besteld wordt", (_, v) => {
    const s = alsSite(v);
    const home = renderPage(s, s.pages[0]!, opts);
    expect(home).toContain("Dit is een voorbeeldwebshop");
    expect(home).toContain(`${html(v.bedrijf.naam)} bestaat niet`);
    expect(home).toContain("Open je eigen webshop");
    expect(home).toContain(html(v.hero.kop));
    expect(home).not.toContain("LocalBusiness");
    const verkrijgbaar = v.producten.filter((p) => !p.uitverkocht);
    expect(home).toContain(html(verkrijgbaar[0]!.naam));
    const winkel = renderWinkelPagina(s, { soort: "winkel" }, opts)!;
    for (const c of new Set(v.producten.map((p) => p.categorie))) expect(winkel).toContain(html(c));
    for (const p of v.producten) expect(renderWinkelPagina(s, { soort: "product", slug: slugify(p.naam) }, opts), p.naam).not.toBeNull();
    const bestellen = renderWinkelPagina(s, { soort: "bestellen" }, opts)!;
    expect(bestellen).toContain("je kunt alles proberen, maar er wordt niets besteld");
    const contact = renderPage(s, s.pages.find((p) => p.slug === "contact")!, opts);
    expect(contact).toContain("dit formulier verstuurt niets");
    const tour = renderFunctiesPagina(s, opts)!;
    expect(tour).toContain("Een echte webshop");
    expect(tour).toContain("Zo'n webshop voor jouw bedrijf?");
  });

  it("een gewone website houdt zijn eigen voorbeeldbalk", () => {
    const s = alsSite(WINKEL_VOORBEELDEN[0]!);
    const { soort, ...website } = s;
    void soort;
    const home = renderPage(website, website.pages[0]!, opts);
    expect(home).toContain("Dit is een voorbeeldwebsite");
    expect(home).not.toContain("voorbeeldwebshop");
  });
});

describe("voorbeeldwebshop aanmaken bij het eerste bezoek", () => {
  let echteFoto: Buffer | undefined;
  beforeEach(async () => {
    store.clear();
    sendMail.mockClear();
    echteFoto ??= await sharp({ create: { width: 60, height: 40, channels: 3, background: "#7a3e1d" } }).webp().toBuffer();
    importRemoteImage.mockReset();
    importRemoteImage.mockImplementation(async () => ({ bytes: echteFoto, width: 60, height: 40, sourceUrl: "" }));
  });

  it("maakt een gepubliceerde webshop, gemarkeerd als voorbeeld, met alle foto's van Pexels bij ons bewaard", async () => {
    const v = winkelVoorbeeldVoorOntwerp("algemeen")!;
    const res = await route.GET(new Request(`https://zekerflex.com/site/${v.slug}`), { params: Promise.resolve({ slug: v.slug }) });
    expect(res.status).toBe(200);
    const pagina = await res.text();
    expect(pagina).toContain("Dit is een voorbeeldwebshop");
    expect(pagina).toContain("Allerlei Zonnedorp bestaat niet");
    const live = (await liveSiteBySlug(v.slug))!;
    expect(live.snapshot.voorbeeld).toBe(true);
    expect(live.snapshot.soort).toBe("webshop");
    expect(live.snapshot.slug).toBe(v.slug);
    expect(live.snapshot.bedrijf.naam).toBe("Allerlei Zonnedorp");
    expect(live.snapshot.media).toHaveLength(Object.keys(winkelVoorbeeldFotos(v)).length);
    expect(live.snapshot.winkel!.producten).toHaveLength(v.producten.length);
    expect(live.snapshot.winkel!.producten.every((p) => p.fotos.length === 1)).toBe(true);
    expect(importRemoteImage).toHaveBeenCalledWith(pexelsUrl(v.hero.foto.pexels));
    // een tweede bezoek haalt niets meer op
    const keer = importRemoteImage.mock.calls.length;
    await ensureWinkelVoorbeeld(v);
    expect(importRemoteImage.mock.calls.length).toBe(keer);
  });

  it("bestellen op een voorbeeld bewaart en verstuurt niets", async () => {
    const v = winkelVoorbeeldVoorOntwerp("mode")!;
    await ensureWinkelVoorbeeld(v);
    const live = (await liveSiteBySlug(v.slug))!;
    const p = live.snapshot.winkel!.producten.find((x) => !x.uitverkocht && x.voorraad == null)!;
    const form = new FormData();
    form.set(`n_${p.id}`, "1");
    (p.opties ?? []).forEach((o, i) => form.set(`k_${p.id}_${i}`, o.waarden[0]!));
    for (const [k, w] of Object.entries({ naam: "Test Klant", email: "klant@voorbeeld.test", telefoon: "0612345678", verzend: "vwafhalen", betaalmethode: "afhalen", stap: "plaats" })) form.set(k, w);
    const res = await route.POST(new Request(`https://zekerflex.com/site/${v.slug}/_zf/bestelling`, { method: "POST", body: form }), { params: Promise.resolve({ slug: v.slug, path: ["_zf", "bestelling"] }) });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toContain("voorbeeld=1");
    expect([...store.keys()].some((k) => k.startsWith("site-bestelling:"))).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("de kaartfoto is de openingsfoto van de winkel, klein; zonder foto een vlak in de kleuren van het ontwerp", async () => {
    const v = winkelVoorbeeldVoorOntwerp("wonen")!;
    const foto = (await winkelVoorbeeldKaart(v))!;
    expect((await sharp(foto).metadata()).width).toBe(900);
    const res = await fotoRoute.GET(new Request("https://zekerflex.com/voorbeeldsites/foto/wonen"), { params: Promise.resolve({ id: "wonen" }) });
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect((await fotoRoute.GET(new Request("https://zekerflex.com/voorbeeldsites/foto/x"), { params: Promise.resolve({ id: "constructor" }) })).status).toBe(404);
    store.clear();
    importRemoteImage.mockRejectedValue(new Error("Pexels is weg"));
    const vlak = await fotoRoute.GET(new Request("https://zekerflex.com/voorbeeldsites/foto/beauty"), { params: Promise.resolve({ id: "beauty" }) });
    expect(vlak.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await vlak.text()).not.toContain("<text");
  });

  it("heeft een echt bedrijf het adres al, dan komt er geen voorbeeld", async () => {
    const v = winkelVoorbeeldVoorOntwerp("beauty")!;
    const echt = await createSite("t-echt", { userId: "u1", name: "Jan" }, { templateId: "algemeen", bedrijf: { naam: "Voorbeeldwinkel beauty", kvk: "", straat: "", postcode: "", plaats: "Rijssen", telefoon: "", email: "" } });
    expect(echt.slug).toBe(v.slug);
    await ensureWinkelVoorbeeld(v);
    expect(importRemoteImage).not.toHaveBeenCalled();
    expect((await liveSiteBySlug(v.slug))).toBeNull();
  });
});
