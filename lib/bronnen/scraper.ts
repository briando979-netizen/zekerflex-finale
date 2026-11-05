import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// De browser-werker (deploy/scraper): Playwright met Chromium in een eigen
// container, alleen intern bereikbaar. De app vraagt hier een schermafdruk of
// de tekst van elementen op; zonder SCRAPER_TOKEN staat de werker uit.
// ---------------------------------------------------------------------------

export const scraperIngesteld = () => Boolean(env.SCRAPER_TOKEN);

async function vraag<T>(pad: string, body: Record<string, unknown>, timeoutMs = 60_000): Promise<T> {
  if (!env.SCRAPER_TOKEN) throw AppError.precondition("De browser-werker staat uit (SCRAPER_TOKEN ontbreekt).");
  const res = await fetch(`${env.SCRAPER_URL.replace(/\/$/, "")}${pad}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-scraper-token": env.SCRAPER_TOKEN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => null)) as (T & { fout?: string }) | null;
  if (!res.ok || !data) throw AppError.upstream(`browser-werker: ${data?.fout ?? `status ${res.status}`}`);
  return data;
}

export interface SchermafdrukAntwoord {
  status: number;
  titel: string;
  ms: number;
  /** base64 PNG */
  png: string;
  dominant: number;
}

export const schermafdruk = (url: string, opties: { breedte?: number; hoogte?: number; wachtMs?: number } = {}) => vraag<SchermafdrukAntwoord>("/schermafdruk", { url, ...opties });

export const tekstVan = (url: string, selectors: string[]) => vraag<{ status: number; titel: string; ms: number; teksten: Record<string, string[]> }>("/tekst", { url, selectors });

/** Draait de werker en antwoordt hij? */
export async function scraperGezond(): Promise<boolean> {
  if (!env.SCRAPER_TOKEN) return false;
  try {
    const r = await fetch(`${env.SCRAPER_URL.replace(/\/$/, "")}/gezond`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}
