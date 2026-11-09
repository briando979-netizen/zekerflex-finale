import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import { STRIPE_WACHT, attemptLabel, waitForStripe } from "@/lib/kyc/stripe-status";

// Terug van Stripe staat de controle vaak nog op "processing". De pagina liet
// dan de kale "PENDING" en het hele formulier opnieuw zien, zodat werkers
// dachten dat het mislukt was en opnieuw begonnen. Nu een eigen label en de
// pagina vraagt zelf elke paar seconden opnieuw naar de uitslag.

const LOCALES = ["nl", "en", "pl", "ro", "uk"] as const;

describe("status van de vorige ID-poging", () => {
  it("toont 'processing' als eigen label, nooit de kale enum", () => {
    const t = AUTH_DICTS.nl.page.attempt;
    expect(attemptLabel(t, "processing", "PENDING")).toBe("Stripe controleert je ID");
    expect(attemptLabel(t, "started", "PENDING")).toBe(t.started);
    expect(attemptLabel(t, "name_mismatch", "PENDING")).toBe(t.name_mismatch);
    expect(attemptLabel(t, "in_review", "PENDING")).toBe("In behandeling");
    expect(attemptLabel(t, "rejected", "REJECTED")).toBe("Afgewezen");
  });

  it("valt bij vrije tekst (handmatige beslissing) terug op de status", () => {
    const t = AUTH_DICTS.nl.page.attempt;
    expect(attemptLabel(t, "Handmatig door beheer@zekerflex.test", "VERIFIED")).toBe("Geverifieerd");
    expect(attemptLabel(t, "Handmatig door beheer@zekerflex.test: wazige foto", "REJECTED")).toBe("Afgewezen");
    expect(attemptLabel(t, null, "EXPIRED")).toBe("Verlopen");
    expect(attemptLabel(t, null, "PENDING")).toBe("In behandeling");
    for (const status of ["PENDING", "NOT_STARTED", "VERIFIED", "REJECTED", "EXPIRED"]) {
      expect(attemptLabel(t, "iets anders", status)).not.toBe(status);
    }
  });

  it("heeft alle teksten in vijf talen", () => {
    for (const l of LOCALES) {
      const t = AUTH_DICTS[l].page.attempt;
      for (const [k, v] of Object.entries(t)) expect(v.trim(), `${l}.${k}`).not.toBe("");
      expect(attemptLabel(t, "processing", "PENDING")).toBe(t.processing);
    }
    expect(AUTH_DICTS.pl.page.attempt.processing).not.toBe(AUTH_DICTS.nl.page.attempt.processing);
  });

  it("wacht alleen zolang Stripe nog controleert, hooguit een paar minuten", () => {
    expect(waitForStripe("processing")).toBe(true);
    for (const d of ["started", "verified", "requires_input", "canceled", "name_mismatch", "in_review", null]) {
      expect(waitForStripe(d)).toBe(false);
    }
    expect(STRIPE_WACHT.everyMs * STRIPE_WACHT.maxTimes).toBeLessThanOrEqual(5 * 60_000);
    expect(STRIPE_WACHT.everyMs).toBeGreaterThanOrEqual(3_000);
  });

  it("de verificatiepagina gebruikt het label en het wachten", () => {
    const src = readFileSync(path.join(process.cwd(), "app/dashboard/verificatie/page.tsx"), "utf8");
    expect(src).toContain("attemptLabel(pt.attempt");
    expect(src).toMatch(/waitForStripe\(lastCheck\.decisionStatus\) && <StripeIdentityWacht/);
    expect(src).not.toContain("STRIPE_LABEL");
  });
});
