// ---------------------------------------------------------------------------
// Google-reviews verzamelen (werkgever → zijn eigen klanten). Gedeeld tussen
// server en scherm: geen database of netwerk hier. De opslag en het versturen
// staan in lib/review-requests/store.ts.
//
// Bewust geen "review gating": Google verbiedt het om alleen tevreden klanten
// naar Google te sturen, en de ACM ziet gemanipuleerde reviews als misleiding.
// Iedereen krijgt de knop naar Google; iedereen kan het bedrijf daarnaast privé
// laten weten wat beter kan (bij een lage score staat dat formulier al open).
// ---------------------------------------------------------------------------

export interface ReviewSettings {
  /** the company's own Google "write a review" address */
  googleUrl: string | null;
  /** where private feedback goes */
  feedbackEmail: string;
  /** the name customers see ("Bakkerij Jansen") */
  naam: string;
  updatedAt: string | null;
}

export interface ReviewRequest {
  token: string;
  tenantId: string;
  naam: string;
  email: string;
  createdAt: string;
  createdBy: string;
  /** the mail went out (false when the address had opted out of review requests) */
  sent: boolean;
  openedAt: string | null;
  rating: number | null;
  ratedAt: string | null;
  feedback: string | null;
  feedbackAt: string | null;
  googleAt: string | null;
}

export const isReviewToken = (t: string) => /^[a-f0-9]{24}$/.test(t);

/** Scores up to here open the "what can be better" form straight away (the Google button stays just as visible). */
export const LOW_SCORE = 3;

const GOOGLE_HOSTS = /^(g\.page|g\.co|goo\.gl|maps\.app\.goo\.gl|(www\.|maps\.|search\.)?google\.(com|nl))$/i;

/**
 * The company's Google review link, cleaned up; null when it isn't one.
 * Accepts the forms Google hands out: g.page/r/…/review, search.google.com/local/writereview?placeid=…,
 * maps.app.goo.gl/… and google.com/maps/… addresses.
 */
export function normalizeGoogleReviewUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!GOOGLE_HOSTS.test(u.hostname) || u.username || u.password) return null;
  u.protocol = "https:";
  u.hash = "";
  const out = u.toString();
  return out.length <= 500 && !/[\s<>"']/.test(out) ? out : null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function reviewStats(rows: ReviewRequest[]) {
  const rated = rows.filter((r) => r.rating !== null);
  return {
    verstuurd: rows.filter((r) => r.sent).length,
    geopend: rows.filter((r) => r.openedAt).length,
    beoordeeld: rated.length,
    gemiddeld: rated.length ? Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
    naarGoogle: rows.filter((r) => r.googleAt).length,
    feedback: rows.filter((r) => r.feedback).length,
  };
}
