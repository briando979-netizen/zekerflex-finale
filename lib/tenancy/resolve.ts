// ---------------------------------------------------------------------------
// Multi-tenant fundering: koppel een inkomend hostname (subdomein of eigen
// domein van een klant) aan een tenant + diens branding. Zuiver → testbaar; de
// opslag zit in registry.ts (KV, runtime instelbaar). Zo kun je andere bureaus
// "onder je" hosten: elke klant z'n eigen host, eigen merk, eigen tenant.
// ---------------------------------------------------------------------------

export interface TenantBrand {
  name: string; // merknaam van de klant
  primaryColor: string; // bv. "#0E5C4A"
  logoUrl: string; // publieke logo-URL
}

export interface TenantHostEntry {
  host: string; // "klant1.jouwplatform.nl", "www.klantdomein.nl" of wildcard "*.jouwplatform.nl"
  tenantId: string; // verwijst naar een Tenant (child van jouw reseller-tenant)
  brand: TenantBrand;
}

/** Normaliseer een host: lowercase, poort eraf, trailing punt eraf, www eraf. */
export function normalizeHost(host: string): string {
  return (host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

/**
 * Zoekt de tenant voor een host: eerst een exacte match, anders een wildcard-
 * entry ("*.basis") die elk subdomein van die basis dekt. Null = geen tenant
 * (dan toon je het standaard-ZekerFlex-merk).
 */
export function matchTenantHost(host: string, entries: TenantHostEntry[]): TenantHostEntry | null {
  const h = normalizeHost(host);
  if (!h) return null;

  const exact = entries.find((e) => normalizeHost(e.host) === h);
  if (exact) return exact;

  for (const e of entries) {
    const raw = (e.host || "").trim().toLowerCase();
    if (raw.startsWith("*.")) {
      const base = normalizeHost(raw.slice(2));
      if (base && (h === base || h.endsWith("." + base))) return e;
    }
  }
  return null;
}
