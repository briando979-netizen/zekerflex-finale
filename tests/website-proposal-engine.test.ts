import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Websitevoorstel voor sales: van de site van een bedrijf een nieuwe, luxe
// website maken op /site/<bedrijfsnaam>, met een voorstelpagina, echte prijzen
// en de introductiekorting voor de eerste bedrijven. Het voorstel mailt het
// bedrijf nooit vanzelf; hun "ja" bereikt alleen ons eigen team.

process.env.SITE_BUILDER_DIR = mkdtempSync(join(tmpdir(), "zf-voorstel-"));
const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
const lead = { id: "lead1", companyName: "Schildersbedrijf De Vries B.V.", kvkNumber: "12345678", city: "Rijssen", sector: "Bouw", sourceUrl: "https://devries-schilders.nl/vacatures", notes: null as string | null };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyValueStore: {
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        if (store.has(data.key)) throw new Prisma.PrismaClientKnownRequestError("dubbel", { code: "P2002", clientVersion: "5" });
        store.set(data.key, data.value);
        return data;
      },
    },
    user: {
      findFirst: async ({ where }: { where: { email: { equals: string } } }) => {
        const e = where.email.equals.toLowerCase();
        if (e === "beheer@echtbedrijf.nl") return { memberships: [{ tenantId: "t-echt", tenant: { name: "De Vries Schilders" } }] };
        if (e === "twee@bedrijven.nl") return { memberships: [{ tenantId: "t-a", tenant: { name: "A" } }, { tenantId: "t-b", tenant: { name: "B" } }] };
        if (e === "werker@example.nl") return { memberships: [] };
        return null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => ({ "u-sales": { email: "verkoper@zekerflex.test" }, "u-admin": { email: "beheer@zekerflex.test" } })[where.id] ?? null,
    },
    salesLead: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === lead.id ? { ...lead } : null),
      update: async ({ data }: { data: { notes?: string } }) => {
        if (data.notes !== undefined) lead.notes = data.notes;
        return lead;
      },
    },
    membership: {
      count: async ({ where }: { where: { userId: string; role: string } }) => (where.userId === "u-admin" && where.role === "PLATFORM_ADMIN" ? 1 : 0),
    },
  },
}));
const sendUserPush = vi.fn().mockResolvedValue(1);
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
const alertOwner = vi.fn().mockResolvedValue("sent");
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => alertOwner(...a) }));
const markLeadReplied = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/sales/reply", () => ({ markLeadReplied: (...a: unknown[]) => markLeadReplied(...a) }));
vi.mock("@/lib/telephony/lines", () => ({ pricingFor: async () => ({ lineCents: 1250 }) }));
vi.mock("@/lib/website/manage", () => ({
  WEBSITE_PLANS: {
    basis: { label: "Basis", priceCentsPerMonth: 4900, blurb: "Onderhoud.", features: ["Uptime-bewaking"] },
    pro: { label: "Pro", priceCentsPerMonth: 9900, blurb: "Meer.", features: ["SEO"] },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined, privateRateLimitIdentifier: (s: string) => s }));
const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));
const importRemoteImage = vi.fn();
vi.mock("@/lib/media/clean-image", () => ({ importRemoteImage: (...a: unknown[]) => importRemoteImage(...a) }));

const OUDE_SITE = `<!doctype html><html><head><title>Home | Schildersbedrijf De Vries - Rijssen</title></head><body>
<img src="/img/logo.png" alt="Logo De Vries">
<p>Schildersbedrijf De Vries verzorgt al dertig jaar het binnen- en buitenschilderwerk voor particulieren en bedrijven in Rijssen en omgeving, altijd netjes en op tijd.</p>
<h2>Binnenschilderwerk</h2><p>Muren, plafonds en kozijnen: strak geschilderd, zonder rommel achter te laten.</p>
<h2>Buitenschilderwerk</h2><p>Duurzame verf die tegen het Nederlandse weer kan.</p>
<img src="/foto/huis.jpg" width="1600" height="900"><img src="/foto/kozijn.jpg" width="1200" height="1200"><img src="/foto/ladder.jpg"><img src="/foto/team.jpg">
<font color="red">Bel ons!</font> <a href="tel:06-12345678">06-12345678</a> <a href="mailto:info@devries-schilders.nl">mail</a>
<p>Dorpsstraat 12, 7461 AB Rijssen</p><p>© 2019 Schildersbedrijf De Vries</p></body></html>`;

const runWebsiteCheck = vi.fn();
vi.mock("@/lib/website-check/run", async (importOriginal) => ({ ...(await importOriginal<object>()), runWebsiteCheck: (...a: unknown[]) => runWebsiteCheck(...a) }));
const fetchPage = vi.fn();
vi.mock("@/lib/website-check/fetch", async (importOriginal) => ({ ...(await importOriginal<object>()), fetchPage: (...a: unknown[]) => fetchPage(...a) }));

