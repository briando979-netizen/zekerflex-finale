import { beforeEach, describe, expect, it, vi } from "vitest";

// Studio → Webshop → Groei (10 nov 2026): de productfeed voor Google Shopping, exports
// voor Excel, "mail me als het er weer is" en delen. Alles zonder scripts op de klantsite,
// en een e-mailadres van een bezoeker staat nergens anders dan op die ene wachtlijst.

const store = new Map<string, unknown>();
const begint = (prefix: string) => [...store.keys()].filter((k) => k.startsWith(prefix));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListKeys: async (prefix: string, limit = 1000) => begint(prefix).slice(0, limit),
  kvListValues: async (prefix: string) => begint(prefix).map((k) => store.get(k)),
  kvListEntries: async (prefix: string) => begint(prefix).map((key) => ({ key, value: store.get(key) })),
  kvDeleteStale: async () => 0,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined, privateRateLimitIdentifier: (s: string) => s }));
vi.mock("@/lib/sites/stats", () => ({ recordSiteView: async () => undefined }));
const sendMail = vi.fn(async (m: unknown) => (void m, { id: "m1", delivered: false, transport: "mailbox" }));
vi.mock("@/lib/mail", () => ({ sendMail: (m: unknown) => sendMail(m) }));

import { FEED_PAD, feedPrijs, heeftFeed, productFeed, xmlTekst } from "@/lib/sites/productfeed";
import { bestellingenCsv, csvBedrag, csvBestand, csvCel, csvNaam, productenCsv } from "@/lib/sites/export-csv";
import { bestelbaar, leesEmail, telPerProduct, verdwenenProducten, voorraadMail, weerBestelbaar } from "@/lib/sites/voorraadmelding";
import { handleVoorraadMelding, meldAan, stuurVoorraadMeldingen, wachtlijstVan, wisWachtlijsten } from "@/lib/sites/voorraadmelding-opslag";
import { renderWinkelPagina } from "@/lib/sites/render";
import { serveSitePath } from "@/lib/sites/serve";
import type { SiteBestelling } from "@/lib/sites/bestellingen";
import type { LiveSite } from "@/lib/sites/store";
import { LEGE_WINKEL, type SiteDoc, type SiteProduct, type Winkel } from "@/lib/sites/types";

const product = (over: Partial<SiteProduct> = {}): SiteProduct => ({
  id: "paaaaaaa1",
  naam: "Mok",
  slug: "mok",
  prijsCents: 1295,
  korteTekst: "Steengoed",
  omschrijving: "Met de hand gedraaid.",
  fotos: ["m1111111"],
  categorie: "Wonen",
  zichtbaar: true,
  uitverkocht: false,
  ...over,
});

const winkel = (producten: SiteProduct[]): Winkel => ({ ...LEGE_WINKEL, producten });

const media = [
  { id: "m1111111", file: "m1111111.webp" },
  { id: "m2222222", file: "m2222222.webp" },
];

const opts = { origin: "https://jouwwinkel.nl", root: "/" };

beforeEach(() => {
  store.clear();
  sendMail.mockClear();
});

