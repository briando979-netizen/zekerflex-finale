import { describe, expect, it, vi } from "vitest";

// "Bekijk wat deze site kan" (4 nov): op een ontwerpvoorstel of voorbeeldsite een
// rondleiding zoals op schwarzwald.zekerflex.com, met alleen wat er echt op de site
// staat; op de eigen site van een bedrijf bestaat de pagina niet.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { renderFunctiesPagina, renderPage } = await import("@/lib/sites/render");
const { functiesVoorBezoekers, functiesVoorJou } = await import("@/lib/sites/wat-kan-deze-site");
const { SECTOR_TEMPLATES, pagesFromTemplate } = await import("@/lib/sites/types");
type SiteDoc = import("@/lib/sites/types").SiteDoc;

const company = { naam: "Bakkerij Test", kvk: "", straat: "", postcode: "", plaats: "Zonnedorp", telefoon: "0548 123 456", email: "info@example.com", whatsapp: "06 1234 5678" };
let n = 0;
const id = () => `b${(n++).toString(36).padStart(6, "0")}`;
function site(extra: Partial<SiteDoc> = {}): SiteDoc {
  return {
    id: "swatkan001",
    tenantId: "voorstel:wc-abc",
    slug: "bakkerij-test",
    theme: { kleur: "#325A46", accent: "#FF5F1F", lettertype: "modern", hoeken: "rond", stijl: "beleving" },
    bedrijf: company,
    pages: pagesFromTemplate(SECTOR_TEMPLATES.find((t) => t.id === "horeca")!, company, id),
    media: [],
    liveBuild: null,
    builds: [],
    createdAt: "2026-11-04T12:00:00Z",
    updatedAt: "2026-11-04T12:00:00Z",
    ...extra,
  };
}
const opts = { root: "/site/bakkerij-test/", origin: "https://zekerflex.com", version: "v1", noindex: true };
const voorstel = { voorstel: { officieel: "bakkerij.example.com", verloopt: "2099-01-01T00:00:00Z" } };

describe("wat kan deze site", () => {
  it("toont wat bezoekers op déze site kunnen, met een link om het te proberen", () => {
    const html = renderFunctiesPagina(site(voorstel), { ...opts, chat: true })!;
    expect(html).toContain("<h1>Wat deze site voor Bakkerij Test doet</h1>");
    expect(html).toContain('<h3>Een bericht of aanvraag sturen</h3>');
    expect(html).toContain('<a href="/site/bakkerij-test/contact#contact">Probeer het<span class="vh">: een bericht of aanvraag sturen</span></a>');
    expect(html).toContain('<a href="/site/bakkerij-test/_zf/chat">Probeer het');
    expect(html).toContain("<h3>WhatsApp met één tik</h3>");
    expect(html).toContain("<h2>Het beheer achter de login</h2>");
    expect(html).toContain('<a class="btn dark" href="mailto:info@zekerflex.com">Mail ZekerFlex</a>');
    // de balk blijft erop staan, met de weg naar de echte site
    expect(html).toContain("Naar de huidige site");
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it("noemt geen webshop of chat die er niet is, en bestaat niet op de eigen site van een bedrijf", () => {
    const bezoekers = functiesVoorBezoekers(site(voorstel)).map((f) => f.titel);
    expect(bezoekers).not.toContain("Online bestellen");
    expect(bezoekers).not.toContain("Chatten met een assistent");
    expect(functiesVoorJou(site(voorstel)).map((f) => f.titel)).toContain("Een webshop, als je wilt");
    expect(renderFunctiesPagina(site(), opts)).toBeNull();
  });

  it("zet in de balk van een voorbeeldsite ook de link naar de rondleiding", () => {
    const s = site({ voorbeeld: true });
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('<a href="/site/bakkerij-test/wat-kan-deze-site">Bekijk wat deze site kan</a> · <a href="https://zekerflex.com/werkgever/website/bouwer">Maak je eigen website</a>');
    expect(renderFunctiesPagina(s, opts)).toContain('href="https://zekerflex.com/website-check">Laat er gratis een maken</a>');
  });
});