const site = await import("@/lib/sites/proposal-site");
const engine = await import("@/lib/sales/website-proposal");
const { liveSiteBySlug, getSite } = await import("@/lib/sites/store");
const { handleSiteContact, serveSitePath } = await import("@/lib/sites/serve");
const { siteSaveSchema } = await import("@/lib/sites/schema");
const { extractBusiness } = await import("@/lib/website-check/proposal");
const akkoordRoute = await import("@/app/api/websitevoorstel/[id]/akkoord/route");

const BY = { userId: "u-sales", name: "Sanne Sales" };
const check = (host = "devries-schilders.nl") => ({
  id: "abcdef0123456789",
  at: "2026-11-03T09:00:00.000Z",
  url: `https://${host}/`,
  finalUrl: `https://${host}/`,
  host,
  score: 48,
  categories: [{ id: "snelheid", label: "Snelheid", score: 40 }],
  findings: [
    { id: "description", category: "google", status: "probleem", title: "Geen omschrijving voor Google", detail: "…" },
    { id: "https", category: "veiligheid", status: "goed", title: "Beveiligde verbinding", detail: "…" },
  ],
  metrics: { ttfbMs: 900, totalMs: 1500, htmlBytes: 20_000, transferBytes: 20_000, scripts: 3, images: 5, linksChecked: 0, brokenLinks: 0 },
  platform: null,
  leadId: null,
});

beforeEach(() => {
  store.clear();
  lead.notes = null;
  [alertOwner, markLeadReplied, sendMail, importRemoteImage, runWebsiteCheck, fetchPage, sendUserPush].forEach((m) => m.mockClear());
  importRemoteImage.mockImplementation(async (url: string) => {
    if (url.endsWith("ladder.jpg")) throw new Error("404");
    if (url.endsWith("logo.png")) return { bytes: Buffer.from("logo"), width: 400, height: 120, sourceUrl: url };
    return { bytes: Buffer.from("foto"), width: url.endsWith("huis.jpg") ? 1600 : 1200, height: url.endsWith("huis.jpg") ? 900 : 1200, sourceUrl: url };
  });
  runWebsiteCheck.mockImplementation(async (url: string) => check(new URL(url).hostname));
  fetchPage.mockImplementation(async (url: string) => ({ status: 200, finalUrl: url, body: OUDE_SITE, headers: {} }));
});

