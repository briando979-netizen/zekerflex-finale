import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { whitepaperBySlug } from "@/lib/kennis/whitepapers";

// Bewaker (15 nov 2026): ZekerFlex biedt geen verzekering. Er is geen verzekeraar en geen polis, maar de site, de app (vijf
// talen), de voorwaarden en een whitepaper zeiden dat werkers vanaf hun eerste klus gratis verzekerd waren, met een
// downloadbaar "verzekeringsbewijs". Een werker die daarop vertrouwt, staat bij schade met lege handen. Komt er een echte
// polis, dan gaat de tekst terug mét de naam van de verzekeraar en het polisnummer (eigenaar-taak verzekering-werkers).

const ROOT = process.cwd();
const BELOFTE = /gratis verzekerd|automatisch verzekerd|kosteloos verzekerd|collectieve dekking|onze verzekeringspartner|verzekeringsbewijs|insurance certificate|you're insured/i;
// beheer (taken, de bank die uit staat) en de tests noemen het bewust
const BUITEN = /^(lib\/admin\/|lib\/bank\/|components\/bank\/|app\/api\/admin\/bank\/|app\/api\/me\/bank\/|app\/(dashboard|werkgever)\/bank\/|lib\/social\/veilig\.ts$)/;

function bestanden(map: string, uit: string[] = []): string[] {
  for (const naam of readdirSync(path.join(ROOT, map))) {
    const rel = `${map}/${naam}`;
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) bestanden(rel, uit);
    else if (/\.(ts|tsx)$/.test(naam)) uit.push(rel);
  }
  return uit;
}

/** De tekst zonder commentaar: een toelichting mag zeggen wat er vroeger stond. */
const zonderCommentaar = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

describe("nergens een verzekering beloven die er niet is", () => {
  it("geen enkele tekst voor werkers of bedrijven zegt dat je via ZekerFlex verzekerd bent", () => {
    const fout = ["app", "components", "lib"]
      .flatMap((m) => bestanden(m))
      .filter((f) => !BUITEN.test(f))
      .filter((f) => BELOFTE.test(zonderCommentaar(readFileSync(path.join(ROOT, f), "utf8"))));
    expect(fout).toEqual([]);
  });

  it("er wordt geen verzekeringsbewijs meer gemaakt", () => {
    expect(existsSync(path.join(ROOT, "app/api/me/insurance/route.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "lib/pdf/insurance.ts"))).toBe(false);
    expect(readFileSync(path.join(ROOT, "app/dashboard/verzekering/page.tsx"), "utf8")).not.toContain("/api/me/insurance");
  });

  it("de verzekeringspagina zegt in elke taal dat je het zelf regelt", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(d.verzekering.dekking.length, taal).toBe(3);
      expect(d.verzekering.subtitel, taal).toMatch(/ZekerFlex/);
      expect(d.verzekering.subtitel, taal).not.toMatch(/automatisch|automatically|automat/i);
    }
    expect(FREELANCER_DICTS.nl.verzekering.subtitel).toContain("geen verzekering");
  });

  it("de whitepaper en artikel 7 van de voorwaarden zijn eerlijk", () => {
    const wp = whitepaperBySlug("verzekering");
    expect(wp?.title).toBe("Welke verzekeringen heb je nodig?");
    expect(JSON.stringify(wp)).not.toMatch(/2\.500\.000|eigen risico per claim|verzekeringspartner/i);
    const voorwaarden = readFileSync(path.join(ROOT, "app/(marketing)/voorwaarden/page.tsx"), "utf8");
    expect(voorwaarden).toContain("ZekerFlex biedt op dit moment geen verzekering aan voor Opdrachten.");
  });
});
