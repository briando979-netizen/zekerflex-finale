import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { BOETE, PARTNER_VOORWAARDEN_PAD, PARTNER_VOORWAARDEN_VERSIE, TERMIJN, euroBedrag } from "@/lib/uitzend/voorwaarden";

// De partnervoorwaarden voor uitzendbureaus (21 nov 2026): regels, boetes en beleid op één pagina. Bedragen en termijnen komen
// uit lib/uitzend/voorwaarden.ts, de platformvergoeding uit lib/pricing/tiers.ts: geen losse bedragen in de pagina.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const bron = lees("app/(marketing)/uitzendpartner/voorwaarden/page.tsx");

describe("partnervoorwaarden voor uitzendbureaus", () => {
  it("de pagina bestaat, staat in de sitemap en de rondgang, en is vindbaar vanaf de partnerpagina en het beheer", () => {
    expect(PARTNER_VOORWAARDEN_PAD).toBe("/uitzendpartner/voorwaarden");
    expect(APP_PAGES.map((p) => p.route)).toContain(PARTNER_VOORWAARDEN_PAD);
    expect(lees("app/sitemap.ts")).toContain(`"${PARTNER_VOORWAARDEN_PAD}"`);
    expect(lees("app/(marketing)/uitzendpartner/page.tsx")).toContain("href={PARTNER_VOORWAARDEN_PAD}");
    expect(lees("components/admin/UitzendPartnerSchakelaar.tsx")).toContain("PARTNER_VOORWAARDEN_VERSIE");
    expect(PARTNER_VOORWAARDEN_VERSIE).toMatch(/^\d{4}-\d{2}$/);
  });

  it("de onderdelen die de eigenaar vroeg: toelating, regels, gegevens, kosten, boetes, handhaving en bezwaar", () => {
    for (const kop of [
      "3. Wie uitzendpartner kan worden",
      "4. Regels voor uitzendklussen",
      "6. Gegevens van werkers en privacy",
      "9. Kosten en betaling",
      "11. Boetes",
      "12. Zo handhaaft ZekerFlex",
      "13. Bescherming van werkers",
    ]) {
      expect(bron, kop).toContain(kop);
    }
    expect(bron).toContain("Bezwaar:");
    expect(bron).toContain("ZekerFlex is geen werkgever, geen uitlener en geen uitzendbureau.");
  });

  it("geen losse bedragen in de pagina: alles uit de bronbestanden", () => {
    expect(bron).not.toMatch(/€\s?\d/);
    expect(bron).toContain("BASE_FEE_PER_HOUR_CENTS");
    for (const sleutel of Object.keys(BOETE)) expect(bron, sleutel).toContain(`BOETE.${sleutel}`);
    expect(bron).toContain("euroBedrag(AANSPRAKELIJKHEID_MAX_EURO)");
  });

  it("bedragen en termijnen zijn redelijk en kloppen met de gebruiksvoorwaarden", () => {
    expect(euroBedrag(BOETE.gegevensMisbruik)).toBe("€ 2.500");
    expect(Object.values(BOETE).every((b) => b > 0 && b <= 2500)).toBe(true);
    // betaaltermijn en uren goedkeuren: dezelfde als artikel 4 en 5 van de gebruiksvoorwaarden
    const gv = lees("app/(marketing)/voorwaarden/page.tsx");
    expect(TERMIJN.betaalDagen).toBe(14);
    expect(gv).toContain("binnen veertien (14) dagen na factuurdatum");
    expect(TERMIJN.urenDagen).toBe(7);
    expect(gv).toContain("De Opdrachtgever bevestigt de uren binnen zeven (7) dagen");
  });
});
