import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Een body begrensd inlezen (12 nov 2026, beveiligingsronde met 86). De server laat tot 210 MB door
// (middlewareClientMaxBodySize in next.config.mjs), dus een openbare route die request.json()/formData()/text()
// aanroept, leest anders eerst alles in het geheugen. Hier: eerst Content-Length, en ook zonder die kop (chunked)
// stopt het lezen zodra de grens bereikt is. Te groot = 422 (nooit 403: CrowdSec telt die). De inhoud komt nergens
// in een log.
// ---------------------------------------------------------------------------

export const TE_GROOT = "Het verzoek is te groot.";

/** Weigert meteen op Content-Length (vóór er iets gelezen is). */
export function eisContentLength(request: Request, max: number): void {
  const lengte = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(lengte) && lengte > max) throw AppError.validation(TE_GROOT);
}

/** De ruwe body, hooguit `max` bytes; daarboven een 422. Ook voor webhooks die de handtekening op de ruwe body controleren. */
export async function leesBegrensd(request: Request, max: number): Promise<Uint8Array> {
  eisContentLength(request, max);
  if (!request.body) return new Uint8Array(0);
  const lezer = request.body.getReader();
  const stukken: Uint8Array[] = [];
  let totaal = 0;
  for (;;) {
    const { done, value } = await lezer.read();
    if (done) break;
    totaal += value.byteLength;
    if (totaal > max) {
      await lezer.cancel().catch(() => undefined);
      throw AppError.validation(TE_GROOT);
    }
    stukken.push(value);
  }
  const uit = new Uint8Array(totaal);
  let plek = 0;
  for (const s of stukken) {
    uit.set(s, plek);
    plek += s.byteLength;
  }
  return uit;
}

/** De body als tekst (UTF-8), begrensd. */
export async function tekstBegrensd(request: Request, max: number): Promise<string> {
  return new TextDecoder().decode(await leesBegrensd(request, max));
}

/** De body als JSON, begrensd; ongeldige JSON geeft `fout` terug (de route kiest zelf de melding). */
export async function jsonBegrensd(request: Request, max: number): Promise<{ ok: true; waarde: unknown } | { ok: false }> {
  const tekst = await tekstBegrensd(request, max);
  try {
    return { ok: true, waarde: JSON.parse(tekst) as unknown };
  } catch {
    return { ok: false };
  }
}

/** De body als FormData (multipart of urlencoded), begrensd; ongeldig = null. */
export async function formDataBegrensd(request: Request, max: number): Promise<FormData | null> {
  const bytes = await leesBegrensd(request, max);
  const soort = request.headers.get("content-type") ?? "";
  try {
    return await new Response(bytes, { headers: { "content-type": soort } }).formData();
  } catch {
    return null;
  }
}
