import { parseAmsterdamLocal } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Later versturen in de chat (15 nov 2026): de regels voor de tijd. Puur, zodat de chat (browser) en de server dezelfde
// grenzen gebruiken. Ingevuld als Nederlandse tijd (datetime-local, zonder zone), bewaard in UTC.
// ---------------------------------------------------------------------------

/** Vroegst: over een minuut (de cron draait elke minuut). */
export const GEPLAND_MIN_MS = 60_000;
/** Laatst: over 30 dagen. */
export const GEPLAND_MAX_DAGEN = 30;
/** Hooguit zoveel tegelijk ingepland per persoon. */
export const GEPLAND_MAX_PER_PERSOON = 25;

/** Een gepland bericht (opslag: lib/messaging/gepland.ts). */
export interface GeplandBericht {
  id: string;
  userId: string;
  threadId: string;
  text: string;
  /** verzendtijd (ISO, UTC) */
  sendAt: string;
  createdAt: string;
  /** mislukte pogingen (een storing bij het versturen); na de derde vervalt het */
  pogingen?: number;
}

/** De verzendtijd (UTC) uit een datetime-local in Nederlandse tijd; null als hij onleesbaar, te vroeg of te laat is. */
export function geplandeTijd(lokaal: string, nu = new Date()): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(lokaal)) return null;
  const t = parseAmsterdamLocal(lokaal);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms < nu.getTime() + GEPLAND_MIN_MS - 30_000) return null; // een halve minuut speling voor wie op de grens kiest
  if (ms > nu.getTime() + GEPLAND_MAX_DAGEN * 86_400_000) return null;
  return t;
}