describe("de nieuwe website: puur", () => {
  it("kiest een branche, een kleur die werkt en nette telefoonnummers", () => {
    expect(site.templateFor("Schildersbedrijf De Vries Binnenschilderwerk").id).toBe("bouw");
    expect(site.templateFor("Bakkerij Modern Desembrood").id).toBe("horeca");
    expect(site.templateFor("Adviesbureau Kompas").id).toBe("algemeen");
    const bouw = site.templateFor("schilder");
    // sinds 4 nov in de stijl beleving, precies zoals schwarzwald.zekerflex.com: zonder eigen kleur hun bosgroen en oranje
    expect(site.proposalTheme("#14213D", bouw, null)).toMatchObject({ kleur: "#14213D", accent: "#FF5F1F", stijl: "beleving" });
    expect(site.proposalTheme("#F5C04E", bouw, "mlogo12345")).toMatchObject({ kleur: "#325A46", accent: "#F5C04E", logo: "mlogo12345" });
    expect(site.proposalTheme(null, bouw, null)).toMatchObject({ kleur: "#325A46", accent: "#FF5F1F", stijl: "beleving" });
    expect(["0548123456", "0612345678", "+31201234567", "085 123 4567", "12345"].map(site.formatPhone)).toEqual(["0548 123 456", "06 1234 5678", "020 123 4567", "085 123 4567", "12345"]);
  });

  it("neemt de naam van de eigen site, tenzij die niets met de inschrijving te maken heeft", () => {
    expect(site.proposalName("Schildersbedrijf De Vries", "Schildersbedrijf De Vries B.V.")).toBe("Schildersbedrijf De Vries");
    expect(site.proposalName("Welkom op onze vernieuwde site", "Kapsalon Knip")).toBe("Kapsalon Knip");
    expect(site.proposalName(null, null)).toBe("Je bedrijf");
    expect(site.listOf(["Binnenschilderwerk", "Buitenschilderwerk", "Behangen"])).toBe("Binnenschilderwerk, buitenschilderwerk en behangen");
    // een dienst met "en" erin: alleen komma's, anders lopen de "en"s door elkaar
    expect(site.listOf(["Desembrood", "Banket en croissants", "Taarten op bestelling"])).toBe("Desembrood, banket en croissants, taarten op bestelling");
  });

  it("maakt pagina's die door de controle van de bouwer komen, zonder verzonnen voorbeelden", () => {
    const facts = extractBusiness(OUDE_SITE, "https://devries-schilders.nl/");
    const company = site.proposalCompany(facts, { naam: lead.companyName, plaats: "Rijssen", kvk: "12345678", sector: "Bouw" });
    expect(company).toMatchObject({ naam: "Schildersbedrijf De Vries", kvk: "12345678", telefoon: "06 1234 5678", whatsapp: "06 1234 5678", plaats: "Rijssen" });
    let n = 0;
    const pages = site.proposalPages(company, site.templateFor("schilder"), facts, { hero: "mhero00001", over: null, galerij: [] }, () => `b${n++}`);
    const parsed = siteSaveSchema.safeParse({ theme: site.proposalTheme(null, site.templateFor("schilder"), null), bedrijf: company, pages });
    expect(parsed.success).toBe(true);
    const text = JSON.stringify(pages);
    expect(text).toContain("Binnenschilderwerk en buitenschilderwerk in Rijssen en omgeving.");
    expect(text).toContain("Muren, plafonds en kozijnen"); // hun eigen woorden
    // sinds 4 nov 2026: geen voorbeeldreviews of voorbeeldtijden meer; wat we niet weten, staat er niet
    expect(text).not.toContain("voorbeeld");
    expect(pages[0]!.blocks.map((b) => b.type)).toEqual(["hero", "tekstFoto", "diensten", "stappen", "cta"]);
    expect(text).toContain("Vraag een offerte aan");
    // Google toont 50 tot 160 tekens onder de titel; ook een korte openingszin wordt aangevuld
    for (const page of pages) expect(page.seoOmschrijving.length, page.titel).toBeGreaterThanOrEqual(50);
    for (const page of pages) expect(page.seoOmschrijving.length, page.titel).toBeLessThanOrEqual(160);
    expect(pages[0]!.seoOmschrijving.startsWith("Binnenschilderwerk en buitenschilderwerk in Rijssen en omgeving. Schildersbedrijf De Vries verzorgt")).toBe(true);
    expect(site.homeDescription("Vakwerk, eerlijk en op tijd.", "Al dertig jaar uw schilder in de regio.")).toBe("Vakwerk, eerlijk en op tijd. Al dertig jaar uw schilder in de regio.");
    const lang = "Binnenschilderwerk, buitenschilderwerk, behangen en glaszetten voor particulieren en bedrijven.";
    expect(site.homeDescription(lang, "Iets anders.")).toBe(lang);
    expect(site.pickPhotos([{ id: "a", width: 800, height: 800 }, { id: "b", width: 1600, height: 900 }, { id: "c", width: 900, height: 900 }, { id: "d", width: 900, height: 900 }])).toEqual({ hero: "b", over: "a", galerij: ["c", "d"] });
  });

  it("vult de site met hun echte gegevens: foto per dienst, sterke punten, uren, vragen, klantverhalen, aanbod- en fotopagina", () => {
    const facts = {
      ...extractBusiness(OUDE_SITE, "https://devries-schilders.nl/"),
      secties: ["Binnenschilderwerk", "Buitenschilderwerk", "Behangen", "Glaszetten", "Houtrot herstel"].map((kop) => ({ kop, tekst: `${kop} door vakmensen, netjes en op tijd opgeleverd.` })),
      uren: [{ dag: "Maandag t/m vrijdag", tijd: "07:30 – 16:30" }],
      google: { rating: 4.7, aantal: 86, mapsUrl: null },
      sinds: 1994,
      usps: ["Eigen vakmensen, geen inhuur"],
      faq: [{ vraag: "Werken jullie ook in de winter?", antwoord: "Ja, binnen werken we het hele jaar door." }],
      getuigenissen: [{ naam: "Familie Jansen", tekst: "Ons huis is weer als nieuw, en alles netjes opgeruimd.", sterren: null }],
    };
    const company = site.proposalCompany(facts, { naam: null, plaats: "Rijssen", kvk: null, sector: null });
    const media = ["h", "a", "b", "c", "d", "e", "f", "g"].map((x, i) => ({ id: `m${x}000000${i}`, width: i === 0 ? 1600 : 1000, height: 900 }));
    const photos = site.pickPhotos(media, facts.secties.length);
    expect(photos.diensten).toHaveLength(5);
    expect(photos.alle).toHaveLength(8);
    let n = 0;
    const pages = site.proposalPages(company, site.templateFor("schilder"), facts, photos, () => `b${n++}`, new Date("2026-11-04T12:00:00Z"));
    expect(siteSaveSchema.safeParse({ theme: site.proposalTheme(null, site.templateFor("schilder"), null), bedrijf: company, pages }).success).toBe(true);
    expect(pages.map((p) => p.slug)).toEqual(["", "aanbod", "over-ons", "fotos", "contact"]);
    const home = pages[0]!;
    // 8 foto's: opening, over ons en vijf dienstkaarten; de fotopagina toont ze allemaal
    expect(home.blocks.map((b) => b.type)).toEqual(["hero", "tekstFoto", "diensten", "usps", "stappen", "reviews", "cta"]);
    const diensten = home.blocks.find((b) => b.type === "diensten") as Extract<(typeof home.blocks)[number], { type: "diensten" }>;
    expect(diensten.props.items.every((it) => Boolean(it.foto))).toBe(true);
    const text = JSON.stringify(pages);
    expect(text).toContain("4,7 op Google");
    expect(text).toContain("Sinds 1994");
    expect(text).toContain("Al 32 jaar in Rijssen.");
    expect(text).toContain("Eigen vakmensen, geen inhuur");
    expect(text).toContain("07:30 – 16:30");
    expect(text).toContain("Werken jullie ook in de winter?");
    expect(text).toContain('"naam":"Familie Jansen","tekst":"Ons huis is weer als nieuw, en alles netjes opgeruimd.","sterren":0');
    expect(text).not.toContain("voorbeeld");
    for (const page of pages) expect(page.seoOmschrijving.length, page.titel).toBeGreaterThanOrEqual(50);
  });
});

