import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// De VPN-server van ZekerFlex: Headscale (de vrije tegenhanger van Tailscale)
// in een eigen container op de server (deploy/netwerk/headscale). De app praat
// intern met de container (HEADSCALE_API_URL, standaard http://headscale:8080);
// de Tailscale-apps van klanten gebruiken het openbare adres (HEADSCALE_URL,
// vpn.zekerflex.com via Caddy). Elk bedrijf is daar één "gebruiker"
// (zf-<tenantId>); de apparaten van zijn medewerkers en flexwerkers hangen
// daaronder, gescheiden van andere bedrijven. Toegangscodes zijn eenmalig en
// verlopen vanzelf. Zonder HEADSCALE_URL en HEADSCALE_API_KEY is de dienst
// "nog niet gekoppeld": de schermen zeggen dat netjes en niets gaat stuk.
// API van Headscale 0.29: gebruikers hebben een nummer (id); toegangscodes en
// apparaten worden aan dat nummer gekoppeld, niet aan de naam.
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
  if (!vpnGekoppeld()) throw AppError.precondition("De VPN-server is nog niet gekoppeld.");
  const basis = (env.HEADSCALE_API_URL ?? vpnAdres() ?? "").replace(/\/+$/, "");
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

interface HsUser {
  id: string;
  name: string;
}

/** Zorgt dat het bedrijf als gebruiker op de VPN-server bestaat; geeft het nummer terug. */
export async function zorgVpnGebruiker(tenantId: string): Promise<HsUser> {
  const naam = vpnGebruikersnaam(tenantId);
  const lijst = await hs<{ users?: HsUser[] }>("GET", `/user?name=${encodeURIComponent(naam)}`);
  const bestaand = lijst.users?.find((u) => u.name === naam);
  if (bestaand) return bestaand;
  const nieuw = await hs<{ user?: HsUser }>("POST", "/user", { name: naam, displayName: `ZekerFlex ${tenantId}` });
  if (!nieuw.user?.id) throw AppError.upstream("De VPN-server maakte geen gebruiker aan.");
  return nieuw.user;
}

/** Een eenmalige toegangscode voor één apparaat, geldig voor `uren` uur. */
export async function maakVpnSleutel(tenantId: string, uren = 24): Promise<{ sleutel: string; verlooptAt: string }> {
  const gebruiker = await zorgVpnGebruiker(tenantId);
  const verlooptAt = new Date(Date.now() + Math.max(1, Math.min(uren, 24 * 30)) * 3_600_000).toISOString();
  const r = await hs<{ preAuthKey?: { key?: string; expiration?: string } }>("POST", "/preauthkey", {
    user: gebruiker.id,
    reusable: false,
    ephemeral: false,
    expiration: verlooptAt,
  });
  const sleutel = r.preAuthKey?.key;
  if (!sleutel) throw AppError.upstream("De VPN-server gaf geen toegangscode terug.");
  return { sleutel, verlooptAt: r.preAuthKey?.expiration ?? verlooptAt };
}

export interface HsNode {
  id: string;
  name?: string;
  givenName?: string;
  online?: boolean;
  lastSeen?: string;
  ipAddresses?: string[];
  /** van wie het apparaat is; headscale geeft hier een object terug */
  user?: { id?: string | number; name?: string } | null;
}

/** Hoort dit apparaat bij deze VPN-gebruiker? Op naam of op id, wat er is. */
export function hoortBij(node: HsNode, gebruiker: { id: string; name: string }): boolean {
  const u = node.user;
  if (!u) return false;
  if (typeof u.name === "string" && u.name === gebruiker.name) return true;
  return u.id !== undefined && String(u.id) === String(gebruiker.id);
}

/** De apparaten van dit bedrijf op de VPN-server. Niet gekoppeld, nog geen gebruiker of storing: leeg. */
export async function vpnApparaten(tenantId: string): Promise<VpnApparaat[]> {
  if (!vpnGekoppeld()) return [];
  try {
    const naam = vpnGebruikersnaam(tenantId);
    const lijst = await hs<{ users?: HsUser[] }>("GET", `/user?name=${encodeURIComponent(naam)}`);
    const gebruiker = lijst.users?.find((u) => u.name === naam);
    if (!gebruiker) return [];
    // Alle apparaten opvragen en zelf filteren. `/node?user=<id>` gaf op onze
    // Headscale-versie een 500 (6 nov, vier keer in het foutenlogboek) terwijl
    // `/node` zonder filter gewoon werkt; zo zijn we niet afhankelijk van hoe
    // een versie dat filter uitlegt.
    const r = await hs<{ nodes?: HsNode[] }>("GET", "/node");
    return (r.nodes ?? [])
      .filter((n) => hoortBij(n, gebruiker))
      .map((n) => ({
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
