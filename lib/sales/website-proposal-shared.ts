// Shared by the screens that list website proposals (Admin → Websitevoorstellen
// and /sales/websitevoorstellen): no database or network here. The engine is
// lib/sales/website-proposal.ts.

import type { ProposalPricing, ProposalStatus, WebsiteProposal } from "@/lib/sales/website-proposal";

/** What GET /api/admin/websitevoorstellen returns as `offer`, as far as the screens use it. */
export interface ProposalOfferView {
  pricing: ProposalPricing;
  places: { total: number; taken: number; left: number };
  website: { cents: number; kortingCents: number | null };
  plannen: { key: string; label: string; priceCentsPerMonth: number }[];
}

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  concept: "Nog niet verstuurd",
  verstuurd: "Verstuurd",
  bekeken: "Bekeken",
  akkoord: "Ja gezegd",
  afgewezen: "Afgezegd",
  ingetrokken: "Ingetrokken",
  overgezet: "Overgezet naar het bedrijf",
};

export const DOMAIN_LABEL: Record<string, string> = {
  houden: "houdt het domein bij de huidige provider",
  verhuizen: "wil het domein verhuizen",
  geen: "heeft nog geen domein",
  "weet-niet": "weet het nog niet",
};

export const euro = (cents: number) => `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const shortDay = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });
export const longDay = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

export const isProposalExpired = (p: Pick<WebsiteProposal, "expiresAt">, now = Date.now()) => !(Date.parse(p.expiresAt) > now);

/** A ready e-mail for the salesperson to send themselves (ZekerFlex never mails the company). */
export function proposalMailText(p: WebsiteProposal, offer: ProposalOfferView, origin: string, me: string): string {
  const korting =
    offer.website.kortingCents !== null && offer.pricing.kortingPct > 0
      ? `\nDe eerste ${offer.places.total} bedrijven krijgen ${offer.pricing.kortingPct}% introductiekorting op de website; er zijn nog ${offer.places.left} plekken.\n`
      : "";
  return `Onderwerp: Een nieuwe website voor ${p.bedrijf}

Hallo,

Ik heb de website van ${p.bedrijf} (${p.host}) bekeken en er alvast een nieuwe voor gemaakt: sneller, veiliger, beter te vinden in Google en met een luxe uitstraling. Je huidige site scoort ${p.check.score} van de 100 in onze website-check${p.nieuw ? `, de nieuwe ${p.nieuw.score}` : ""}.

Je nieuwe website en alle verbeteringen staan hier, alleen voor jou:
${origin}/websitevoorstel/${p.id}
${korting}
Het voorstel is geldig tot ${longDay(p.expiresAt)}. Heb je vragen, bel of mail me gerust.

Met vriendelijke groet,
${me}
ZekerFlex`;
}