describe("een voorstel maken", () => {
  it("leest de site, bouwt de nieuwe op /site/<bedrijfsnaam> als ontwerpvoorstel en bewaart het verbeterplan", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    expect(runWebsiteCheck).toHaveBeenCalledWith("https://devries-schilders.nl/");
    expect(p).toMatchObject({ bedrijf: "Schildersbedrijf De Vries", slug: "schildersbedrijf-de-vries", status: "concept", host: "devries-schilders.nl", leadId: "lead1" });
    expect(engine.isProposalId(p.id)).toBe(true);
    expect(p.punten.map((x) => x.id)).toEqual(expect.arrayContaining(["description", "privacy", "verouderd", "reviews"]));
    expect(p.punten.every((x) => x.wij.length > 20)).toBe(true);
    expect(p.goed).toContain("Beveiligde verbinding");

    const live = (await liveSiteBySlug("schildersbedrijf-de-vries"))!;
    expect(live.snapshot.voorstel).toEqual({ officieel: "devries-schilders.nl", verloopt: p.expiresAt });
    expect(live.snapshot.theme.stijl).toBe("beleving");
    expect(live.snapshot.theme.logo).toBeTruthy();
    expect(live.snapshot.media).toHaveLength(4); // logo + 3 foto's; de foto die niet laadde is overgeslagen
    const home = await serveSitePath(live, [], { origin: "https://zekerflex.com", noindex: false, root: "/site/schildersbedrijf-de-vries/" });
    expect(home.headers.get("x-robots-tag")).toBe("noindex");
    expect(await home.text()).toContain("Dit is niet de officiële website van Schildersbedrijf De Vries");
  });

  it("maakt geen tweede voorstel terwijl het eerste nog loopt, en nooit voor ZekerFlex zelf", async () => {
    await engine.createWebsiteProposal({ url: "devries-schilders.nl" }, BY);
    await expect(engine.createWebsiteProposal({ url: "https://www.devries-schilders.nl" }, BY)).rejects.toThrow(/al een voorstel/);
    await expect(engine.createWebsiteProposal({ url: "zekerflex.com" }, BY)).rejects.toThrow(/ZekerFlex zelf/);
    await expect(engine.createWebsiteProposal({}, BY)).rejects.toThrow(/geen website bekend/);
  });

  it("het formulier op de voorstelsite verstuurt niets naar het echte bedrijf", async () => {
    await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    const live = (await liveSiteBySlug("schildersbedrijf-de-vries"))!;
    const form = new FormData();
    form.set("naam", "Piet");
    form.set("email", "piet@example.nl");
    form.set("bericht", "Hoi");
    const res = await handleSiteContact(new Request("https://zekerflex.com/site/x/_zf/contact", { method: "POST", body: form }), live, { origin: "https://zekerflex.com", noindex: true, thanks: "/x", address: "x" });
    expect(res.status).toBe(403);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("de nieuwe website meten", () => {
  const finding = (id: string, status: "goed" | "let-op" | "probleem") => ({ id, category: "google", status, title: id, detail: "…" });

  it("meet de nieuwe site met dezelfde check, zonder wat alleen bij een voorstel bewust anders is", async () => {
    runWebsiteCheck.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.hostname !== "localhost") return check(u.hostname);
      return { ...check(u.hostname), url, finalUrl: url, findings: [finding("noindex", "probleem"), finding("robots", "probleem"), finding("jsonld", "let-op"), finding("og", "let-op")] };
    });
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    const urls = runWebsiteCheck.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.startsWith("http://localhost:3000/site/schildersbedrijf-de-vries?meting="))).toBe(true);
    // alleen "og" telt mee: Google 100 - 12 = 88, de rest 100, gemiddeld 97,6
    expect(p.nieuw).toMatchObject({ score: 98, checkId: "abcdef0123456789" });
    expect(p.nieuw?.categorieen.find((c) => c.id === "google")?.score).toBe(88);
    expect((await engine.getWebsiteProposal(p.id))?.nieuw?.score).toBe(98);
  });

  it("lukt meten niet, dan staat het voorstel er gewoon, zonder nieuwe score", async () => {
    runWebsiteCheck.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.hostname === "localhost") throw new Error("time-out");
      return check(u.hostname);
    });
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    expect(p.status).toBe("concept");
    expect(p.nieuw).toBeUndefined();
    expect(await engine.measureNewSite(p.id)).toBeNull();
  });

  it("een ingetrokken voorstel wordt niet meer gemeten", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    await engine.updateWebsiteProposal(p.id, "ingetrokken", BY);
    runWebsiteCheck.mockClear();
    expect(await engine.measureNewSite(p.id)).toBeNull();
    expect(runWebsiteCheck).not.toHaveBeenCalled();
  });
});

