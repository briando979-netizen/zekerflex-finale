// ---------------------------------------------------------------------------
// Uitzendpartners (21 nov 2026, eigenaar: "alle uitzendbureaus de optie geven zoals YoungOnes dat met YoungCapital doet").
// Een uitzendbureau heeft een gewoon bedrijfsaccount op ZekerFlex en wordt in het beheer gemarkeerd als uitzendpartner.
// Klussen van zo'n bureau zijn altijd uitzendklussen en het BUREAU is de werkgever: het tekent het uitzendcontract,
// betaalt het loon en regelt de verloning. ZekerFlex levert de app en de werkers en rekent alleen zijn platformvergoeding
// per uur aan het bureau. Zo hoeft ZekerFlex zelf geen uitlener te zijn (Wtta, zie de geheugennotitie wtta-zonder-100k).
// Puur bestand: de set komt uit lib/uitzend/partners.ts (KV systeem:uitzendpartners); browser-veilig.
// ---------------------------------------------------------------------------

/** tenant-id → sinds wanneer (ISO) het bedrijf uitzendpartner is */
export type UitzendPartners = Record<string, string>;

export const GEEN_PARTNERS: UitzendPartners = {};

export function isUitzendPartner(set: UitzendPartners | null | undefined, tenantId: string | null | undefined): boolean {
  return Boolean(set && tenantId && Object.hasOwn(set, tenantId));
}

/** De set na een schakeling: aan zet "sinds" op nu (een bestaande partner houdt zijn datum), uit haalt hem eruit. */
export function schakelUitzendPartner(set: UitzendPartners, tenantId: string, aan: boolean, nu: Date): UitzendPartners {
  const nieuw = { ...set };
  if (aan) nieuw[tenantId] = nieuw[tenantId] ?? nu.toISOString();
  else delete nieuw[tenantId];
  return nieuw;
}

/** Een set uit KV, schoon gemaakt: alleen tekst-id's met een geldige datum. */
export function leesUitzendPartnersWaarde(v: unknown): UitzendPartners {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(([k, d]) => k.length > 0 && typeof d === "string" && Number.isFinite(new Date(d).getTime())),
  ) as UitzendPartners;
}