describe("productfeed voor Google Shopping", () => {
  it("zet centen om naar de notatie van Google", () => {
    expect(feedPrijs(1295)).toBe("12.95 EUR");
    expect(feedPrijs(5)).toBe("0.05 EUR");
    expect(feedPrijs(100000)).toBe("1000.00 EUR");
  });

  it("escapet alles en haalt tekens weg die XML niet toestaat, maar laat een emoji staan", () => {
    expect(xmlTekst(`Mok & <schotel> "Jans" 't`)).toBe("Mok &amp; &lt;schotel&gt; &quot;Jans&quot; &apos;t");
    expect(xmlTekst("a\u0000b\u0007c\u000Bd")).toBe("abcd");
    expect(xmlTekst("ok 😀 \uD800 klaar")).toBe("ok 😀  klaar");
  });

  it("geeft per product de velden van Google, met de winkelnaam als merk en de link op het eigen adres", () => {
    const { xml, inFeed } = productFeed({ soort: "webshop", bedrijf: { naam: "Atelier <Klei> & Co" }, media, winkel: winkel([product({ fotos: ["m1111111", "m2222222"] })]) }, opts);
    expect(inFeed).toBe(1);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')).toBe(true);
    expect(xml).toContain("<g:id>paaaaaaa1</g:id><title>Mok</title><description>Met de hand gedraaid.</description><link>https://jouwwinkel.nl/p/mok</link>");
    expect(xml).toContain("<g:image_link>https://jouwwinkel.nl/media/m1111111.webp</g:image_link>");
    expect(xml).toContain("<g:additional_image_link>https://jouwwinkel.nl/media/m2222222.webp</g:additional_image_link>");
    expect(xml).toContain("<g:price>12.95 EUR</g:price><g:availability>in_stock</g:availability><g:condition>new</g:condition>");
    expect(xml).toContain("<g:brand>Atelier &lt;Klei&gt; &amp; Co</g:brand>");
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists><g:product_type>Wonen</g:product_type>");
    expect(xml).toContain("<link>https://jouwwinkel.nl/winkel</link>");
  });

  it("uitverkocht (met de hand of voorraad 0) is out_of_stock; een aanbieding krijgt de oude prijs plus sale_price", () => {
    const { xml } = productFeed(
      {
        bedrijf: { naam: "Atelier" },
        media,
        winkel: winkel([product({ id: "pbbbbbbb2", slug: "a", voorraad: 0 }), product({ id: "pccccccc3", slug: "b", uitverkocht: true }), product({ id: "pdddddddd4", slug: "c", prijsCents: 995, oudePrijsCents: 1250 })]),
      },
      opts,
    );
    expect(xml.match(/<g:availability>out_of_stock<\/g:availability>/g)).toHaveLength(2);
    expect(xml).toContain("<g:price>12.50 EUR</g:price><g:sale_price>9.95 EUR</g:sale_price><g:availability>in_stock</g:availability>");
  });

  it("laat verborgen producten weg, en telt wat Google zou weigeren (geen foto, prijs € 0)", () => {
    const feed = productFeed(
      { bedrijf: { naam: "Atelier" }, media, winkel: winkel([product(), product({ id: "pbbbbbbb2", fotos: [] }), product({ id: "pccccccc3", fotos: ["mweg00000"] }), product({ id: "pdddddddd4", prijsCents: 0 }), product({ id: "peeeeeee5", zichtbaar: false })]) },
      { origin: "https://zekerflex.com", root: "/site/atelier/" },
    );
    expect(feed).toMatchObject({ inFeed: 1, zonderFoto: 2, zonderPrijs: 1 });
    expect(feed.xml).toContain("<link>https://zekerflex.com/site/atelier/p/mok</link>");
    expect(feed.xml).not.toContain("peeeeeee5");
  });

  it("een voorbeeld of ontwerpvoorstel heeft nooit een feed; een website zonder producten ook niet", () => {
    const basis = { bedrijf: { naam: "Atelier" }, media, winkel: winkel([product()]) };
    expect(heeftFeed(basis)).toBe(true);
    expect(heeftFeed({ ...basis, voorbeeld: true })).toBe(false);
    expect(heeftFeed({ ...basis, voorstel: { officieel: null, verloopt: "2030-01-01T00:00:00Z" } })).toBe(false);
    expect(heeftFeed({ ...basis, winkel: winkel([]) })).toBe(false);
    expect(heeftFeed({ ...basis, soort: "webshop", winkel: winkel([]) })).toBe(true);
  });
});

