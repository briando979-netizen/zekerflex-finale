// ---------------------------------------------------------------------------
// Beheer → Boekhouding: het ophalen van gegevens door het scherm (browser). Puur: geen prisma of kv.
// ---------------------------------------------------------------------------

export const API_BOEKHOUDING = "/api/admin/boekhouding";

/** Roept de beheer-API aan en geeft het antwoord; bij een fout een Error met de Nederlandse melding van de server. */
export async function boekApi<T>(pad: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BOEKHOUDING}${pad}`, { cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string } & T;
  if (!res.ok) throw new Error(data?.error?.message ?? data?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return data;
}

export function jsonInit(methode: "POST" | "PATCH" | "PUT" | "DELETE", body: unknown): RequestInit {
  return { method: methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