describe("ja zeggen en de introductiekorting", () => {
  const ja = { naam: "Jan de Vries", email: "jan@devries.test", telefoon: "", pakket: "basis" as const, domein: "houden" as const, opmerking: "", begrepen: true as const };

  it("de eerste ja krijgt plek 1 met korting, een herhaling telt niet dubbel, en het team krijgt een melding", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    const first = await engine.acceptWebsiteProposal(p.id, ja);
    expect(first.nieuw).toBe(true);
    expect(first.proposal.akkoord).toMatchObject({ plek: 1, prijs: { websiteCents: 49500, kortingPct: 50, teBetalenCents: 24750, maandCents: 4900 } });
    expect(first.proposal.status).toBe("akkoord");
    expect(markLeadReplied).toHaveBeenCalledWith("lead1", null);
    expect(lead.notes).toMatch(/ja op het websitevoorstel \(Basis, introductieplek 1\)/);
    expect(alertOwner).not.toHaveBeenCalled(); // testadres: geen melding
    const again = await engine.acceptWebsiteProposal(p.id, ja);
    expect(again.nieuw).toBe(false);
    expect((await engine.launchPlaces(50)).taken).toBe(1);
  });

  it("zijn de plekken op, dan geldt de gewone prijs", async () => {
    await engine.saveProposalPricing({ websiteCents: 60000, kortingPct: 25, plekken: 1, geldigDagen: 30 }, "u-admin");
    const a = await engine.createWebsiteProposal({ url: "devries-schilders.nl" }, BY);
    const b = await engine.createWebsiteProposal({ url: "bakkerijmodern.nl" }, BY);
    expect((await engine.acceptWebsiteProposal(a.id, { ...ja, email: "jan@echtbedrijf.nl" })).proposal.akkoord?.plek).toBe(1);
    expect(alertOwner).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(alertOwner.mock.calls[0])).not.toContain("jan@echtbedrijf.nl"); // geen persoonsgegevens in pushmeldingen
    const second = (await engine.acceptWebsiteProposal(b.id, { ...ja, pakket: "pro" })).proposal.akkoord!;
    expect(second).toMatchObject({ plek: null, prijs: { websiteCents: 60000, kortingPct: 0, teBetalenCents: 60000, maandCents: 9900 } });
    expect((await engine.proposalOffer()).website.kortingCents).toBeNull();
  });

  it("intrekken haalt de site offline, geeft het adres en de plek vrij", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    await engine.acceptWebsiteProposal(p.id, ja);
    const done = await engine.updateWebsiteProposal(p.id, "ingetrokken", BY);
    expect(done.status).toBe("ingetrokken");
    expect(await liveSiteBySlug("schildersbedrijf-de-vries")).toBeNull();
    expect(store.has("site-slug:schildersbedrijf-de-vries")).toBe(false);
    expect((await engine.launchPlaces(50)).taken).toBe(0);
    await expect(engine.acceptWebsiteProposal(p.id, ja)).rejects.toThrow(/bestaat niet/);
    // een nieuw voorstel mag weer, op hetzelfde adres
    expect((await engine.createWebsiteProposal({ leadId: "lead1" }, BY)).slug).toBe("schildersbedrijf-de-vries");
  });

  it("een verlopen voorstel toont niets meer en neemt geen ja aan; verlengen zet het terug", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    const old = { ...(store.get(`wvoorstel:${p.id}`) as object), expiresAt: "2026-01-01T00:00:00.000Z" };
    store.set(`wvoorstel:${p.id}`, old);
    await expect(engine.acceptWebsiteProposal(p.id, ja)).rejects.toThrow(/verlopen/);
    const s = (await getSite(p.siteId))!;
    const expired = { snapshot: { ...s, voorstel: { officieel: null, verloopt: "2026-01-01T00:00:00.000Z" } }, buildId: "x", siteId: s.id, domein: null };
    expect((await serveSitePath(expired, [], { origin: "https://zekerflex.com", noindex: true, root: "/site/x/" })).status).toBe(410);
    const longer = await engine.updateWebsiteProposal(p.id, "verlengen", BY);
    expect(engine.isExpired(longer)).toBe(false);
    expect((await liveSiteBySlug(p.slug))!.snapshot.voorstel?.verloopt).toBe(longer.expiresAt);
  });
});

