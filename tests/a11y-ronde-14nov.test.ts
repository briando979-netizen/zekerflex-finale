import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Toegankelijkheidsronde 14 nov over wat die nacht veranderde: wat zonder browser te bewaken is.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("toegankelijkheid: de onderdelen van 14 nov", () => {
  it("het nieuwsbriefveld in de footer heeft een naam voor schermlezers (een placeholder is geen label)", () => {
    const s = lees("components/marketing/NewsletterSignup.tsx");
    expect(s).toContain('aria-label="E-mailadres voor de nieuwsbrief"');
    expect(s).toContain('name="email"');
  });

  it("de meldingen van de formulierfixes zijn alerts, en de knoppen staan aan", () => {
    const demo = lees("components/marketing/DemoBooking.tsx");
    expect(demo).toContain('{err && <p role="alert"');
    expect(demo).not.toMatch(/disabled=\{busy \|\| !form\.firstName/);
    const klus = lees("components/marketing/KlusConcept.tsx");
    expect(klus).toMatch(/<p role="alert" className="mt-3 text-sm font-medium text-crit">\s*\{fout\}/);
    expect(klus).toContain('onClick={save} disabled={saving}');
  });

  it("de verkoopkaart, de chip 'Wacht op jou' en het plakvak zijn benoemd", () => {
    expect(lees("components/admin/VerkoopKaart.tsx")).toMatch(/<Link\s+href=\{item\.href\}/);
    expect(lees("components/admin/SalesDashboard.tsx")).toContain("aria-pressed={active}");
    const tab = lees("components/admin/sales/CampaignsTab.tsx");
    expect(tab).toMatch(/<label[^>]*>[\s\S]{0,400}<textarea/);
    expect(tab).toContain('role="status"');
  });

  it("de chat zegt wat er met een lange tekst gebeurt (status) en de fout is een alert", () => {
    const s = lees("components/chat/Composer.tsx");
    expect(s).toMatch(/<p role="status"[^>]*>\s*\{text\.trim\(\)\.length/);
    expect(s).toContain('<div role="alert"');
  });

  it("het overschrijvingsblok op /betaal is een benoemde sectie", () => {
    const s = lees("app/betaal/[token]/page.tsx");
    expect(s).toContain('<section className="mt-6 rounded-xl border border-hair bg-paper-soft p-4" aria-labelledby="overschrijving-kop">');
    expect(s).toContain('<h2 id="overschrijving-kop"');
  });
});
