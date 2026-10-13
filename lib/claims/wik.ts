// ---------------------------------------------------------------------------
// Statutory extrajudicial collection costs ("wettelijke incassokosten"),
// Besluit vergoeding voor buitengerechtelijke incassokosten (BIK). May only be
// charged after the debtor missed the free 14-day reminder (WIK) — see
// lib/claims/collections-sweep.ts, which is the only caller that may actually
// apply this fee.
// ---------------------------------------------------------------------------

const BRACKETS = [
  { upTo: 2_500_00, rate: 0.15 },
  { upTo: 5_000_00, rate: 0.1 },
  { upTo: 10_000_00, rate: 0.05 },
  { upTo: 200_000_00, rate: 0.01 },
  { upTo: Infinity, rate: 0.005 },
];

const MIN_FEE_CENTS = 40_00;
const MAX_FEE_CENTS = 6_775_00;

/** Statutory collection fee for a principal debt of `principalCents`, in cents. */
export function statutoryCollectionFeeCents(principalCents: number): number {
  if (principalCents <= 0) return 0;

  let remaining = principalCents;
  let lowerBound = 0;
  let feeCents = 0;

  for (const bracket of BRACKETS) {
    const bracketSize = bracket.upTo - lowerBound;
    const amountInBracket = Math.min(remaining, bracketSize);
    if (amountInBracket <= 0) break;
    feeCents += amountInBracket * bracket.rate;
    remaining -= amountInBracket;
    lowerBound = bracket.upTo;
    if (remaining <= 0) break;
  }

  return Math.min(MAX_FEE_CENTS, Math.max(MIN_FEE_CENTS, Math.round(feeCents)));
}
