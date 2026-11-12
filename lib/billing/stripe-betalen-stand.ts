// ---------------------------------------------------------------------------
// Pure regels: staan betalingen bij het live Stripe-account uit? Los van de opslag (stripe-betalen.ts), zodat de
// takenlijst, het scherm en de tests het kunnen gebruiken zonder Stripe of KV.
// ---------------------------------------------------------------------------

/** Het laatst gemeten account (GET /v1/account of de webhook account.updated). */
export interface AccountStand {
  /** charges_enabled: kan het account betalingen ontvangen? */
  betalen: boolean;
  /** payouts_enabled: kan het account uitbetalen? */
  uitbetalen: boolean;
  /** wanneer gemeten (ISO) */
  gemeten: string;
  /** sinds wanneer betalen of uitbetalen uit staat (ISO); null als alles aan staat */
  uitSinds: string | null;
}

/** Zegt Stripe dat het account nu geen (live) betalingen mag ontvangen? (bijv. "Your account cannot currently make live charges.") */
export function isBetalenUitFout(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: unknown; code?: unknown; raw?: { message?: unknown } };
  const tekst = [e.message, e.raw?.message].filter((x): x is string => typeof x === "string").join(" ");
  // ook "You cannot create new accounts because your account has been rejected" (Connect-account maken, 12 nov)
  return /cannot currently make live charges|charges (are|have been) disabled|account (is|has been) (restricted|disabled|rejected)|cannot create new accounts/i.test(tekst);
}

/** De nieuwe stand na een meting, met "uit sinds" doorgeschoven als het al uit stond. */
export function nieuweStand(oud: AccountStand | null, betalen: boolean, uitbetalen: boolean, nu: Date): AccountStand {
  const uit = !betalen || !uitbetalen;
  return { betalen, uitbetalen, gemeten: nu.toISOString(), uitSinds: uit ? (oud?.uitSinds ?? nu.toISOString()) : null };
}

/** Sloeg betalen of uitbetalen net om naar uit? Dan krijgt de eigenaar meteen een melding (één keer per omslag). */
export function slaatOmNaarUit(oud: AccountStand | null, nieuw: AccountStand): boolean {
  return (oud?.betalen !== false && !nieuw.betalen) || (oud?.uitbetalen !== false && !nieuw.uitbetalen);
}

/** Leest een bewaarde stand soepel. */
export function leesStand(v: unknown): AccountStand | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<AccountStand>;
  if (typeof o.betalen !== "boolean" || typeof o.uitbetalen !== "boolean" || typeof o.gemeten !== "string") return null;
  return { betalen: o.betalen, uitbetalen: o.uitbetalen, gemeten: o.gemeten, uitSinds: typeof o.uitSinds === "string" ? o.uitSinds : null };
}
