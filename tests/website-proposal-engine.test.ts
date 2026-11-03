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
    },
    salesLead: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === lead.id ? { ...lead } : null),
      update: async ({ data }: { data: { notes?: string } }) => {
        if (data.notes !== undefined) lead.notes = data.notes;
        return lead;
      },
    },
  },
}));
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
  [alertOwner, markLeadReplied, sendMail, importRemoteImage, runWebsiteCheck, fetchPage].forEach((m) => m.mockClear());
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
    expect(site.proposalTheme("#14213D", bouw, null)).toMatchObject({ kleur: "#14213D", accent: "#B8925A", stijl: "luxe", lettertype: "klassiek" });
    expect(site.proposalTheme("#F5C04E", bouw, "mlogo12345")).toMatchObject({ kleur: bouw.theme.kleur, accent: "#F5C04E", logo: "mlogo12345" });
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

  it("maakt pagina's die door de controle van de bouwer komen, met voorbeelden duidelijk gemarkeerd", () => {
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
    expect(text).toContain("Wat klanten zeggen (voorbeeld)");
    expect(text).toContain("Openingstijden (voorbeeld)");
    expect(text).toContain("Vraag een offerte aan");
    expect(site.pickPhotos([{ id: "a", width: 800, height: 800 }, { id: "b", width: 1600, height: 900 }, { id: "c", width: 900, height: 900 }, { id: "d", width: 900, height: 900 }])).toEqual({ hero: "b", over: "a", galerij: ["c", "d"] });
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
    expect(live.snapshot.theme.stijl).toBe("luxe");
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

  it("een ingevuld verborgen veld (een robot) doet niets", async () => {
    const p = await engine.createWebsiteProposal({ leadId: "lead1" }, BY);
    const res = await post(p.id, { naam: "Bot", email: "bot@spam.nl", pakket: "basis", domein: "houden", begrepen: true, website: "http://spam" });
    expect(res.status).toBe(200);
    expect((await engine.getWebsiteProposal(p.id))!.akkoord).toBeNull();
    expect((await post("nietbestaand", {})).status).toBe(404);
  });
});
