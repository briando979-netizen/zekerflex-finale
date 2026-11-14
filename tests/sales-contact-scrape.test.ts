import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Contactgegevens van een bedrijfssite (14 nov 2026). Een adres telt alleen op het eigen domein van de site (of het domein
// waar de homepage naartoe stuurt), nooit dat van de webbouwer of een formulierdienst; niets geraden. robots.txt geldt,
// net als bij de careers-crawler. Een bestaand telefoonnummer blijft staan, en elke poging komt in enrichmentJson, zodat
// de motor niet elke dag dezelfde leads pakt. De voorbeeldpagina's staan in tests/fixtures/contact-scrape/.

const html = (naam: string) => readFileSync(path.join(process.cwd(), "tests/fixtures/contact-scrape", `${naam}.html`), "utf8");

interface Antwoord {
  status: number;
  headers: Record<string, string>;
  body: string;
  finalUrl: string;
}
const PAGINAS: Record<string, Partial<Antwoord>> = {};
const opgehaald: string[] = [];
vi.mock("@/lib/website-check/fetch", () => ({
  fetchPage: async (url: string) => {
    opgehaald.push(url);
    const p = PAGINAS[url];
    if (!p) return { status: 404, headers: { "content-type": "text/html" }, body: "", finalUrl: url };
    return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "", finalUrl: url, ...p };
  },
}));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") } }));
const info = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { info: (...a: unknown[]) => info(...a), warn: vi.fn(), error: vi.fn() } }));
const lead = vi.hoisted(() => ({ huidig: null as Record<string, unknown> | null }));
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { salesLead: { findUnique: async () => lead.huidig, update: (...a: unknown[]) => update(...a) } },
}));
const opzoeken = vi.fn();
vi.mock("@/lib/sales/discovery/places-lookup", () => ({ lookupCompanyContact: (...a: unknown[]) => opzoeken(...a) }));
vi.mock("@/lib/sales/discovery/domain-guess", () => ({ guessAndVerifyDomain: async () => null }));

import { CONTACT_RETRY_DAYS, contactBeurt, enrichLeadContact, kiesAdres, zelfdeDomein } from "@/lib/sales/discovery/contact-scrape";

const NU = new Date("2026-11-15T08:00:00+01:00");
const robotsVrij = (origin: string) => {
  PAGINAS[`${origin}/robots.txt`] = { headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /beheer" };
};
const zetLead = (velden: Record<string, unknown> = {}) => {
  lead.huidig = { id: "l1", companyName: "Bakkerij Acme", city: "Groningen", contactPhone: null, contactEmail: null, discoveredEmail: null, sourceUrl: "https://acme.test/", enrichmentJson: { domainGuessAttemptedAt: "2026-11-01T08:00:00.000Z" }, ...velden };
};
const data = () => (update.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  for (const k of Object.keys(PAGINAS)) delete PAGINAS[k];
  opgehaald.length = 0;
  update.mockReset().mockResolvedValue({});
  info.mockReset();
  opzoeken.mockReset().mockResolvedValue(null);
  zetLead();
});

