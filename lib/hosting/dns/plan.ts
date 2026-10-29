import type { HostingConfig } from "@/lib/hosting/config";
import { buildBimiRecord } from "@/lib/hosting/bimi";

// ---------------------------------------------------------------------------
// Provider-agnostische kern voor DNS auto-apply. Elke provider (Cloudflare,
// Hetzner, …) is een kleine adapter; dit bestand levert het gedeelde deel:
//   - desiredRecords(): de records die we WILLEN (uit de config + BIMI),
//     in een neutrale vorm (naam relatief, "@" = apex);
//   - helpers voor naam/MX/TXT die providers nodig hebben om te formatteren;
//   - reconcile(): de NIET-DESTRUCTIEVE upsert-lus. reconcile kan per ontwerp
//     alleen aanmaken of bijwerken — er is geen delete-pad, dus geen enkele
//     provider kan via deze kern records verwijderen.
// ---------------------------------------------------------------------------

export interface DesiredRecord {
  type: string; // uppercase: A, AAAA, CNAME, MX, TXT, NS, …
  name: string; // relatief: "@" = apex, "www", "default._bimi"
  value: string; // ruwe waarde zoals ingevoerd (bv. "10 mail.host." of "v=spf1 …")
  ttl: number; // seconden (>= 60), anders 3600
  label: string; // voor rapportage, bv. "TXT default._bimi"
}

export interface ApplyResult {
  provider: string;
  zone: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  errors: string[];
}

export function emptyResult(provider: string, zone: string): ApplyResult {
  return { provider, zone, created: [], updated: [], unchanged: [], errors: [] };
}

// De gewenste records uit de opgeslagen config, plus het BIMI-record als er een
// logo is ingesteld en het nog niet handmatig in de records staat.
export function desiredRecords(cfg: HostingConfig): DesiredRecord[] {
  const out: DesiredRecord[] = [];
  const push = (type: string, name: string, value: string, ttlStr: string) => {
    const t = type.trim().toUpperCase();
    const n = name.trim() || "@";
    const v = value.trim();
    if (!t || !v) return;
    const ttlNum = Number.parseInt(ttlStr.trim(), 10);
    const ttl = Number.isFinite(ttlNum) && ttlNum >= 60 ? ttlNum : 3600;
    out.push({ type: t, name: n, value: v, ttl, label: `${t} ${n}` });
  };
  for (const r of cfg.dns.records) push(r.type, r.name, r.value, r.ttl);
  const bimi = buildBimiRecord(cfg);
  if (bimi) {
    const present = out.some((d) => d.type === "TXT" && d.name.toLowerCase() === bimi.name.toLowerCase());
    if (!present) push("TXT", bimi.name, bimi.value, "3600");
  }
  return out;
}

// Volledige recordnaam: "@"/leeg → de zone-apex, anders de naam onder het domein.
export function fqdn(domain: string, name: string): string {
  const n = (name || "").trim();
  if (!n || n === "@") return domain;
  const bare = n.replace(/\.$/, "");
  return bare === domain || bare.endsWith(`.${domain}`) ? bare : `${bare}.${domain}`;
}

export function parseMx(value: string): { priority: number; target: string } {
  const parts = value.trim().split(/\s+/);
  const prio = Number.parseInt(parts[0] ?? "", 10);
  const target = (parts.slice(1).join(" ") || value).replace(/\.$/, "");
  return { priority: Number.isFinite(prio) ? prio : 10, target };
}

// "v=spf1" / "v=dmarc1" / "v=bimi1" / "v=dkim1" → familie om gelijknamige TXT's
// uit elkaar te houden (zodat we een SPF niet over een verificatie-TXT zetten).
export function txtFamily(content: string): string | null {
  const m = /^"?(v=[a-z0-9]+)/i.exec(content.trim());
  return m ? (m[1] ?? "").toLowerCase() : null;
}

export interface Reconciler<E> {
  findMatch(desired: DesiredRecord, existing: E[]): E | undefined;
  isUnchanged(desired: DesiredRecord, match: E): boolean;
  create(desired: DesiredRecord): Promise<void>;
  update(desired: DesiredRecord, match: E): Promise<void>;
}

// Niet-destructieve upsert: per record aanmaken of bijwerken, nooit verwijderen.
// Fouten worden per record geïsoleerd zodat één mislukking de rest niet stopt.
export async function reconcile<E>(
  result: ApplyResult,
  desired: DesiredRecord[],
  existing: E[],
  r: Reconciler<E>,
): Promise<ApplyResult> {
  for (const d of desired) {
    try {
      const match = r.findMatch(d, existing);
      if (!match) {
        await r.create(d);
        result.created.push(d.label);
      } else if (r.isUnchanged(d, match)) {
        result.unchanged.push(d.label);
      } else {
        await r.update(d, match);
        result.updated.push(d.label);
      }
    } catch (e) {
      result.errors.push(`${d.label}: ${e instanceof Error ? e.message : "onbekende fout"}`);
    }
  }
  return result;
}
