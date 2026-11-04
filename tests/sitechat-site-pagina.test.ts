import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(), kvSet: vi.fn(), kvDelete: vi.fn(), kvListEntries: vi.fn(async () => []) }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({ chat: vi.fn(), chatStream: vi.fn(), ensureAiNode: vi.fn(), fastModel: () => "test", llmConfigProblem: () => null }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), fixedWindow: vi.fn(async () => ({ ok: true })), privateRateLimitIdentifier: (s: string) => s }));

import { renderChatPagina } from "@/lib/sitechat/site-pagina";
import { renderPage, siteCss, stylesheetHref } from "@/lib/sites/render";
import type { SiteGesprek } from "@/lib/sitechat/regels";
import type { RenderableSite } from "@/lib/sites/render";

const opts = { root: "/site/bakker/", origin: "https://zekerflex.com", version: "b1", noindex: true };
const basis = { bedrijf: "Bakker & Zn <b>", opts, id: "a".repeat(32), gesprek: null, inert: false, afspraak: false, fout: "", ok: "", vandaag: "2026-11-04" };
const gesprek = (status: SiteGesprek["status"]): SiteGesprek => ({
  id: "a".repeat(32),
  kanaal: "site-x",
  status,
  gestart: "2026-11-04T10:00:00Z",
  laatst: "2026-11-04T10:01:00Z",
  ongelezen: 0,
  berichten: [
    { rol: "gast", tekst: "Hoi <script>", op: "2026-11-04T10:00:00Z" },
    { rol: "ai", tekst: "Welkom!", op: "2026-11-04T10:00:01Z" },
    { rol: "medewerker", tekst: "Ik help je", op: "2026-11-04T10:01:00Z", door: "Rita (Bakker)" },
  ],
});

describe("chatpagina van een klantsite", () => {
  it("is gewone HTML zonder script en ontsnapt alle tekst", () => {
    const html = renderChatPagina({ ...basis, gesprek: gesprek("mens") });
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("Bakker &amp; Zn &lt;b&gt;");
    expect(html).toContain("Hoi &lt;script&gt;");
    expect(html).toContain("Rita (Bakker)");
    expect(html).toContain(`action="/site/bakker/_zf/chat"`);
    expect(html).toContain(`href="${stylesheetHref(opts)}"`);
  });

  it("ververst vanzelf zolang de gast op een medewerker wacht of met hem chat", () => {
    expect(renderChatPagina({ ...basis, gesprek: gesprek("wacht") })).toContain('http-equiv="refresh"');
    expect(renderChatPagina({ ...basis, gesprek: gesprek("ai") })).not.toContain('http-equiv="refresh"');
  });

  it("verstuurt op een voorbeeld of voorstel niets: alles uit, met uitleg", () => {
    const html = renderChatPagina({ ...basis, inert: true, afspraak: true });
    expect(html).toContain("Dit is een voorbeeld.");
    expect(html).toMatch(/<textarea id="zfc-bericht"[^>]* disabled/);
    expect(html).toMatch(/Vraag afspraak aan/);
    expect(html).not.toContain('http-equiv="refresh"');
  });

  it("toont het afspraakformulier en meldingen voor schermlezers", () => {
    const html = renderChatPagina({ ...basis, afspraak: true, fout: "afspraak" });
    expect(html).toContain('id="afspraak"');
    expect(html).toContain('min="2026-11-04"');
    expect(html).toContain('role="alert"');
    expect(renderChatPagina({ ...basis, ok: "afspraak" })).toContain('role="status"');
    expect(renderChatPagina({ ...basis, fout: "<onzin>" })).not.toContain('role="alert"');
  });

  it("biedt suggesties tot de eerste vraag", () => {
    expect(renderChatPagina(basis)).toContain('class="zfc-sug"');
    expect(renderChatPagina({ ...basis, gesprek: gesprek("ai") })).not.toContain('class="zfc-sug"');
  });
});

describe("chatlink op de site", () => {
  const site: RenderableSite = {
    pages: [{ id: "p1", slug: "", titel: "Home", seoTitel: "", seoOmschrijving: "", blocks: [] }],
    media: [],
    theme: { kleur: "#0E5C4A", accent: "#F2B544", lettertype: "modern", hoeken: "rond" },
    bedrijf: { naam: "Bakker", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" },
    winkel: undefined,
  };
  const page = site.pages[0]!;

  it("staat er alleen als de chat aan staat, als gewone link zonder script", () => {
    const met = renderPage(site, page, { root: "/site/bakker/", origin: "https://zekerflex.com", chat: true });
    expect(met).toContain('<a class="zfchat" href="/site/bakker/_zf/chat">');
    expect(met).not.toMatch(/<script(?![^>]*application\/ld\+json)/i);
    expect(renderPage(site, page, { root: "/site/bakker/", origin: "https://zekerflex.com" })).not.toContain("zfchat");
  });

  it("schuift boven de WhatsApp-knop en geeft de pagina ruimte onderaan", () => {
    const css = siteCss(site.theme);
    expect(css).toContain(".wa+.zfchat{bottom:80px}");
    expect(css).toContain("body:has(.zfchat){padding-bottom:84px}");
  });
});