describe("exports voor Excel", () => {
  it("zet elke cel tussen aanhalingstekens en maakt nooit een formule van klantinvoer", () => {
    expect(csvCel('Zeg "hoi"; en\ndoei')).toBe('"Zeg ""hoi""; en\ndoei"');
    for (const begin of ["=SOM(A1)", "+31612345678", "-2", "@cmd", "\tx", "\rx"]) expect(csvCel(begin)).toBe(`"'${begin}"`);
    expect(csvCel("gewoon")).toBe('"gewoon"');
    expect(csvCel(3)).toBe('"3"');
  });

  it("maakt een bestand met BOM, puntkomma's en Windows-regels; bedragen met een komma", () => {
    expect(csvBestand(["A", "B"], [["1", "x;y"]])).toBe('﻿"A";"B"\r\n"1";"x;y"');
    expect(csvBedrag(1295)).toBe("12,95");
    expect(csvBedrag(5)).toBe("0,05");
    expect(csvNaam("bestellingen", new Date("2026-11-09T23:30:00Z"))).toBe("bestellingen-2026-11-10.csv");
  });

  it("bestellingen: Nederlandse kolommen en de tijd in Nederland", () => {
    const b: SiteBestelling = {
      id: "oabcdefghijk",
      nr: "K7M3Q2",
      at: "2026-11-09T23:30:00Z",
      status: "bevestigd",
      regels: [{ productId: "paaaaaaa1", naam: "Mok", prijsCents: 1295, aantal: 2, totaalCents: 2590 }],
      subtotaalCents: 2590,
      bezorgkostenCents: 495,
      totaalCents: 3085,
      invoer: { aantallen: {}, keuzes: {}, levering: "bezorgen", naam: "=Sanne", email: "sanne@voorbeeld.test", telefoon: "+31 6 12345678", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Rijssen", opmerking: "Bel aan;\nachterom" },
    };
    const regels = bestellingenCsv([b]).split("\r\n");
    expect(regels[0]).toBe('﻿"Bestelnummer";"Datum";"Tijd";"Status";"Naam";"E-mail";"Telefoon";"Levering";"Straat en huisnummer";"Postcode";"Plaats";"Producten";"Aantal artikelen";"Subtotaal";"Bezorgkosten";"Totaal";"Opmerking"');
    expect(regels[1]).toBe('"K7M3Q2";"2026-11-10";"00:30";"Bevestigd";"\'=Sanne";"sanne@voorbeeld.test";"\'+31 6 12345678";"Bezorgen";"Dorpsstraat 1";"1234 AB";"Rijssen";"2 × Mok";"2";"25,90";"4,95";"30,85";"Bel aan;\nachterom"');
  });

  it("producten: voorraad, uitverkocht, zichtbaar en de link", () => {
    const csv = productenCsv(winkel([product({ voorraad: 0, opties: [{ naam: "Maat", waarden: ["S", "M"] }] }), product({ id: "pbbbbbbb2", naam: "Bord", slug: "bord", zichtbaar: false, oudePrijsCents: 1500 })]), "https://jouwwinkel.nl/");
    const regels = csv.split("\r\n");
    expect(regels[0]).toBe('﻿"Naam";"Categorie";"Prijs";"Oude prijs";"Voorraad";"Uitverkocht";"Zichtbaar";"Opties";"Korte tekst";"Omschrijving";"Aantal foto\'s";"Link"');
    expect(regels[1]).toBe('"Mok";"Wonen";"12,95";"";"0";"ja";"ja";"Maat: S, M";"Steengoed";"Met de hand gedraaid.";"1";"https://jouwwinkel.nl/p/mok"');
    expect(regels[2]).toBe('"Bord";"Wonen";"12,95";"15,00";"niet bijgehouden";"nee";"nee";"";"Steengoed";"Met de hand gedraaid.";"1";"https://jouwwinkel.nl/p/bord"');
  });
});

describe("mail me als het er weer is: de regels", () => {
  it("leest alleen een echt e-mailadres, in kleine letters", () => {
    expect(leesEmail("  Sanne@Voorbeeld.TEST ")).toBe("sanne@voorbeeld.test");
    expect(leesEmail("geen adres")).toBeNull();
    expect(leesEmail(null)).toBeNull();
    expect(leesEmail(`${"a".repeat(195)}@b.test`)).toBeNull();
  });

  it("ziet welke producten weer te bestellen zijn en welke weg zijn", () => {
    const voor = winkel([product({ voorraad: 0 }), product({ id: "pbbbbbbb2", uitverkocht: true }), product({ id: "pccccccc3", voorraad: 0 }), product({ id: "pdddddddd4", voorraad: 0, zichtbaar: false }), product({ id: "peeeeeee5" })]);
    const na = winkel([product({ voorraad: 4 }), product({ id: "pbbbbbbb2", uitverkocht: false }), product({ id: "pccccccc3", voorraad: 0 }), product({ id: "pdddddddd4", voorraad: 3, zichtbaar: false }), product({ id: "pfffffff6" })]);
    expect(weerBestelbaar(voor, na)).toEqual(["paaaaaaa1", "pbbbbbbb2"]);
    expect(verdwenenProducten(voor, na)).toEqual(["peeeeeee5"]);
    expect(bestelbaar(product({ voorraad: null }))).toBe(true);
  });

  it("telt per product uit de sleutels, zonder adressen", () => {
    const k = (p: string, c: string) => `site-voorraadmelding:s1:${p}:${c}`;
    expect([...telPerProduct([k("pa", "1"), k("pa", "2"), k("pb", "3"), "site-voorraadmelding:s2:pa:9"], "s1")]).toEqual([["pa", 2], ["pb", 1]]);
  });

  it("schrijft één Nederlandse mail met de link en de belofte dat het adres weg is", () => {
    const m = voorraadMail({ product: "Mok", winkel: "Atelier", link: "https://jouwwinkel.nl/p/mok", sinds: "2026-11-03T10:00:00+01:00" });
    expect(m.onderwerp).toBe("Mok is weer op voorraad bij Atelier");
    expect(m.tekst).toContain("https://jouwwinkel.nl/p/mok");
    expect(m.tekst).toContain("Je vroeg op 3 november 2026 om een mail");
    expect(m.tekst).toContain("je e-mailadres is nu gewist");
    expect(voorraadMail({ product: "Mok", winkel: "Atelier", link: "x", sinds: "" }).tekst).toContain("Je vroeg om een mail");
  });
});

const doc = (w: Winkel, over: Partial<SiteDoc> = {}): SiteDoc => ({
  id: "satelier01",
  tenantId: "t1",
  soort: "webshop",
  slug: "atelier",
  theme: { kleur: "#26313A", accent: "#3FC1A5", lettertype: "modern", hoeken: "rond" },
  bedrijf: { naam: "Atelier", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" },
  pages: [{ id: "home", slug: "", titel: "Home", seoTitel: "", seoOmschrijving: "", blocks: [] }],
  media: media.map((m) => ({ ...m, width: 800, height: 800, alt: "", bron: "upload" as const })),
  liveBuild: "b1",
  builds: [{ id: "b1", at: "2026-11-01T10:00:00Z", by: "Jan" }],
  winkel: w,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
  ...over,
});

const liveVan = (d: SiteDoc): LiveSite => {
  const { builds: _b, liveBuild: _l, ...snapshot } = d;
  return { snapshot, buildId: "b1", siteId: d.id, domein: null };
};

const post = (velden: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(velden)) form.set(k, v);
  return new Request("https://zekerflex.com/site/atelier/_zf/voorraadmelding", { method: "POST", body: form });
};
const siteOpts = { origin: "https://zekerflex.com", root: "/site/atelier/", noindex: true };

describe("mail me als het er weer is: op de klantsite", () => {
  const uit = winkel([product({ voorraad: 0 }), product({ id: "pbbbbbbb2", naam: "Bord", slug: "bord" })]);

  it("toont op een uitverkocht product een gewoon formulier, en na het aanmelden de bevestiging", () => {
    const html = renderWinkelPagina(doc(uit), { soort: "product", slug: "mok" }, siteOpts) ?? "";
    expect(html).toContain('<form class="contact" method="post" action="/site/atelier/_zf/voorraadmelding"><input type="hidden" name="p" value="paaaaaaa1">');
    expect(html).toContain('<label for="vm-email">Mail me als het er weer is<input id="vm-email" name="email" type="email" required');
    expect(html).toContain('<label class="hp" aria-hidden="true">Laat leeg<input name="website"');
    expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/);
    const klaar = renderWinkelPagina(doc(uit), { soort: "product", slug: "mok", gemeld: true }, siteOpts) ?? "";
    expect(klaar).toContain('<p class="mmelding" id="vm" role="status">Gelukt: we mailen je één keer zodra Mok er weer is.</p>');
    expect(klaar).not.toContain("_zf/voorraadmelding");
    // op voorraad: gewoon de winkelmand, geen wachtlijst
    expect(renderWinkelPagina(doc(uit), { soort: "product", slug: "bord" }, siteOpts) ?? "").not.toContain("_zf/voorraadmelding");
  });

  it("verstuurt op een voorbeeldsite niets: het formulier staat dicht", () => {
    const html = renderWinkelPagina(doc(uit, { voorbeeld: true }), { soort: "product", slug: "mok" }, siteOpts) ?? "";
    expect(html).toContain('<form class="contact" method="post" action="#">');
    expect(html).toMatch(/name="email"[^>]*disabled/);
    expect(html).toContain("Dit is een voorbeeld: er wordt niets bewaard of verstuurd.");
  });

  it("zet iemand één keer op de lijst en stuurt hem terug naar de productpagina", async () => {
    const live = liveVan(doc(uit));
    const res = await handleVoorraadMelding(post({ p: "paaaaaaa1", email: "Sanne@Voorbeeld.test" }), live, siteOpts);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/site/atelier/p/mok?gemeld=1#vm");
    await handleVoorraadMelding(post({ p: "paaaaaaa1", email: "sanne@voorbeeld.test" }), live, siteOpts);
    const sleutels = begint("site-voorraadmelding:satelier01:paaaaaaa1:");
    expect(sleutels).toHaveLength(1);
    // het adres staat alleen in de waarde, niet in de sleutel
    expect(sleutels[0]).not.toContain("sanne");
    expect(store.get(sleutels[0] ?? "")).toMatchObject({ email: "sanne@voorbeeld.test" });
    expect([...(await wachtlijstVan("satelier01"))]).toEqual([["paaaaaaa1", 1]]);
  });

  it("bewaart niets bij de honeypot, een fout adres, een product op voorraad of een voorbeeld", async () => {
    const live = liveVan(doc(uit));
    const bot = await handleVoorraadMelding(post({ p: "paaaaaaa1", email: "bot@voorbeeld.test", website: "spam" }), live, siteOpts);
    expect(bot.headers.get("Location")).toBe("/site/atelier/p/mok?gemeld=1#vm");
    expect((await handleVoorraadMelding(post({ p: "paaaaaaa1", email: "geen" }), live, siteOpts)).status).toBe(400);
    expect((await handleVoorraadMelding(post({ p: "pbbbbbbb2", email: "a@voorbeeld.test" }), live, siteOpts)).headers.get("Location")).toBe("/site/atelier/p/bord");
    expect((await handleVoorraadMelding(post({ p: "pzzzzzzz9", email: "a@voorbeeld.test" }), live, siteOpts)).headers.get("Location")).toBe("/site/atelier/winkel");
    expect((await handleVoorraadMelding(post({ p: "paaaaaaa1", email: "a@voorbeeld.test" }), liveVan(doc(uit, { voorbeeld: true })), siteOpts)).status).toBe(400);
    expect(begint("site-voorraadmelding:")).toEqual([]);
  });

  it("weigert netjes als de lijst van één product vol is", async () => {
    for (let i = 0; i < 500; i++) store.set(`site-voorraadmelding:satelier01:paaaaaaa1:${i}`, { email: `p${i}@voorbeeld.test`, at: "2026-11-01T10:00:00Z" });
    expect(await meldAan("satelier01", "paaaaaaa1", "nieuw@voorbeeld.test")).toBe("vol");
    const res = await handleVoorraadMelding(post({ p: "paaaaaaa1", email: "nieuw@voorbeeld.test" }), liveVan(doc(uit)), siteOpts);
    expect(res.status).toBe(429);
  });

  it("mailt iedereen één keer als het product terug is, en wist daarna de adressen", async () => {
    await meldAan("satelier01", "paaaaaaa1", "een@voorbeeld.test", new Date("2026-11-03T10:00:00+01:00"));
    await meldAan("satelier01", "paaaaaaa1", "twee@voorbeeld.test");
    await meldAan("satelier01", "pbbbbbbb2", "ander@voorbeeld.test");
    // nog uitverkocht: niets
    expect(await stuurVoorraadMeldingen(doc(uit), ["paaaaaaa1"])).toEqual({ verstuurd: 0 });
    const terug = doc(winkel([product({ voorraad: 5 }), product({ id: "pbbbbbbb2", naam: "Bord", slug: "bord" })]));
    // niet online: de link zou niet werken, de lijst blijft staan
    expect(await stuurVoorraadMeldingen({ ...terug, liveBuild: null }, ["paaaaaaa1"])).toEqual({ verstuurd: 0 });
    expect(await stuurVoorraadMeldingen(terug, ["paaaaaaa1"])).toEqual({ verstuurd: 2 });
    expect(sendMail).toHaveBeenCalledTimes(2);
    const naar = sendMail.mock.calls.map(([m]) => (m as { to: string }).to).sort();
    expect(naar).toEqual(["een@voorbeeld.test", "twee@voorbeeld.test"]);
    const eerste = sendMail.mock.calls[0]?.[0] as { subject: string; text: string; kind: string };
    expect(eerste.kind).toBe("site-voorraadmelding");
    expect(eerste.subject).toBe("Mok is weer op voorraad bij Atelier");
    expect(eerste.text).toMatch(/\/site\/atelier\/p\/mok\n/);
    expect(begint("site-voorraadmelding:satelier01:paaaaaaa1:")).toEqual([]);
    // nog een keer opslaan: niemand krijgt een tweede mail
    expect(await stuurVoorraadMeldingen(terug, ["paaaaaaa1"])).toEqual({ verstuurd: 0 });
    // een product dat weggaat, neemt zijn wachtlijst mee
    expect(await wisWachtlijsten("satelier01", ["pbbbbbbb2"])).toBe(1);
    expect(begint("site-voorraadmelding:")).toEqual([]);
  });
});

describe("de klantsite serveert de feed en de bevestiging", () => {
  it(`…/${FEED_PAD}: XML met de producten, nooit in de zoekresultaten`, async () => {
    const res = await serveSitePath(liveVan(doc(winkel([product()]))), [FEED_PAD], { ...siteOpts, noindex: false });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=900");
    expect(await res.text()).toContain("<link>https://zekerflex.com/site/atelier/p/mok</link>");
    const voorbeeld = await serveSitePath(liveVan(doc(winkel([product()]), { voorbeeld: true })), [FEED_PAD], siteOpts);
    expect(voorbeeld.status).toBe(404);
  });

  it("de productpagina met ?gemeld=1 toont de bevestiging", async () => {
    const live = liveVan(doc(winkel([product({ voorraad: 0 })])));
    const res = await serveSitePath(live, ["p", "mok"], siteOpts, new Request("https://zekerflex.com/site/atelier/p/mok?gemeld=1"));
    expect(await res.text()).toContain("Gelukt: we mailen je één keer zodra Mok er weer is.");
  });
});
