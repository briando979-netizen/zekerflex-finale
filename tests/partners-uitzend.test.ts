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
    expect(bron).toContain("Jij blijft de werkgever");
    expect(bron).toContain("BASE_FEE_PER_HOUR_CENTS");
    expect(bron).not.toMatch(/€\s?\d/);
    expect(bron).toContain('export const dynamic = "force-dynamic"');
    expect(bron).toMatch(/catch \{\s*return null;/);
    expect(bron).not.toMatch(/ZekerFlex is (je|de) werkgever/);
  });
});
