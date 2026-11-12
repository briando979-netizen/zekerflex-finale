import { vulIn } from "@/lib/i18n/vul-in";

// Puur: een foutantwoord van de server ({ error: { code, message, sleutel?, params? } }) in de taal van de werker. Zonder
// bekende sleutel (of zonder tekst voor deze taal) verandert er niets: de Nederlandse message blijft staan. Zie
// lib/i18n/fouten.ts; de statuscode, `code` en `details` blijven zoals ze waren.

export type FoutTeksten = Readonly<Record<string, string>>;

/** De vertaalde body, of null als er niets te vertalen valt. */
export function vertaalFoutBody(body: unknown, teksten: FoutTeksten): unknown {
  if (!body || typeof body !== "object") return null;
  const fout = (body as { error?: unknown }).error;
  if (!fout || typeof fout !== "object") return null;
  const e = fout as { sleutel?: unknown; params?: unknown; message?: unknown };
  if (typeof e.sleutel !== "string" || !Object.hasOwn(teksten, e.sleutel)) return null;
  const sjabloon = teksten[e.sleutel];
  if (!sjabloon) return null;
  const params: Record<string, string | number> = {};
  if (e.params && typeof e.params === "object") {
    for (const [k, v] of Object.entries(e.params as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") params[k] = v;
    }
  }
  return { ...(body as object), error: { ...(fout as object), message: vulIn(sjabloon, params) } };
}
