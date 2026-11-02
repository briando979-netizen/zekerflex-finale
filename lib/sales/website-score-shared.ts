// Gedeeld tussen server en scherm (geen database of netwerk hier): de vorm van
// de websitescore bij een sales-lead en de drempel voor "kans voor Website-beheer".
// De logica die de check draait staat in lib/sales/website-score.ts.

export interface LeadWebsiteCheck {
  checkId: string;
  host: string;
  score: number;
  problems: number;
  attention: number;
  platform: string | null;
  at: string;
}

/** Onder deze score noemen we het een kans voor Website-beheer. */
export const WEBSITE_OPPORTUNITY_BELOW = 70;
const REFRESH_DAYS = 30;

/** De bedrijfswebsite van een lead (alleen http(s), nooit onze eigen site). */
export function leadWebsiteUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return null;
  try {
    const u = new URL(sourceUrl);
    if (/(^|\.)zekerflex\.(com|nl)$/i.test(u.hostname)) return null;
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}

/** Leest de opgeslagen check uit enrichmentJson (of null). */
export function websiteCheckOf(enrichment: unknown): LeadWebsiteCheck | null {
  const w = (enrichment as { websiteCheck?: Partial<LeadWebsiteCheck> } | null)?.websiteCheck;
  if (!w || typeof w.checkId !== "string" || typeof w.score !== "number" || typeof w.at !== "string") return null;
  return {
    checkId: w.checkId,
    host: typeof w.host === "string" ? w.host : "",
    score: w.score,
    problems: typeof w.problems === "number" ? w.problems : 0,
    attention: typeof w.attention === "number" ? w.attention : 0,
    platform: typeof w.platform === "string" ? w.platform : null,
    at: w.at,
  };
}

export function needsWebsiteCheck(enrichment: unknown, now = Date.now()): boolean {
  const w = websiteCheckOf(enrichment);
  return !w || now - Date.parse(w.at) > REFRESH_DAYS * 86_400_000;
}
