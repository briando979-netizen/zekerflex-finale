import { createHmac } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { recordAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Eigendomsbewijs voor de website-verhuizer. We kopiëren alleen een website
// waarvan de klant aantoont dat hij van hem is: een TXT-regel in de DNS van het
// domein (zekerflex-verify=<code>), of een platformbeheerder die het eigendom
// zelf heeft vastgesteld (geaudit). Het bewijs geldt alleen voor het domein
// waarop het gegeven is: verandert het domein, dan moet het opnieuw.
// ---------------------------------------------------------------------------

export interface SiteVerification {
  host: string;
  at: string;
  method: "dns" | "admin";
  by: string | null;
}

const KEY = (siteId: string) => `site-verify:${siteId}`;

/** "https://www.Bakkerij.nl/contact" → "www.bakkerij.nl"; null als het geen domein is. */
export function hostOf(domain: string | null | undefined): string | null {
  const s = (domain ?? "").trim().toLowerCase();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//.test(s) ? s : `https://${s}`);
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(u.hostname) ? u.hostname : null;
  } catch {
    return null;
  }
}

const apex = (host: string) => host.replace(/^www\./, "");

/** De code die de klant in zijn DNS zet. Afgeleid van het site-id, dus niets op te slaan. */
export function verificationCode(siteId: string): string {
  return createHmac("sha256", env.AUTH_SECRET ?? "dev-secret").update(`site-verify:${siteId}`).digest("hex").slice(0, 24);
}

export const verificationRecord = (siteId: string) => `zekerflex-verify=${verificationCode(siteId)}`;

export async function getVerification(siteId: string, domain: string | null): Promise<SiteVerification | null> {
  const host = hostOf(domain);
  if (!host) return null;
  const v = await kvGet<SiteVerification>(KEY(siteId)).catch(() => null);
  return v && apex(v.host) === apex(host) ? v : null;
}

/** Zoekt de TXT-regel op het domein zelf en op _zekerflex.<domein> (met en zonder www). */
export async function checkDnsVerification(siteId: string, domain: string | null, lookup = resolveTxt): Promise<{ ok: boolean; host: string | null }> {
  const host = hostOf(domain);
  if (!host) return { ok: false, host: null };
  const expected = verificationRecord(siteId);
  const names = [...new Set([apex(host), host, `_zekerflex.${apex(host)}`])];
  for (const name of names) {
    const records = await lookup(name).catch(() => [] as string[][]);
    if (records.some((chunks) => chunks.join("").trim() === expected)) {
      await kvSet(KEY(siteId), { host, at: new Date().toISOString(), method: "dns", by: null } satisfies SiteVerification);
      return { ok: true, host };
    }
  }
  return { ok: false, host };
}

/** Een platformbeheerder stelt het eigendom zelf vast (bijv. bij een bekende klant). */
export async function verifyByAdmin(siteId: string, domain: string | null, actorUserId: string): Promise<SiteVerification> {
  const host = hostOf(domain);
  if (!host) throw new Error("Deze klant heeft nog geen geldig domein ingevuld.");
  const v: SiteVerification = { host, at: new Date().toISOString(), method: "admin", by: actorUserId };
  await kvSet(KEY(siteId), v);
  await recordAudit({
    category: "SECURITY",
    action: "website.ownership.admin-verified",
    actorUserId,
    summary: `Eigendom van ${host} handmatig bevestigd voor de website-verhuizer`,
    targetType: "managedWebsite",
    targetId: siteId,
  });
  return v;
}
