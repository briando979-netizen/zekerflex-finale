// Verzoeken van de rijschool-schermen naar de eigen API. Een fout komt terug
// als Error met de Nederlandse melding van de server.

export async function stuur<T>(url: string, method: "GET" | "POST" | "PATCH" = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? (data?.error?.message ?? "Log opnieuw in.")
        : (data?.error?.message ?? "Er ging iets mis. Probeer het opnieuw."),
    );
  }
  return data as T;
}

export const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Er ging iets mis. Probeer het opnieuw.");

/** "1.234,50", "62,50" of "62.5" → cent; null als het geen bedrag is. */
export function centVan(s: string): number | null {
  const kaal = s.replace(/[€\s]/g, "");
  // met een komma is de punt een duizendtal-scheiding, anders de decimale punt
  const schoon = kaal.includes(",") ? kaal.replace(/\./g, "").replace(",", ".") : kaal;
  if (!/^\d+(\.\d{1,2})?$/.test(schoon)) return null;
  return Math.round(Number(schoon) * 100);
}

/** 6250 → "62,50" voor in een invoerveld. */
export const bedragVeld = (cent: number) => (cent / 100).toFixed(2).replace(".", ",");
