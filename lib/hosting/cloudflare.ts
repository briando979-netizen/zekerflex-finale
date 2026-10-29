import type { DnsRecord, HostingConfig } from "@/lib/hosting/config";
import { buildBimiRecord } from "@/lib/hosting/bimi";

// ---------------------------------------------------------------------------
// Cloudflare DNS auto-apply. Pusht de opgeslagen DNS-records (incl. het BIMI-
// record) naar de Cloudflare-zone via de officiële API — met een gewone fetch,
// geen SDK (lock-in-vrij; sluit aan op de soevereine lijn). NIET-destructief:
// records worden aangemaakt of bijgewerkt op basis van type+naam, nooit
// verwijderd — we raken dus nooit records aan die niet in onze config staan
// (bv. Google-verificatie-TXT's). Vereist een token met Zone:Read + DNS:Edit.
// ---------------------------------------------------------------------------

const API = "https://api.cloudflare.com/client/v4";

export interface ApplyResult {
  zone: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  errors: string[];
}

interface CfRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number;
}

interface CfWrite {
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  priority?: number;
}

interface CfEnvelope<T> {
  success: boolean;
  errors?: { message: string }[];
  result?: T;
}

async function cf<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = (await res.json().catch(() => ({}))) as CfEnvelope<T>;
    if (!res.ok || json.success === false) {
      const msg = (json.errors ?? []).map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

// Volledige recordnaam: "@"/leeg → de zone-apex, anders de naam onder het domein.
function fqdn(domain: string, name: string): string {
  const n = (name || "").trim();
  if (!n || n === "@") return domain;
  const bare = n.replace(/\.$/, "");
  if (bare === domain || bare.endsWith(`.${domain}`)) return bare;
  return `${bare}.${domain}`;
}

function toCfWrite(domain: string, r: DnsRecord): CfWrite {
  const type = r.type.trim().toUpperCase();
  const name = fqdn(domain, r.name);
  const ttlNum = Number.parseInt(r.ttl.trim(), 10);
  const ttl = Number.isFinite(ttlNum) && ttlNum >= 60 ? ttlNum : 3600;
  const value = r.value.trim();

  if (type === "MX") {
    const parts = value.split(/\s+/);
    const prio = Number.parseInt(parts[0] ?? "", 10);
    const target = (parts.slice(1).join(" ") || value).replace(/\.$/, "");
    return { type, name, content: target, ttl, priority: Number.isFinite(prio) ? prio : 10 };
  }

  let content = value;
  if (type === "TXT") content = value.replace(/^"([\s\S]*)"$/, "$1");
  else if (type === "CNAME" || type === "NS") content = value.replace(/\.$/, "");

  const base: CfWrite = { type, name, content, ttl };
  // DNS-only (geen Cloudflare-proxy) voor voorspelbaar gedrag — cruciaal voor mail.
  if (type === "A" || type === "AAAA" || type === "CNAME") base.proxied = false;
  return base;
}

// "v=spf1" / "v=DMARC1" / "v=BIMI1" / "v=DKIM1" → familie om gelijknamige TXT's
// uit elkaar te houden (zodat we een SPF niet over een Google-verificatie zetten).
function txtFamily(content: string): string | null {
  const m = /^(v=[a-z0-9]+)/i.exec(content.trim());
  return m ? (m[1] ?? "").toLowerCase() : null;
}

function findExisting(existing: CfRecord[], w: CfWrite): CfRecord | undefined {
  const sameTypeName = existing.filter((e) => e.type === w.type && e.name.toLowerCase() === w.name.toLowerCase());
  if (sameTypeName.length === 0) return undefined;
  if (w.type === "TXT") {
    const fam = txtFamily(w.content);
    if (fam) return sameTypeName.find((e) => txtFamily(e.content) === fam);
    return sameTypeName.find((e) => e.content.trim() === w.content.trim());
  }
  if (w.type === "MX") return sameTypeName.find((e) => e.content.toLowerCase() === w.content.toLowerCase());
  return sameTypeName[0];
}

export async function applyDnsToCloudflare(cfg: HostingConfig, domain: string): Promise<ApplyResult> {
  const token = cfg.api.token.trim();
  if (!token) throw new Error("Geen Cloudflare API-token ingesteld.");

  const zones = await cf<{ id: string; name: string }[]>(token, `/zones?name=${encodeURIComponent(domain)}`);
  const zone = Array.isArray(zones) ? zones[0] : undefined;
  if (!zone) {
    throw new Error(`Geen Cloudflare-zone gevonden voor ${domain}. Staat het domein in dit account en mag het token Zone:Read + DNS:Edit?`);
  }

  const existing = (await cf<CfRecord[]>(token, `/zones/${zone.id}/dns_records?per_page=1000`)) ?? [];

  const records: DnsRecord[] = [...cfg.dns.records];
  const bimi = buildBimiRecord(cfg);
  if (bimi) {
    const present = records.some(
      (r) => r.type.trim().toUpperCase() === "TXT" && r.name.trim().toLowerCase() === bimi.name.toLowerCase(),
    );
    if (!present) records.push({ type: "TXT", name: bimi.name, value: bimi.value, ttl: "3600" });
  }

  const result: ApplyResult = { zone: zone.name, created: [], updated: [], unchanged: [], errors: [] };

  for (const r of records) {
    if (!r.type.trim() || !r.value.trim()) continue;
    const w = toCfWrite(domain, r);
    const label = `${w.type} ${w.name}`;
    try {
      const found = findExisting(existing, w);
      if (!found) {
        await cf(token, `/zones/${zone.id}/dns_records`, { method: "POST", body: JSON.stringify(w) });
        result.created.push(label);
      } else if (
        found.content.trim() === w.content.trim() &&
        found.ttl === w.ttl &&
        (w.priority === undefined || found.priority === w.priority)
      ) {
        result.unchanged.push(label);
      } else {
        await cf(token, `/zones/${zone.id}/dns_records/${found.id}`, { method: "PUT", body: JSON.stringify(w) });
        result.updated.push(label);
      }
    } catch (e) {
      result.errors.push(`${label}: ${e instanceof Error ? e.message : "onbekende fout"}`);
    }
  }

  return result;
}
