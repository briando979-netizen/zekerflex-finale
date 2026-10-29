import type { HostingConfig } from "@/lib/hosting/config";
import { desiredRecords, emptyResult, reconcile, txtFamily, type ApplyResult, type DesiredRecord } from "./plan";

// Hetzner DNS-adapter (EU, soeverein-vriendelijk): gewone fetch, token-header auth.
// Per-record model met relatieve namen ("@" = apex) en de MX-priority inline in de
// waarde — toont dat de reconcile-kern providerneutraal is. Let op: Hetzner pagineert
// records (max per_page 100); voor zeer grote zones zou je moeten doorpagineren.

const API = "https://dns.hetzner.com/api/v1";

interface HzRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  ttl?: number;
}
interface HzWrite {
  zone_id: string;
  type: string;
  name: string;
  value: string;
  ttl: number;
}

async function hz<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Auth-API-Token": token, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = json.error as { message?: string } | undefined;
      throw new Error(err?.message || (json.message as string) || `HTTP ${res.status}`);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

const unquote = (s: string) => s.trim().replace(/^"([\s\S]*)"$/, "$1");

function hzWrite(zoneId: string, d: DesiredRecord): HzWrite {
  const value = d.type === "TXT" ? unquote(d.value) : d.type === "CNAME" || d.type === "NS" ? d.value.replace(/\.$/, "") : d.value;
  return { zone_id: zoneId, type: d.type, name: d.name || "@", value, ttl: d.ttl };
}

export async function applyDnsToHetzner(cfg: HostingConfig, domain: string): Promise<ApplyResult> {
  const token = cfg.api.token.trim();
  if (!token) throw new Error("Geen Hetzner DNS API-token ingesteld.");

  const zoneResp = await hz<{ zones?: { id: string; name: string }[] }>(token, `/zones?name=${encodeURIComponent(domain)}`);
  const zone = (zoneResp.zones ?? [])[0];
  if (!zone) throw new Error(`Geen Hetzner-zone gevonden voor ${domain}. Staat het domein in dit account en klopt het token?`);

  const recResp = await hz<{ records?: HzRecord[] }>(token, `/records?zone_id=${zone.id}&per_page=100`);
  const existing = recResp.records ?? [];

  return reconcile<HzRecord>(emptyResult("Hetzner DNS", zone.name), desiredRecords(cfg), existing, {
    findMatch: (d, ex) => {
      const name = (d.name || "@").toLowerCase();
      const same = ex.filter((e) => e.type === d.type && e.name.toLowerCase() === name);
      if (same.length === 0) return undefined;
      if (d.type === "TXT") {
        const fam = txtFamily(d.value);
        return fam ? same.find((e) => txtFamily(e.value) === fam) : same.find((e) => unquote(e.value) === unquote(d.value));
      }
      return same[0];
    },
    isUnchanged: (d, m) => {
      const w = hzWrite(zone.id, d);
      return unquote(m.value) === unquote(w.value) && (m.ttl === undefined || m.ttl === w.ttl);
    },
    create: async (d) => {
      await hz(token, `/records`, { method: "POST", body: JSON.stringify(hzWrite(zone.id, d)) });
    },
    update: async (d, m) => {
      await hz(token, `/records/${m.id}`, { method: "PUT", body: JSON.stringify(hzWrite(zone.id, d)) });
    },
  });
}
