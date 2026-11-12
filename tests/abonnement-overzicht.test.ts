import { describe, expect, it } from "vitest";
import { huidigAbonnement, maandPrijs, planRegels, uitbreidingen } from "@/lib/abonnement/overzicht";
import { SAAS_PLANS } from "@/lib/billing/saas-plans";
import { AANBOD } from "@/lib/marketing/aanbod";

describe("abonnement en uitbreidingen", () => {
  it("zonder abonnement ben je Starter; een opgeslagen plan wordt herkend met of zonder voorvoegsel", () => {
    expect(huidigAbonnement(null)).toEqual({ plan: "starter", status: "actief", tot: null });
    expect(huidigAbonnement({ planKey: "saas:pro", status: "active", currentPeriodEnd: null }).plan).toBe("pro");
    expect(huidigAbonnement({ planKey: "business", status: "past_due", currentPeriodEnd: null })).toMatchObject({ plan: "business", status: "betaling-mislukt" });
    expect(huidigAbonnement({ planKey: "free", status: "active", currentPeriodEnd: null }).plan).toBe("starter");
    expect(huidigAbonnement({ planKey: "saas:pro", status: "canceled", currentPeriodEnd: new Date("2026-12-01T00:00:00Z") })).toMatchObject({ plan: "starter", status: "opgezegd" });
  });

  it("prijzen komen uit saas-plans.ts en zijn nooit zelf verzonnen", () => {
    expect(maandPrijs(0)).toBe("Gratis");
    expect(maandPrijs(null)).toBe("Op aanvraag");
    expect(maandPrijs(149_00)).toBe("€ 149 per maand");
    const regels = planRegels({ plan: "starter", status: "actief", tot: null });
    for (const r of regels) expect(r.prijs).toBe(maandPrijs(SAAS_PLANS[r.sleutel].priceCentsPerMonth));
  });

  it("bepaalt per plan of je kunt kopen, contact moet opnemen of al zit", () => {
    const vanaf = (plan: Parameters<typeof planRegels>[0]["plan"]) => planRegels({ plan, status: "actief", tot: null }).map((r) => r.actie);
    expect(vanaf("starter")).toEqual(["huidig", "kopen", "kopen", "contact"]);
    expect(vanaf("business")).toEqual(["lager", "lager", "huidig", "contact"]);
    expect(vanaf("enterprise")).toEqual(["lager", "lager", "lager", "huidig"]);
  });

  it("uitbreidingen: geen bank, geen verzonnen prijs, en de uitzendopslag komt nergens voor", () => {
    const alle = uitbreidingen().flatMap((g) => g.items);
    expect(alle.length).toBeGreaterThan(10);
    expect(alle.some((i) => /bank|betaalverzoek/i.test(`${i.naam} ${i.slug}`))).toBe(false);
    for (const i of alle) {
      const bron = AANBOD.find((a) => a.slug === i.slug);
      expect(i.prijs, i.slug).toBe(bron?.prijs ?? "Prijs volgt");
      expect(i.prijs.toLowerCase(), i.slug).not.toContain("uitzendopslag");
    }
  });
});