describe("contact-scrape: welk adres", () => {
  it("vreemd domein: het adres van de webbouwer nemen we niet; de poging staat in enrichmentJson", async () => {
    robotsVrij("https://acme.test");
    PAGINAS["https://acme.test/"] = { body: html("vreemd-domein") };
    const r = await enrichLeadContact("l1", NU);
    expect(r.email).toBeNull();
    expect(r.uitkomst).toBe("geen-adres");
    expect(data()).not.toHaveProperty("contactEmail");
    expect(data()).not.toHaveProperty("discoveredEmail");
    expect(data().contactPhone).toBe("0501234567");
    // de eerdere verrijking blijft staan
    expect(data().enrichmentJson).toEqual({ domainGuessAttemptedAt: "2026-11-01T08:00:00.000Z", contactScrape: { at: NU.toISOString(), uitkomst: "geen-adres" } });
  });

  it("meerdere eigen adressen: personeel vóór info vóór een naam, nooit noreply of een plaatje", async () => {
    robotsVrij("https://acme.test");
    PAGINAS["https://acme.test/"] = { body: html("eigen-adressen") };
    PAGINAS["https://acme.test/contact"] = { body: html("contact-personeel") };
    const r = await enrichLeadContact("l1", NU);
    expect(r.email).toBe("personeel@acme.test");
    expect(data().contactEmail).toBe("personeel@acme.test");
    expect(data().discoveredEmail).toBe("personeel@acme.test");
    expect(r.uitkomst).toBe("adres");

    expect(kiesAdres([html("eigen-adressen")], ["acme.test"])).toBe("info@acme.test");
    expect(kiesAdres([html("eigen-adressen").replace(/info@acme\.test/g, "")], ["acme.test"])).toBe("jan@acme.test");
  });

  it("doorverwijzing van de homepage: het doeldomein telt als eigen en de contactpagina's zoeken we daar", async () => {
    zetLead({ sourceUrl: "https://oud.test/" });
    robotsVrij("https://oud.test");
    robotsVrij("https://nieuw.test");
    PAGINAS["https://oud.test/"] = { body: html("doorverwijzing"), finalUrl: "https://nieuw.test/" };
    const r = await enrichLeadContact("l1", NU);
    expect(r.email).toBe("info@nieuw.test");
    expect(opgehaald).toContain("https://nieuw.test/robots.txt");
    expect(opgehaald).toContain("https://nieuw.test/contact");
    expect(opgehaald).not.toContain("https://oud.test/contact");
    // het zusterbedrijf op een ander domein telt niet
    expect(kiesAdres([html("doorverwijzing")], ["oud.test"])).toBeNull();
  });

  it("een contactpagina die naar een ander domein stuurt (formulierdienst) telt niet mee", async () => {
    robotsVrij("https://acme.test");
    PAGINAS["https://acme.test/"] = { body: html("geen-adres") };
    PAGINAS["https://acme.test/contact"] = { body: '<a href="mailto:info@formulieren.test">mail</a>', finalUrl: "https://formulieren.test/acme" };
    const r = await enrichLeadContact("l1", NU);
    expect(r.email).toBeNull();
    expect(opgehaald).not.toContain("https://formulieren.test/robots.txt");
  });

  it("robots.txt verbiedt het: niets opgehaald behalve robots.txt, de poging staat erin", async () => {
    PAGINAS["https://acme.test/robots.txt"] = { headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /" };
    PAGINAS["https://acme.test/"] = { body: html("eigen-adressen") };
    const r = await enrichLeadContact("l1", NU);
    expect(opgehaald).toEqual(["https://acme.test/robots.txt"]);
    expect(r.uitkomst).toBe("robots");
    expect(r.email).toBeNull();
    expect(data()).not.toHaveProperty("contactEmail");
    expect((data().enrichmentJson as { contactScrape: unknown }).contactScrape).toEqual({ at: NU.toISOString(), uitkomst: "robots" });
  });

  it("robots.txt voor onze bot verbiedt één pad: dat pad slaan we over, de rest niet", async () => {
    PAGINAS["https://acme.test/robots.txt"] = { headers: { "content-type": "text/plain" }, body: "User-agent: ZekerFlexBot\nDisallow: /contact" };
    PAGINAS["https://acme.test/"] = { body: html("geen-adres") };
    PAGINAS["https://acme.test/over-ons"] = { body: html("contact-personeel") };
    const r = await enrichLeadContact("l1", NU);
    expect(opgehaald.some((u) => u.startsWith("https://acme.test/contact"))).toBe(false);
    expect(r.email).toBe("personeel@acme.test");
  });

  it("geen adres op de site: niets ingevuld, ook geen gok", async () => {
    robotsVrij("https://acme.test");
    PAGINAS["https://acme.test/"] = { body: html("geen-adres") };
    const r = await enrichLeadContact("l1", NU);
    expect(r.email).toBeNull();
    expect(r.uitkomst).toBe("geen-adres");
    expect(JSON.stringify(data())).not.toMatch(/info@|@acme/);
  });

  it("een site die niets geeft: onbereikbaar", async () => {
    robotsVrij("https://acme.test");
    const r = await enrichLeadContact("l1", NU);
    expect(r.uitkomst).toBe("onbereikbaar");
  });

  it("een bestaand telefoonnummer blijft staan, en dan zoeken we het bedrijf niet opnieuw op", async () => {
    zetLead({ contactPhone: "+31612345678" });
    robotsVrij("https://acme.test");
    PAGINAS["https://acme.test/"] = { body: html("vreemd-domein") };
    PAGINAS["https://acme.test/contact"] = { body: html("contact-personeel") };
    const r = await enrichLeadContact("l1", NU);
    expect(opzoeken).not.toHaveBeenCalled();
    expect(data()).not.toHaveProperty("contactPhone");
    expect(r.phone).toBe("+31612345678");
    expect(r.email).toBe("personeel@acme.test");
  });

  it("het log bevat alleen aantallen en ja/nee: geen bedrijf, site of adres", async () => {
    robotsVrij("https://acme.test");
    PAGINAS["https://acme.test/contact"] = { body: html("contact-personeel") };
    await enrichLeadContact("l1", NU);
    const log = JSON.stringify(info.mock.calls);
    expect(log).toContain("contact scrape");
    expect(log).not.toMatch(/acme|@|https?:/i);
  });
});

describe("contact-scrape: hoort een adres bij de site", () => {
  it("hetzelfde domein, een subdomein, of het hoofddomein van een site op een subdomein; nooit een lijkend domein of een platform", () => {
    expect(zelfdeDomein("acme.test", "www.acme.test")).toBe(true);
    expect(zelfdeDomein("mail.acme.test", "acme.test")).toBe(true);
    expect(zelfdeDomein("acme.test", "shop.acme.test")).toBe(true);
    expect(zelfdeDomein("evil-acme.test", "acme.test")).toBe(false);
    expect(zelfdeDomein("acmetest", "acme.test")).toBe(false);
    expect(zelfdeDomein("wordpress.com", "acme.wordpress.com")).toBe(false);
    expect(zelfdeDomein("webbouwer.test", "acme.test")).toBe(false);
  });
});

describe("contact-scrape: wie is aan de beurt", () => {
  const dag = 24 * 60 * 60 * 1000;
  const rij = (id: string, aangemaakt: string, site: boolean, poging?: string) => ({
    id,
    createdAt: new Date(aangemaakt),
    sourceUrl: site ? "https://x.test/" : null,
    enrichmentJson: poging ? { contactScrape: { at: poging, uitkomst: "geen-site" } } : null,
  });

  it("nooit geprobeerd eerst, met een website vóór zonder; daarna de oudste poging; een recente poging wacht", () => {
    const rijen = [
      rij("stub-oud", "2026-10-09T10:00:00+02:00", false),
      rij("stub-geprobeerd", "2026-10-09T10:00:00+02:00", false, new Date(NU.getTime() - 2 * dag).toISOString()),
      rij("osm-site", "2026-11-07T09:00:00+01:00", true),
      rij("stub-lang-geleden", "2026-10-10T10:00:00+02:00", false, new Date(NU.getTime() - (CONTACT_RETRY_DAYS + 1) * dag).toISOString()),
      rij("kvk-site", "2026-10-30T10:00:00+01:00", true),
    ];
    expect(contactBeurt(rijen, NU, 6)).toEqual(["kvk-site", "osm-site", "stub-oud", "stub-lang-geleden"]);
    expect(contactBeurt(rijen, NU, 2)).toEqual(["kvk-site", "osm-site"]);
  });

  it("37 stubs die nooit iets opleveren houden de rij niet meer dicht", () => {
    const stubs = Array.from({ length: 37 }, (_, i) => rij(`stub${i}`, `2026-10-09T10:${String(i).padStart(2, "0")}:00+02:00`, false));
    const osm = rij("osm", "2026-11-07T09:00:00+01:00", false);
    let rijen = [...stubs, osm];
    const beurten: string[] = [];
    for (let d = 0; d < 7; d++) {
      const nu = new Date(NU.getTime() + d * dag);
      const deze = contactBeurt(rijen, nu, 6);
      beurten.push(...deze);
      rijen = rijen.map((r) => (deze.includes(r.id) ? { ...r, enrichmentJson: { contactScrape: { at: nu.toISOString(), uitkomst: "geen-site" } } } : r));
    }
    expect(beurten).toContain("osm");
    expect(new Set(beurten).size).toBe(38);
  });
});
