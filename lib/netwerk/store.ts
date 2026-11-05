import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { AppError } from "@/lib/errors";
import { hasRole, type Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { amsterdamStartOfDay } from "@/lib/time/amsterdam";
import { LEGE_STAND, leesbareCode, moduleActief, type ModuleSleutel, type ModuleStand, type NetwerkStand } from "@/lib/netwerk/modules";

// ---------------------------------------------------------------------------
// Wat een bedrijf aan netwerkpakketten heeft en hoe de wifi is ingericht.
// Alles in de KV (geen migratie):
//   netwerk:<tenantId>          de stand per pakket (lib/netwerk/modules.ts)
//   netwerk-wifi:<tenantId>     per vestiging: IP, netwerknaam en het RADIUS-geheim
//   netwerk-wifi-ip:<ip>        welk bedrijf/vestiging bij een IP hoort (voor de RADIUS-server)
//   netwerk-wifi-ww:<userId>    het eigen wifi-wachtwoord van een gebruiker (versleuteld;
//                               staat in ERASABLE_KV_PREFIXES, lib/privacy/user-kv.ts)
//   netwerk-vpn:<tenantId>      wie wanneer een VPN-toegangscode kreeg (nooit de code zelf)
// ---------------------------------------------------------------------------

const STAND = (t: string) => `netwerk:${t}`;
const WIFI = (t: string) => `netwerk-wifi:${t}`;
const WIFI_IP = (ip: string) => `netwerk-wifi-ip:${ip}`;
const WIFI_WW = (u: string) => `netwerk-wifi-ww:${u}`;
const VPN = (t: string) => `netwerk-vpn:${t}`;
const WIFI_DOEL = "netwerk-wifi";

/** Het bedrijf waarvoor deze persoon de netwerkpakketten beheert. */
export async function netwerkTenantOf(p: Principal): Promise<string> {
  const grant = p.grants.find((g) => g.role === "HQ_ADMIN");
  if (grant) return grant.organizationId;
  if (hasRole(p, "PLATFORM_ADMIN")) {
    const own = (await resolveEmployerScope(p)).tenantIds[0];
    if (own) return own;
  }
  throw AppError.forbidden("Alleen de beheerder van een bedrijf kan de netwerkpakketten beheren.");
}

// --- stand per pakket ------------------------------------------------------------

export async function netwerkStand(tenantId: string): Promise<NetwerkStand> {
  const s = await kvGet<NetwerkStand>(STAND(tenantId));
  return s && typeof s === "object" && s.modules ? s : { ...LEGE_STAND, modules: {} };
}

export async function zetModuleStand(tenantId: string, sleutel: ModuleSleutel, stand: ModuleStand): Promise<NetwerkStand> {
  const huidig = await netwerkStand(tenantId);
  const nieuw: NetwerkStand = { modules: { ...huidig.modules, [sleutel]: stand }, updatedAt: new Date().toISOString() };
  await kvSet(STAND(tenantId), nieuw);
  return nieuw;
}

/** Alle bedrijven met een stand (voor het beheer). */
export async function alleStanden(): Promise<{ tenantId: string; stand: NetwerkStand }[]> {
  const rijen = await kvListEntries<NetwerkStand>("netwerk:", 5000);
  return rijen
    .filter((r) => r.value && typeof r.value === "object" && r.value.modules)
    .map((r) => ({ tenantId: r.key.slice("netwerk:".length), stand: r.value }));
}

/** Het bedrijf waarvan een Stripe-abonnement is. */
export async function standMetAbonnement(stripeSubId: string): Promise<{ tenantId: string; sleutel: ModuleSleutel; stand: ModuleStand } | null> {
  for (const { tenantId, stand } of await alleStanden()) {
    for (const [sleutel, m] of Object.entries(stand.modules) as [ModuleSleutel, ModuleStand][]) {
      if (m.stripeSubId === stripeSubId) return { tenantId, sleutel, stand: m };
    }
  }
  return null;
}

// --- wifi per vestiging -------------------------------------------------------------

export interface WifiVestiging {
  /** het vaste, publieke IP-adres van de router of accesspoints van die vestiging */
  ip: string;
  /** de netwerknaam die medewerkers zien */
  ssid: string;
  /** het gedeelde geheim tussen de wifi-apparatuur en onze RADIUS-server (versleuteld) */
  secretSealed: string;
  aan: boolean;
  sinds: string;
}

export interface WifiInstellingen {
  vestigingen: Record<string, WifiVestiging>;
}

export interface WifiVestigingWeergave {
  branchId: string;
  ip: string;
  ssid: string;
  secret: string;
  aan: boolean;
  sinds: string;
}

export async function wifiInstellingen(tenantId: string): Promise<WifiInstellingen> {
  const w = await kvGet<WifiInstellingen>(WIFI(tenantId));
  return w && typeof w === "object" && w.vestigingen ? w : { vestigingen: {} };
}

export const wifiSecret = (v: WifiVestiging): string => openSecret(v.secretSealed, WIFI_DOEL);

export function weergave(branchId: string, v: WifiVestiging): WifiVestigingWeergave {
  return { branchId, ip: v.ip, ssid: v.ssid, secret: wifiSecret(v), aan: v.aan, sinds: v.sinds };
}

function schoonIp(raw: string): string {
  const ip = raw.trim();
  if (!isIP(ip)) throw AppError.validation("Vul een geldig IP-adres in, bijvoorbeeld 83.12.45.67 (het vaste adres van jullie internetverbinding).");
  return ip;
}

function schoonSsid(raw: string): string {
  const s = raw.trim();
  if (s.length < 1 || s.length > 32) throw AppError.validation("De netwerknaam (SSID) is 1 tot 32 tekens.");
  return s;
}

/**
 * Zet of wijzigt de wifi van een vestiging. Het geheim blijft bij een wijziging
 * gelijk (anders moet de klant zijn apparatuur opnieuw instellen); een nieuw
 * IP-adres verhuist de koppeling. Twee vestigingen (ook van verschillende
 * bedrijven) kunnen niet hetzelfde IP-adres hebben.
 */
export async function zetWifiVestiging(tenantId: string, branchId: string, input: { ip: string; ssid: string; aan: boolean }): Promise<WifiVestigingWeergave> {
  const ip = schoonIp(input.ip);
  const ssid = schoonSsid(input.ssid);
  const w = await wifiInstellingen(tenantId);
  const oud = w.vestigingen[branchId];
  const ander = await kvGet<{ tenantId: string; branchId: string }>(WIFI_IP(ip));
  if (ander && (ander.tenantId !== tenantId || ander.branchId !== branchId)) {
    throw AppError.conflict("Dit IP-adres is al gekoppeld aan een andere vestiging.");
  }
  const nieuw: WifiVestiging = {
    ip,
    ssid,
    secretSealed: oud?.secretSealed ?? sealSecret(randomBytes(24).toString("base64url"), WIFI_DOEL),
    aan: input.aan,
    sinds: oud?.sinds ?? new Date().toISOString(),
  };
  if (oud && oud.ip !== ip) await kvDelete(WIFI_IP(oud.ip));
  await kvSet(WIFI_IP(ip), { tenantId, branchId });
  await kvSet(WIFI(tenantId), { vestigingen: { ...w.vestigingen, [branchId]: nieuw } } satisfies WifiInstellingen);
  return weergave(branchId, nieuw);
}

export async function verwijderWifiVestiging(tenantId: string, branchId: string): Promise<void> {
  const w = await wifiInstellingen(tenantId);
  const oud = w.vestigingen[branchId];
  if (!oud) return;
  const rest = { ...w.vestigingen };
  delete rest[branchId];
  await kvDelete(WIFI_IP(oud.ip));
  await kvSet(WIFI(tenantId), { vestigingen: rest } satisfies WifiInstellingen);
}

/** Voor de RADIUS-server: welke vestiging (en welk geheim) hoort bij het IP waarvandaan een verzoek komt. */
export async function radiusClientVoorIp(raw: string): Promise<{ tenantId: string; branchId: string; secret: string; aan: boolean } | null> {
  const ip = raw.trim();
  if (!isIP(ip)) return null;
  const k = await kvGet<{ tenantId: string; branchId: string }>(WIFI_IP(ip));
  if (!k) return null;
  const v = (await wifiInstellingen(k.tenantId)).vestigingen[k.branchId];
  if (!v || v.ip !== ip) return null;
  return { tenantId: k.tenantId, branchId: k.branchId, secret: wifiSecret(v), aan: v.aan };
}

// --- het eigen wifi-wachtwoord van een gebruiker ------------------------------------

/** Het wifi-wachtwoord van deze gebruiker; de eerste keer maken we er een. Zelfde voor elk bedrijf. */
export async function wifiWachtwoord(userId: string): Promise<string> {
  const k = await kvGet<{ sealed: string; sinds: string }>(WIFI_WW(userId));
  if (k?.sealed) {
    try {
      return openSecret(k.sealed, WIFI_DOEL);
    } catch {
      /* onleesbaar (sleutel gewisseld): een nieuwe maken */
    }
  }
  const ww = leesbareCode(randomBytes(16));
  await kvSet(WIFI_WW(userId), { sealed: sealSecret(ww, WIFI_DOEL), sinds: new Date().toISOString() });
  return ww;
}

/** Een nieuw wachtwoord (bijvoorbeeld als het oude is uitgelekt). */
export async function nieuwWifiWachtwoord(userId: string): Promise<string> {
  await kvDelete(WIFI_WW(userId));
  return wifiWachtwoord(userId);
}

// --- vpn: wie kreeg een code -----------------------------------------------------------

export interface VpnSleutelLog {
  userId: string;
  naam: string;
  at: string;
  verlooptAt: string;
}

export async function vpnLog(tenantId: string): Promise<VpnSleutelLog[]> {
  const l = await kvGet<{ sleutels: VpnSleutelLog[] }>(VPN(tenantId));
  return Array.isArray(l?.sleutels) ? l.sleutels : [];
}

export async function noteerVpnSleutel(tenantId: string, item: VpnSleutelLog): Promise<void> {
  const l = await vpnLog(tenantId);
  await kvSet(VPN(tenantId), { sleutels: [item, ...l].slice(0, 200) });
}

// --- de klussen van vandaag met wifi (werker-app, Account → Wifi) ---------------------------

export interface WifiVandaag {
  bedrijf: string;
  vestiging: string;
  van: string;
  tot: string;
  /** de netwerknaam, als het bedrijf daar wifi via ZekerFlex heeft */
  ssid: string | null;
}

/** De klussen van vandaag (Nederlandse dag) van deze flexwerker, met per vestiging de wifi-netwerknaam. */
export async function wifiVandaagVoor(userId: string, nu = new Date()): Promise<WifiVandaag[]> {
  const profiel = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profiel) return [];
  const start = amsterdamStartOfDay(nu);
  const eind = amsterdamStartOfDay(nu, 1);
  const rijen = await prisma.shiftAssignment.findMany({
    where: { freelancerId: profiel.id, cancelledAt: null, shift: { status: { notIn: ["DRAFT", "CANCELLED"] }, endsAt: { gte: start }, startsAt: { lt: eind } } },
    select: { shift: { select: { startsAt: true, endsAt: true, branch: { select: { id: true, name: true, city: true, tenantId: true, tenant: { select: { name: true } } } } } } },
    orderBy: { shift: { startsAt: "asc" } },
    take: 20,
  });
  const perTenant = new Map<string, Promise<{ actief: boolean; wifi: WifiInstellingen }>>();
  const uit: WifiVandaag[] = [];
  for (const r of rijen) {
    const b = r.shift.branch;
    let p = perTenant.get(b.tenantId);
    if (!p) {
      p = Promise.all([netwerkStand(b.tenantId), wifiInstellingen(b.tenantId)]).then(([stand, wifi]) => ({ actief: moduleActief(stand, "wifi"), wifi }));
      perTenant.set(b.tenantId, p);
    }
    const { actief, wifi } = await p;
    const v = wifi.vestigingen[b.id];
    uit.push({ bedrijf: b.tenant.name, vestiging: `${b.name}, ${b.city}`, van: r.shift.startsAt.toISOString(), tot: r.shift.endsAt.toISOString(), ssid: actief && v?.aan ? v.ssid : null });
  }
  return uit;
}

// --- de vestigingen van het bedrijf (uit de database) -------------------------------------

export async function vestigingenVan(tenantId: string): Promise<{ id: string; naam: string; plaats: string }[]> {
  const rijen = await prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true, city: true }, orderBy: { createdAt: "asc" } });
  return rijen.map((b) => ({ id: b.id, naam: b.name, plaats: b.city }));
}
