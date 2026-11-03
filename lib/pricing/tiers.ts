// ---------------------------------------------------------------------------
// The staffel itself, without database or env — so the public calculators in
// the browser and the billing code on the server read the same tiers.
// lib/pricing/volume.ts adds the "how many hours did this client work this
// month" lookup on top.
// ---------------------------------------------------------------------------

/** Published base fee (€ 3,50); the server bills env.PLATFORM_FEE_PER_HOUR_CENTS. */
export const BASE_FEE_PER_HOUR_CENTS = 350;

export interface VolumeTier {
  name: string;
  fromHours: number;
  /** fraction of the base fee (1 = full price) */
  factor: number;
}

export const VOLUME_TIERS: VolumeTier[] = [
  { name: "Basis", fromHours: 0, factor: 1 },
  // Exact fractions of the € 3,50 base so the advertised round prices come out
  // to the cent (0.93 etc. gave € 3,26 / 3,01 / 2,77 / 2,49).
  { name: "Groei", fromHours: 500, factor: 325 / 350 }, // € 3,25
  { name: "Volume", fromHours: 2_000, factor: 300 / 350 }, // € 3,00
  { name: "Enterprise", fromHours: 10_000, factor: 275 / 350 }, // € 2,75
  { name: "Mega", fromHours: 50_000, factor: 250 / 350 }, // € 2,50
];

export function tierFor(monthHours: number): { tier: VolumeTier; next: VolumeTier | null } {
  let i = 0;
  while (i + 1 < VOLUME_TIERS.length && monthHours >= VOLUME_TIERS[i + 1]!.fromHours) i++;
  return { tier: VOLUME_TIERS[i]!, next: VOLUME_TIERS[i + 1] ?? null };
}

export function tierRateCents(tier: VolumeTier, baseCents = BASE_FEE_PER_HOUR_CENTS): number {
  return Math.round(baseCents * tier.factor);
}

/**
 * Platform fee for a month with this many approved hours. Each hour pays the
 * rate of the tier the client was in when it was approved, so the first 500
 * hours cost € 3,50, the next 1.500 € 3,25, and so on.
 */
export function monthlyPlatformFeeCents(monthHours: number, baseCents = BASE_FEE_PER_HOUR_CENTS): number {
  const hours = Math.max(0, monthHours);
  let cents = 0;
  VOLUME_TIERS.forEach((tier, i) => {
    const end = VOLUME_TIERS[i + 1]?.fromHours ?? Infinity;
    const inBand = Math.max(0, Math.min(hours, end) - tier.fromHours);
    cents += inBand * tierRateCents(tier, baseCents);
  });
  return Math.round(cents);
}