describe("opvolgen door wie het voorstel maakte (autopilot)", () => {
  it("nabellen 2 tot 14 dagen na het openen, herinnering 3 dagen voor het verloopt, een concept na 2 dagen nog versturen; nooit na ja of zonder maker", async () => {
    const base = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    const DAY = 86_400_000;
    const t0 = Date.parse(base.createdAt);
    const at = (days: number) => new Date(t0 + days * DAY);
    const end = Date.parse(base.expiresAt);
    const viewed = { ...base, status: "bekeken" as const, viewedAt: base.createdAt };
    // gemaakt maar nog niet verstuurd: na twee dagen één seintje, anders verloopt het ongezien
    expect(base.status).toBe("concept");
    expect(engine.dueReminders([base], at(1))).toEqual([]);
    const unsent = engine.dueReminders([base], at(5));
    expect(unsent).toEqual([expect.objectContaining({ id: `${base.id}:versturen`, title: "✉️ Websitevoorstel nog niet verstuurd" })]);
    expect(unsent[0]!.body).toMatch(new RegExp(`^Het voorstel voor ${base.bedrijf} staat sinds \\w+dag \\d+ \\w+ klaar, maar is nog niet verstuurd`));
    expect(engine.dueReminders([base], new Date(end + 1000))).toEqual([]);
    expect(engine.dueReminders([{ ...base, createdById: undefined }], at(5))).toEqual([]);
    expect(engine.dueReminders([viewed], at(1))).toEqual([]); // te vroeg
    const due = engine.dueReminders([viewed], at(3));
    expect(due).toEqual([expect.objectContaining({ id: `${base.id}:nabellen`, title: "📞 Even nabellen?" })]);
    expect(due[0]!.body).toMatch(new RegExp(`^${base.bedrijf} opende je websitevoorstel op \\w+dag \\d+ \\w+ en reageerde nog niet`));
    expect(engine.dueReminders([viewed], at(15))).toEqual([]); // na twee weken niet meer
    expect(engine.dueReminders([viewed], new Date(end - 2 * DAY))).toEqual([
      expect.objectContaining({ id: `${base.id}:verloopt:${base.expiresAt}`, title: "⏳ Websitevoorstel verloopt bijna" }),
    ]);
    expect(engine.dueReminders([viewed], new Date(end + 1000))).toEqual([]); // verlopen
    // verstuurd maar nooit geopend: alleen de herinnering voor het verlopen
    const sent = { ...base, status: "verstuurd" as const };
    expect(engine.dueReminders([sent], at(3))).toEqual([]);
    expect(engine.dueReminders([sent], new Date(end - DAY))).toHaveLength(1);
    const yes = await engine.acceptWebsiteProposal(base.id, { naam: "Jan", email: "jan@devries.test", telefoon: "", pakket: "basis", domein: "houden", opmerking: "", begrepen: true });
    expect(engine.dueReminders([{ ...viewed, akkoord: yes.proposal.akkoord }], at(3))).toEqual([]);
    expect(engine.dueReminders([{ ...viewed, createdById: undefined }], at(3))).toEqual([]);
  });
});

