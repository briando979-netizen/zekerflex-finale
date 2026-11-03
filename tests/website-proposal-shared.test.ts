import { describe, expect, it } from "vitest";
import { euro, isProposalExpired, proposalMailText, type ProposalOfferView } from "@/lib/sales/website-proposal-shared";
import type { WebsiteProposal } from "@/lib/sales/website-proposal";

// De kant-en-klare mailtekst die sales zelf verstuurt (ZekerFlex mailt bedrijven
// nooit vanzelf): de link naar het voorstel, de score, en de introductiekorting
// alleen zolang er plekken zijn.

const p = {
  id: "0123456789abcdef01234567",
  bedrijf: "Schildersbedrijf De Vries",
  host: "devries-schilders.nl",
  check: { score: 48 },
  expiresAt: "2026-12-03T10:00:00.000Z",
} as WebsiteProposal;
const offer = (left: number): ProposalOfferView => ({
  pricing: { websiteCents: 49500, kortingPct: 50, plekken: 50, geldigDagen: 30 },
  places: { total: 50, taken: 50 - left, left },
  website: { cents: 49500, kortingCents: left > 0 ? 24750 : null },
  plannen: [{ key: "basis", label: "Basis", priceCentsPerMonth: 4900 }],
});

describe("mailtekst voor een websitevoorstel", () => {
  it("bevat de link, de score, de vervaldatum en de afzender", () => {
    const text = proposalMailText(p, offer(12), "https://zekerflex.com", "Sanne");
    expect(text).toContain("Onderwerp: Een nieuwe website voor Schildersbedrijf De Vries");
    expect(text).toContain("https://zekerflex.com/websitevoorstel/0123456789abcdef01234567");
    expect(text).toContain("scoort 48 van de 100");
    expect(text).toContain("geldig tot 3 december 2026");
    expect(text).toContain("De eerste 50 bedrijven krijgen 50% introductiekorting op de website; er zijn nog 12 plekken.");
    expect(text.trim().endsWith("Sanne\nZekerFlex")).toBe(true);
  });

  it("noemt de score van de nieuwe site zodra die gemeten is", () => {
    expect(proposalMailText(p, offer(12), "https://zekerflex.com", "Sanne")).toContain("scoort 48 van de 100 in onze website-check.");
    const gemeten = { ...p, nieuw: { at: "2026-11-03T10:00:00.000Z", checkId: "abcdef0123456789", score: 94, categorieen: [], extra: [] } };
    expect(proposalMailText(gemeten, offer(12), "https://zekerflex.com", "Sanne")).toContain("scoort 48 van de 100 in onze website-check, de nieuwe 94.");
  });

  it("noemt geen korting meer als de plekken op zijn", () => {
    expect(proposalMailText(p, offer(0), "https://zekerflex.com", "Sanne")).not.toContain("introductiekorting");
  });

  it("bedragen en verlopen", () => {
    expect([euro(49500), euro(24750), euro(1250)]).toEqual(["€ 495", "€ 247,50", "€ 12,50"]);
    expect(isProposalExpired(p, Date.parse("2026-12-03T09:59:59Z"))).toBe(false);
    expect(isProposalExpired(p, Date.parse("2026-12-03T10:00:00Z"))).toBe(true);
  });
});
