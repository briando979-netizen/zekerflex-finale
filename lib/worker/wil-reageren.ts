// ---------------------------------------------------------------------------
// "Reageer op deze klus" on a public klus page (/klussen/[id], often the
// landing page from Google for Jobs) sends a new worker to sign up. Sign-up
// goes through e-mail verification, so a return URL easily gets lost; instead
// the browser remembers the klus and the worker's Ontdekken page offers it
// again (components/app/WilReagerenNudge.tsx). Pure, browser-safe.
// ---------------------------------------------------------------------------

export const WIL_REAGEREN_KEY = "zf-wil-reageren";
const MAX_AGE_MS = 14 * 24 * 3600_000;

export interface WilReageren {
  id: string;
  title: string;
  savedAt: number;
}

export function wilReagerenValue(id: string, title: string, now = Date.now()): string {
  return JSON.stringify({ id, title: title.slice(0, 120), savedAt: now } satisfies WilReageren);
}

/** The remembered klus, or null when missing, broken or older than 14 days. */
export function parseWilReageren(raw: string | null, now = Date.now()): WilReageren | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<WilReageren>;
    const ok =
      typeof v.id === "string" && /^[a-z0-9_-]{8,40}$/i.test(v.id) &&
      typeof v.title === "string" && v.title.trim().length > 0 && v.title.length <= 120 &&
      typeof v.savedAt === "number" && now - v.savedAt >= 0 && now - v.savedAt <= MAX_AGE_MS;
    return ok ? (v as WilReageren) : null;
  } catch {
    return null;
  }
}