describe("na een ja: overzetten naar het bedrijfsaccount", () => {
  const ja = { naam: "Jan de Vries", email: "jan@devries.test", telefoon: "", pakket: "basis" as const, domein: "houden" as const, opmerking: "", begrepen: true as const };

  it("de site wordt van het bedrijf: zonder band, offline tot zij publiceren, zonder oude versies", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    await expect(engine.transferWebsiteProposal(p.id, "beheer@echtbedrijf.nl", BY)).rejects.toThrow(/pas over als het bedrijf ja heeft gezegd/);
    await engine.acceptWebsiteProposal(p.id, ja);
    const done = await engine.transferWebsiteProposal(p.id, "Beheer@EchtBedrijf.nl", BY);
    expect(done).toMatchObject({ status: "overgezet", overgezet: { tenantId: "t-echt", bedrijf: "De Vries Schilders" } });
    expect(done.akkoord?.plek).toBe(1); // de introductieplek blijft van hen
    const s = (await getSite(p.siteId))!;
    expect(s).toMatchObject({ tenantId: "t-echt", liveBuild: null, builds: [] });
    expect(s.voorstel).toBeUndefined();
    expect(store.get("site-tenant:t-echt")).toBe(p.siteId);
    expect(store.has(`site-tenant:voorstel:${p.id}`)).toBe(false);
    expect([...store.keys()].some((k) => k.startsWith(`site-build:${p.siteId}:`))).toBe(false);
    expect(await liveSiteBySlug(p.slug)).toBeNull();
    // daarna raakt niets uit het voorstel hun website meer
    await expect(engine.updateWebsiteProposal(p.id, "ingetrokken", BY)).rejects.toThrow(/al overgezet/);
    await expect(engine.updateWebsiteProposal(p.id, "verlengen", BY)).rejects.toThrow(/al overgezet/);
    expect(store.get("site-slug:schildersbedrijf-de-vries")).toBe(p.siteId);
  });

  it("alleen een lopend voorstel is in de bouwer aan te passen, en opslaan houdt de voorstelband", async () => {
    const { saveSite } = await import("@/lib/sites/store");
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    const s = await engine.editableProposalSite(p.id);
    expect(s.id).toBe(p.siteId);
    const saved = await saveSite(s.id, siteSaveSchema.parse({ theme: s.theme, bedrijf: { ...s.bedrijf, naam: "Schildersbedrijf De Vries & Zn" }, pages: s.pages }));
    expect(saved.voorstel).toEqual({ officieel: "devries-schilders.nl", verloopt: p.expiresAt });
    expect(saved.bedrijf.naam).toBe("Schildersbedrijf De Vries & Zn");
    await engine.acceptWebsiteProposal(p.id, ja);
    await engine.transferWebsiteProposal(p.id, "beheer@echtbedrijf.nl", BY);
    await expect(engine.editableProposalSite(p.id)).rejects.toThrow(/van het bedrijf/);
    const q = await engine.createWebsiteProposal({ url: "bakkerijmodern.nl" }, BY);
    await engine.updateWebsiteProposal(q.id, "ingetrokken", BY);
    await expect(engine.editableProposalSite(q.id)).rejects.toThrow(/ingetrokken/);
  });

  it("alleen naar precies één bedrijf, en nooit over een bestaande website heen", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    await engine.acceptWebsiteProposal(p.id, ja);
    await expect(engine.transferWebsiteProposal(p.id, "onbekend@nergens.nl", BY)).rejects.toThrow(/Geen beheerder van een bedrijf/);
    await expect(engine.transferWebsiteProposal(p.id, "werker@example.nl", BY)).rejects.toThrow(/Geen beheerder van een bedrijf/);
    await expect(engine.transferWebsiteProposal(p.id, "twee@bedrijven.nl", BY)).rejects.toThrow(/meer dan één bedrijf \(A, B\)/);
    store.set("site-tenant:t-echt", "sbestaand1");
    store.set("site:sbestaand1", { id: "sbestaand1", tenantId: "t-echt" });
    await expect(engine.transferWebsiteProposal(p.id, "beheer@echtbedrijf.nl", BY)).rejects.toThrow(/heeft al een website/);
    expect((await engine.getWebsiteProposal(p.id))!.status).toBe("akkoord");
  });

  it("het beheer ziet of het account van de ja al klaarstaat, alleen bij een ja", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    expect(await engine.proposalAccounts([p])).toEqual({});
    const yes = await engine.acceptWebsiteProposal(p.id, { ...ja, email: "jan@devries.test" });
    expect(await engine.proposalAccounts([yes.proposal])).toEqual({});
    const at = (email: string) => ({ ...yes.proposal, akkoord: { ...yes.proposal.akkoord!, email } });
    expect(await engine.proposalAccounts([at("Beheer@EchtBedrijf.nl")])).toEqual({ [p.id]: ["De Vries Schilders"] });
    expect(await engine.proposalAccounts([at("twee@bedrijven.nl")])).toEqual({ [p.id]: ["A", "B"] });
    expect(await engine.proposalAccounts([at("werker@example.nl")])).toEqual({});
    const done = await engine.transferWebsiteProposal(p.id, "beheer@echtbedrijf.nl", BY);
    expect(await engine.proposalAccounts([{ ...done, akkoord: at("beheer@echtbedrijf.nl").akkoord }])).toEqual({});
  });
});

