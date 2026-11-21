import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";

// /partners/uitzend (21 nov 2026): de pagina achter de link in het samenwerkingsvoorstel aan uitzendbureaus.
// Alleen wat er echt is: live cijfers (of geen), geen verzonnen citaten of bureaus, het bureau is de werkgever.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const bron = lees("app/(marketing)/partners/uitzend/page.tsx");

describe("/partners/uitzend", () => {
  it("bestaat, staat in de sitemap en de rondgang, en linkt naar de voorwaarden en /uitzendpartner", () => {
    expect(APP_PAGES.map((p) => p.route)).toContain("/partners/uitzend");
    expect(lees("app/sitemap.ts")).toContain(`"/partners/uitzend"`);
    expect(bron).toContain("href={PARTNER_VOORWAARDEN_PAD}");
    expect(bron).toContain('href="/uitzendpartner"');
    expect(bron).toContain('canonical("/partners/uitzend"');
  });

  it("eerlijk: het bureau is de werkgever, de prijs komt uit de staffel, de cijfers live en met een vangnet", () => {
    expect(bron).toContain("Jij neemt ze aan op je eigen uitzendcontract en regelt het loon zoals je gewend bent.");
    expect(bron).toContain("Jouw bureau. De werker tekent zijn uitzendcontract bij jou");
    // "met één knop" snapten bureaus niet (eigenaar, 21 nov): zeg wat de werker doet, ook in de og:description
    for (const p of ["app/(marketing)/partners/uitzend/page.tsx", "app/(marketing)/uitzendpartner/page.tsx"]) expect(lees(p), p).not.toContain("één knop");
    expect(bron).toContain("BASE_FEE_PER_HOUR_CENTS");
    expect(bron).not.toMatch(/€\s?\d/);
    expect(bron).toContain('export const dynamic = "force-dynamic"');
    expect(bron).toMatch(/catch \{\s*return null;/);
    expect(bron).not.toMatch(/ZekerFlex is (je|de) werkgever/);
  });
});
