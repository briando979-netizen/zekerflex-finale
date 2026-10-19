import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// EU VAT number check against VIES (European Commission, free, no key).
// Lets a freelancer without a Dutch KVK number — e.g. a Polish or Romanian
// self-employed worker with a VAT ID from their home country — register with
// their btw-nummer instead. "unavailable" means the member-state service was
// down: never treat that as "invalid".
// ---------------------------------------------------------------------------

export interface ViesResult {
  vatNumber: string; // normalised, e.g. "PL5260250995"
  countryCode: string; // VIES code (Greece = EL)
  status: "valid" | "invalid" | "malformed" | "unavailable";
  name: string | null;
  address: string | null;
}

const EU = new Set(["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI"]);

export function normaliseVat(input: string): { countryCode: string; number: string; vatNumber: string } | null {
  const v = input.replace(/[\s.\-]/g, "").toUpperCase().replace(/^GR/, "EL");
  const m = /^([A-Z]{2})([A-Z0-9]{2,12})$/.exec(v);
  if (!m || !EU.has(m[1]!)) return null;
  return { countryCode: m[1]!, number: m[2]!, vatNumber: `${m[1]}${m[2]}` };
}

const clean = (s: unknown) => (typeof s === "string" && s.trim() && s.trim() !== "---" ? s.trim().replace(/\s+/g, " ") : null);

export async function checkVies(input: string, fetchImpl: typeof fetch = fetch): Promise<ViesResult> {
  const n = normaliseVat(input);
  if (!n) return { vatNumber: input.replace(/\s/g, "").toUpperCase(), countryCode: "", status: "malformed", name: null, address: null };
  try {
    const res = await fetchImpl(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${n.countryCode}/vat/${n.number}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`VIES HTTP ${res.status}`);
    const d = (await res.json()) as { isValid?: boolean; valid?: boolean; name?: string; address?: string; userError?: string };
    if (d.userError && d.userError !== "VALID" && d.userError !== "INVALID") throw new Error(`VIES ${d.userError}`);
    const valid = d.isValid ?? d.valid ?? false;
    return { vatNumber: n.vatNumber, countryCode: n.countryCode, status: valid ? "valid" : "invalid", name: clean(d.name), address: clean(d.address) };
  } catch (err) {
    logger.warn("vies check unavailable", { country: n.countryCode, error: (err as Error).message });
    return { vatNumber: n.vatNumber, countryCode: n.countryCode, status: "unavailable", name: null, address: null };
  }
}
