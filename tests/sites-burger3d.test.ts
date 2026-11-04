import { describe, expect, it } from "vitest";
import { burgerBlokHtml, burgerCss, isBurgerZaak, STANDAARD_LAGEN } from "@/lib/sites/burger3d";
import { BURGER_BEDRIJF, BURGER_THEMA, burgerPaginas, burgerWinkel } from "@/lib/sites/burger-voorbeeld";
import { renderPage, siteCss } from "@/lib/sites/render";
import { siteSaveSchema } from "@/lib/sites/schema";
import { functiesVoorBezoekers } from "@/lib/sites/wat-kan-deze-site";
import { reserveerBlokVan } from "@/lib/sites/reserveren";
import { SECTOR_TEMPLATES, newBlock, pagesFromTemplate, type BlockProps } from "@/lib/sites/types";

// De 3D-burger (4 nov 2026): tekening en CSS, zonder scripts of video; met een pauzeknop
// en stil voor wie minder beweging wil. En de voorbeeldsite van een hamburgerzaak.

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ctx = { esc, paras: (t: string) => `<p>${esc(t)}</p>`, href: (raw: string) => `/site/vuur/${raw}` };

describe("3D-burger", () => {
  it("tekent zeven lagen met namen, een beschrijving voor schermlezers en een pauzeknop, zonder scripts", () => {
    const b = newBlock("burger3d", "b1").props as BlockProps["burger3d"];
    const html = burgerBlokHtml({ ...b, lagen: [{ titel: "Brioche <XL>", tekst: "" }] }, ctx, "b1");
    expect(html.match(/class="b3d-laag /g)).toHaveLength(7);
    expect(html).toContain("Brioche &#60;XL&#62;");
    expect(html).toContain(STANDAARD_LAGEN[3]!.titel);
    expect(html).toMatch(/role="img" aria-label="Een hamburger die laag voor laag in elkaar valt: brioche &#60;xl&#62;, knapperige sla/);
    expect(html).toContain('<input type="checkbox" id="b3d-p-b1" class="b3d-pauze">');
    expect(html).toContain('<label for="b3d-p-b1" class="b3d-pauzeknop">');
    expect(html).not.toMatch(/<script|<video|<iframe/);
  });

  it("beweegt bij scrollen, ademt waar dat niet kan, en staat stil voor wie minder beweging wil", () => {
    const css = burgerCss();
    expect(css).toContain("@property --uit");
    expect(css).toContain("animation-timeline:view()");
    expect(css).toContain("@supports not (animation-timeline:view())");
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^}]*animation:none!important/);
    expect(css).toContain(".b3d-pauze:checked~.b3d-podium");
    expect(siteCss(BURGER_THEMA, undefined, true)).toContain(".b3d-sec{");
    // een site zonder burger beweegt niets (WCAG 2.2.2)
    expect(siteCss(BURGER_THEMA)).not.toMatch(/animation:|@keyframes/);
  });

  it("herkent burgerzaken", () => {
    expect(isBurgerZaak("Burgerbar Vuur")).toBe(true);
    expect(isBurgerZaak("Smash & Co")).toBe(true);
    expect(isBurgerZaak("Bakkerij Jansen")).toBe(false);
  });

  it("geeft een nieuwe burgerzaak de 3D-burger, een gewoon restaurant niet", () => {
    const horeca = SECTOR_TEMPLATES.find((t) => t.id === "horeca")!;
    let n = 0;
    const leeg = { kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" };
    const burger = pagesFromTemplate(horeca, { naam: "Burgerij De Grill", ...leeg }, () => `i${n++}`);
    expect(burger[0]!.blocks.map((b) => b.type)).toContain("burger3d");
    const brasserie = pagesFromTemplate(horeca, { naam: "Brasserie Zon", ...leeg }, () => `i${n++}`);
    expect(brasserie[0]!.blocks.map((b) => b.type)).not.toContain("burger3d");
  });
});

describe("voorbeeldsite Burgerbar Vuur", () => {
  const foto = () => "mabcdef1";
  it("past in de bouwer: pagina's, menu als webshop, reserveren en de 3D-burger", () => {
    const pages = burgerPaginas(foto);
    const res = siteSaveSchema.safeParse({ theme: BURGER_THEMA, bedrijf: BURGER_BEDRIJF, pages, winkel: burgerWinkel(foto) });
    expect(res.success).toBe(true);
    expect(pages[0]!.blocks[1]!.type).toBe("burger3d");
    expect(reserveerBlokVan(pages)?.maxGroep).toBe(12);
    const w = burgerWinkel(foto);
    expect(new Set(w.producten.map((p) => p.categorie))).toEqual(new Set(["Burgers", "Friet en sides", "Shakes en drinken"]));
    expect(w.producten.some((p) => p.uitverkocht)).toBe(true);
    expect(w.producten.some((p) => p.oudePrijsCents)).toBe(true);
    expect(w.producten.some((p) => p.voorraad != null)).toBe(true);
  });

  it("zegt dat het een voorbeeld is, zonder telefoon of e-mail, en toont wat de site kan", () => {
    const pages = burgerPaginas(() => null);
    const site = { pages, media: [], theme: BURGER_THEMA, bedrijf: BURGER_BEDRIJF, voorbeeld: true, winkel: burgerWinkel(() => null) };
    const html = renderPage(site, pages[0]!, { root: "/site/burgerbar-vuur/", origin: "https://zekerflex.com", mandAantal: 0 });
    expect(html).toContain("Burgerbar Vuur bestaat niet");
    expect(html).toContain('class="b3d-sec"');
    expect(html).toContain('<a class="mandlink" href="/site/burgerbar-vuur/mand">');
    expect(html).not.toMatch(/tel:|mailto:/);
    const titels = functiesVoorBezoekers(site).map((f) => f.titel);
    expect(titels).toEqual(expect.arrayContaining(["Een burger in 3D die je ziet ontstaan", "Online een tafel reserveren", "Een echte webshop"]));
  });
});
