import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// De VPN-server van ZekerFlex: Headscale (de vrije tegenhanger van Tailscale)
// in een eigen container op de server, bereikbaar via HEADSCALE_URL. Elk
// bedrijf is daar één "gebruiker" (zf-<tenantId>); de apparaten van zijn
// medewerkers en flexwerkers hangen daaronder, gescheiden van andere bedrijven.
// Toegangscodes zijn eenmalig en verlopen vanzelf. Zonder HEADSCALE_URL en
// HEADSCALE_API_KEY is de dienst "nog niet gekoppeld": de schermen zeggen dat
// dan netjes en niets gaat stuk.
// ---------------------------------------------------------------------------

export interface VpnApparaat {
  id: string;
  naam: string;
  online: boolean;
  laatstGezien: string | null;
  adressen: string[];
}

export function vpnGekoppeld(): boolean {
  return Boolean(env.HEADSCALE_URL && env.HEADSCALE_API_KEY);
}

/** Het adres dat de Tailscale-app als eigen server krijgt. */
export function vpnAdres(): string | null {
  return env.HEADSCALE_URL ? env.HEADSCALE_URL.replace(/\/+$/, "") : null;
}

export const vpnGebruikersnaam = (tenantId: string): string => `zf-${tenantId.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;

async function hs<T>(method: "GET" | "POST" | "DELETE", pad: string, body?: unknown): Promise<T> {
  const basis = vpnAdres();
  if (!basis || !env.HEADSCALE_API_KEY) throw AppError.precondition("De VPN-server is nog niet gekoppeld.");
  const stop = new AbortController();
  const klok = setTimeout(() => stop.abort(), 8000);
  try {
    const res = await fetch(`${basis}/api/v1${pad}`, {
      method,
      headers: { Authorization: `Bearer ${env.HEADSCALE_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: stop.signal,
      cache: "no-store",
    });
    const tekst = await res.text();
    if (!res.ok) {
      // nooit de sleutel of het hele antwoord loggen; alleen pad en status
      logger.warn("headscale antwoordde niet goed", { pad: pad.replace(/\?.*$/, ""), status: res.status });
      throw AppError.upstream(`De VPN-server gaf een fout (${res.status}).`);
    }
    return (tekst ? JSON.parse(tekst) : {}) as T;
  } catch (e) {
    if (e instanceof AppError) throw e;
    logger.warn("headscale niet bereikbaar", { pad: pad.replace(/\?.*$/, "") });
    throw AppError.upstream("De VPN-server is nu niet bereikbaar. Probeer het zo opnieuw.");
  } finally {
    clearTimeout(klok);
  }
}

/** Zorgt dat het bedrijf als gebruiker op de VPN-server bestaat. */
export async function zorgVpnGebruiker(tenantId: string): Promise<string> {
  const naam = vpnGebruikersnaam(tenantId);
  const lijst = await hs<{ users?: { name: string }[] }>("GET", "/user");
  if (!lijst.users?.some((u) => u.name === naam)) await hs("POST", "/user", { name: naam });
  return naam;
}

/** Een eenmalige toegangscode voor één apparaat, geldig voor `uren` uur. */
export async function maakVpnSleutel(tenantId: string, uren = 24): Promise<{ sleutel: string; verlooptAt: string }> {
  const naam = await zorgVpnGebruiker(tenantId);
  const verlooptAt = new Date(Date.now() + Math.max(1, Math.min(uren, 24 * 30)) * 3_600_000).toISOString();
  const r = await hs<{ preAuthKey?: { key?: string; expiration?: string } }>("POST", "/preauthkey", {
    user: naam,
    reusable: false,
    ephemeral: false,
    expiration: verlooptAt,
  });
  const sleutel = r.preAuthKey?.key;
  if (!sleutel) throw AppError.upstream("De VPN-server gaf geen toegangscode terug.");
  return { sleutel, verlooptAt: r.preAuthKey?.expiration ?? verlooptAt };
}

/** De apparaten van dit bedrijf op de VPN-server. Niet gekoppeld of storing: leeg. */
export async function vpnApparaten(tenantId: string): Promise<VpnApparaat[]> {
  if (!vpnGekoppeld()) return [];
  try {
    const r = await hs<{ nodes?: { id: string; name?: string; givenName?: string; online?: boolean; lastSeen?: string; ipAddresses?: string[] }[] }>(
      "GET",
      `/node?user=${encodeURIComponent(vpnGebruikersnaam(tenantId))}`,
    );
    return (r.nodes ?? []).map((n) => ({
      id: String(n.id),
      naam: n.givenName || n.name || `apparaat ${n.id}`,
      online: n.online === true,
      laatstGezien: n.lastSeen ?? null,
      adressen: n.ipAddresses ?? [],
    }));
  } catch {
    return [];
  }
}

/** Haalt een apparaat van het netwerk; het moet opnieuw met een code verbinden. */
export async function verwijderVpnApparaat(tenantId: string, id: string): Promise<void> {
  // alleen een apparaat van dit bedrijf, nooit dat van een ander
  const eigen = (await vpnApparaten(tenantId)).some((a) => a.id === id);
  if (!eigen) throw AppError.notFound("Dit apparaat hoort niet bij jouw bedrijf.");
  await hs("DELETE", `/node/${encodeURIComponent(id)}`);
}