describe("het openbare ja-formulier", () => {
  const post = (id: string, body: unknown) => akkoordRoute.POST(new Request(`https://zekerflex.com/api/websitevoorstel/${id}/akkoord`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id }) });

  it("controleert de gegevens, mailt alleen ons team en de invuller, en één keer", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    const bad = await post(p.id, { naam: "Jan", email: "geen-mail", pakket: "basis", domein: "houden", begrepen: true });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.message).toMatch(/e-mailadres/);
    const ok = await post(p.id, { naam: "Jan de Vries", email: "jan@echtbedrijf.nl", pakket: "pro", domein: "verhuizen", begrepen: true });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, plek: 1, kortingPct: 50 });
    expect(sendMail.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(["sales@zekerflex.com", "jan@echtbedrijf.nl"]);
    await post(p.id, { naam: "Jan de Vries", email: "jan@echtbedrijf.nl", pakket: "pro", domein: "verhuizen", begrepen: true });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("alleen bekeken en het ja-formulier zijn zonder login bereikbaar, het beheer niet", async () => {
    const { isPublicApiRoute } = await import("@/lib/auth/public-routes");
    expect(isPublicApiRoute("/api/websitevoorstel/0123456789abcdef01234567/akkoord")).toBe(true);
    expect(isPublicApiRoute("/api/websitevoorstel/0123456789abcdef01234567/bekeken")).toBe(true);
    expect(isPublicApiRoute("/api/admin/websitevoorstellen")).toBe(false);
    expect(isPublicApiRoute("/api/admin/websitevoorstellen/0123456789abcdef01234567")).toBe(false);
  });

  it("de eerste keer bekeken: één pushmelding aan wie het voorstel maakte, met het tijdstip", async () => {
    const { amsterdamClock } = await import("@/lib/time/amsterdam");
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    expect(p.createdById).toBe("u-sales");
    await engine.recordProposalView(p.id);
    await engine.recordProposalView(p.id);
    const seen = (await engine.getWebsiteProposal(p.id))!;
    expect(seen).toMatchObject({ views: 2, status: "bekeken" });
    expect(sendUserPush).toHaveBeenCalledTimes(1);
    expect(sendUserPush).toHaveBeenCalledWith(["u-sales"], expect.objectContaining({
      body: `${p.bedrijf} opende je websitevoorstel om ${amsterdamClock(seen.viewedAt!)}. Een goed moment om even te bellen.`,
      data: expect.objectContaining({ url: "/sales/websitevoorstellen", tag: `wvoorstel-${p.id}` }),
    }));
    // gemaakt in het beheer: de melding opent het beheer
    const q = await engine.createWebsiteProposal({ url: "bakkerijmodern.nl" }, { userId: "u-admin", name: "Anne Admin" });
    await engine.recordProposalView(q.id);
    expect(sendUserPush).toHaveBeenLastCalledWith(["u-admin"], expect.objectContaining({ data: expect.objectContaining({ url: "/admin/websitevoorstellen" }) }));
    // een voorstel van vóór deze melding (zonder maker) krijgt er geen
    await engine.updateWebsiteProposal(p.id, "ingetrokken", BY);
    const r = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    delete (store.get(`wvoorstel:${r.id}`) as { createdById?: string }).createdById;
    await engine.recordProposalView(r.id);
    expect(sendUserPush).toHaveBeenCalledTimes(2);
  });

  it("een ja: de verkoper die het maakte krijgt een pushmelding, een beheerder niet dubbel, een testadres niemand", async () => {
    const ja = { naam: "Jan de Vries", email: "jan@echtbedrijf.nl", telefoon: "", pakket: "pro" as const, domein: "houden" as const, opmerking: "", begrepen: true as const };
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    await engine.acceptWebsiteProposal(p.id, ja);
    expect(sendUserPush).toHaveBeenCalledTimes(1);
    expect(sendUserPush).toHaveBeenCalledWith(["u-sales"], expect.objectContaining({
      title: "🎉 Ja op je websitevoorstel",
      body: `${p.bedrijf} wil de nieuwe website met Pro. We beloofden binnen één werkdag contact op te nemen.`,
      data: expect.objectContaining({ url: "/sales/websitevoorstellen" }),
    }));
    // een beheerder hoort het al via alertOwner
    const q = await engine.createWebsiteProposal({ url: "bakkerijmodern.nl" }, { userId: "u-admin", name: "Anne Admin" });
    await engine.acceptWebsiteProposal(q.id, ja);
    expect(alertOwner).toHaveBeenCalledTimes(2);
    expect(sendUserPush).toHaveBeenCalledTimes(1);
    // een testadres: geen melding en geen push
    await engine.updateWebsiteProposal(p.id, "ingetrokken", BY);
    const r = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    await engine.acceptWebsiteProposal(r.id, { ...ja, email: "jan@devries.test" });
    expect(alertOwner).toHaveBeenCalledTimes(2);
    expect(sendUserPush).toHaveBeenCalledTimes(1);
  });

  it("zonder werkend toestel gaat hetzelfde seintje per mail naar wie het maakte (alleen intern)", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    sendUserPush.mockResolvedValueOnce(0);
    await engine.recordProposalView(p.id);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "verkoper@zekerflex.test",
      subject: "Websitevoorstel geopend",
      text: expect.stringMatching(new RegExp(`^${p.bedrijf} opende je websitevoorstel om .*/sales/websitevoorstellen`, "s")),
    }));
    // with a working device: only the push
    const q = await engine.createWebsiteProposal({ url: "bakkerijmodern.nl" }, BY);
    await engine.recordProposalView(q.id);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("een ingevuld verborgen veld (een robot) doet niets", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    const res = await post(p.id, { naam: "Bot", email: "bot@spam.nl", pakket: "basis", domein: "houden", begrepen: true, website: "http://spam" });
    expect(res.status).toBe(200);
    expect((await engine.getWebsiteProposal(p.id))!.akkoord).toBeNull();
    expect((await post("nietbestaand", {})).status).toBe(404);
  });
});
