import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AANBOD, aanbodHref } from "@/lib/marketing/aanbod";
import { STARTERS_ONDERDELEN, STARTERS_SLUGS, valideerStarter } from "@/lib/starters/regels";

// De starterspagina (/starters): "je betaalt alleen voor resultaat" moet waar zijn. Daarom steunt elk onderdeel op een
// bestaand, beschikbaar item in het aanbod, linkt het naar een echte pagina en verzint de pagina geen eigen prijzen.

const ROOT = join(__dirname, "..");
const paginaBestaat = (href: string) => {
  const pad = href.split(/[?#]/)[0]!.replace(/^\//, "");
  return [join(ROOT, "app", "(marketing)", pad, "page.tsx"), join(ROOT, "app", pad, "page.tsx"), join(ROOT, "app", "(marketing)", "aanbod", "[slug]", "page.tsx")].some((f) => existsSync(f));
};
const pagina = readFileSync(join(ROOT, "app", "(marketing)", "starters", "page.tsx"), "utf8");
const regels = readFileSync(join(ROOT, "lib", "starters", "regels.ts"), "utf8");

describe("de onderdelen op /starters", () => {
  it("elk onderdeel is een beschikbaar item in het aanbod en linkt naar een bestaande pagina", () => {
    expect(STARTERS_ONDERDELEN.length).toBeGreaterThanOrEqual(5);
    for (const o of STARTERS_ONDERDELEN) {
      const item = AANBOD.find((a) => a.slug === o.slug);
      expect(item, o.slug).toBeDefined();
      expect(item!.status, o.slug).toBe("beschikbaar");
      expect(paginaBestaat(o.href ?? aanbodHref(item!)), `${o.slug} → ${o.href ?? aanbodHref(item!)}`).toBe(true);
    }
    expect(STARTERS_SLUGS).toContain("logo-maker");
    expect(STARTERS_SLUGS).toContain("advertentie-op-maat");
  });

  it("de pagina toont alleen beschikbare items en haalt prijzen uit bestaande bronnen", () => {
    expect(pagina).toContain('a.status === "beschikbaar"');
    expect(pagina).toContain("leesPrijzen()");
    expect(pagina).toContain("prijsTekst(item)");
    for (const bron of [pagina, regels]) expect(bron.replace(/\/\/.*$/gm, "")).not.toMatch(/\u{20AC}\s?\d/u);
  });

  it("belooft niets wat niet bestaat: geen bank, financiering, logo-ontwerper of garantie", () => {
    const tekst = `${pagina}\n${regels}`.toLowerCase();
    for (const woord of ["zekerflex bank", "bankrekening", "betaalpas", "financiering", "lening", "krediet", "geld terug garantie", "gegarandeerd", "binnen 24 uur", "binnen een dag"]) expect(tekst, woord).not.toContain(woord);
    // inschrijving, boekhouding en verzekering komen alleen voor in het antwoord dat zegt dat wij dat NIET doen
    expect(pagina).toContain("Nee. Wij helpen met hoe je bedrijf eruitziet en gevonden wordt.");
    expect(pagina.match(/boekhouding/g)?.length).toBe(2);
    // de gratis rekentools bestaan
    for (const m of pagina.matchAll(/href: "(\/rekentools\/[a-z-]+)"/g)) expect(paginaBestaat(m[1]!), m[1]).toBe(true);
  });

  it("staat in het aanbod en in de sitemap", () => {
    expect(AANBOD.find((a) => a.slug === "starters")).toMatchObject({ pagina: "/starters", status: "beschikbaar" });
    expect(readFileSync(join(ROOT, "app", "sitemap.ts"), "utf8")).toContain('entry("/starters"');
  });
});

describe("het aanvraagformulier", () => {
  const goed = { naam: "Jan Jansen", email: "jan@voorbeeld.test", idee: "Fietsenmaker aan huis", nodig: ["logo-maker", "website"] };

  it("neemt een nette aanvraag aan en houdt alleen bekende keuzes over", () => {
    expect(valideerStarter({ ...goed, telefoon: "06 12345678", toelichting: " <b>Graag</b> snel ", nodig: ["website", "logo-maker", "bank", "constructor"] })).toEqual({
      ok: true,
      waarde: { naam: "Jan Jansen", email: "jan@voorbeeld.test", telefoon: "06 12345678", idee: "Fietsenmaker aan huis", nodig: ["logo-maker", "website"], toelichting: "Graag snel" },
    });
  });

  it("zegt wat ontbreekt", () => {
    expect(valideerStarter({ ...goed, naam: "" })).toMatchObject({ ok: false, veld: "naam" });
    expect(valideerStarter({ ...goed, email: "jan" })).toMatchObject({ ok: false, veld: "email" });
    expect(valideerStarter({ ...goed, idee: "" })).toMatchObject({ ok: false, veld: "idee" });
    expect(valideerStarter({ ...goed, nodig: [] })).toMatchObject({ ok: false, veld: "nodig" });
    expect(valideerStarter({ ...goed, nodig: "website" })).toMatchObject({ ok: false, veld: "nodig" });
    expect(valideerStarter(null)).toMatchObject({ ok: false });
  });

  it("de route meldt de eigenaar niet bij een testadres en geeft nooit een 403", () => {
    const route = readFileSync(join(ROOT, "app", "api", "starters", "route.ts"), "utf8");
    expect(route).toContain("if (!isReservedTestAddress(d.email))");
    expect(route).toContain("enforceRateLimit");
    expect(route).not.toContain("forbidden");
  });
});
