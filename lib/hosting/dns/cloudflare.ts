import type { HostingConfig } from "@/lib/hosting/config";
import {
  desiredRecords,
  emptyResult,
  fqdn,
  parseMx,
  reconcile,
  txtFamily,
  type ApplyResult,
  type DesiredRecord,
} from "./plan";

// Cloudflare-adapter: gewone fetch naar de officiële API (geen SDK, lock-in-vrij).
// Per-record model (create/update op record-id) — past precies op de reconcile-runner.

const API = "https://api.cloudflare.com/client/v4";

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

function cfWrite(domain: string, d: DesiredRecord): CfWrite {
  const name = fqdn(domain, d.name);
  if (d.type === "MX") {
    const { priority, target } = parseMx(d.value);
    return { type: "MX", name, content: target, ttl: d.ttl, priority };
  }
  let content = d.value;
  if (d.type === "TXT") content = d.value.replace(/^"([\s\S]*)"$/, "$1");
  else if (d.type === "CNAME" || d.type === "NS") content = d.value.replace(/\.$/, "");
  const w: CfWrite = { type: d.type, name, content, ttl: d.ttl };
  // DNS-only (geen Cloudflare-proxy) voor voorspelbaar gedrag — cruciaal voor mail.
  if (d.type === "A" || d.type === "AAAA" || d.type === "CNAME") w.proxied = false;
  return w;
}

export async function applyDnsToCloudflare(cfg: HostingConfig, domain: string, opts: { dryRun?: boolean } = {}): Promise<ApplyResult> {
  const token = cfg.api.token.trim();
  if (!token) throw new Error("Geen Cloudflare API-token ingesteld.");

  const zones = await cf<{ id: string; name: string }[]>(token, `/zones?name=${encodeURIComponent(domain)}`);
  const zone = Array.isArray(zones) ? zones[0] : undefined;
  if (!zone) {
    throw new Error(`Geen Cloudflare-zone gevonden voor ${domain}. Staat het domein in dit account en mag het token Zone:Read + DNS:Edit?`);
  }

  const existing = (await cf<CfRecord[]>(token, `/zones/${zone.id}/dns_records?per_page=1000`)) ?? [];

  return reconcile<CfRecord>(
    emptyResult("Cloudflare", zone.name),
    desiredRecords(cfg),
    existing,
    {
    findMatch: (d, ex) => {
      const name = fqdn(domain, d.name).toLowerCase();
      const same = ex.filter((e) => e.type === d.type && e.name.toLowerCase() === name);
      if (same.length === 0) return undefined;
      if (d.type === "TXT") {
        const fam = txtFamily(cfWrite(domain, d).content);
        return fam ? same.find((e) => txtFamily(e.content) === fam) : same.find((e) => e.content.trim() === cfWrite(domain, d).content.trim());
      }
      if (d.type === "MX") {
        const { target } = parseMx(d.value);
        return same.find((e) => e.content.toLowerCase() === target.toLowerCase());
      }
      return same[0];
    },
    isUnchanged: (d, m) => {
      const w = cfWrite(domain, d);
      return m.content.trim() === w.content.trim() && m.ttl === w.ttl && (w.priority === undefined || m.priority === w.priority);
    },
    create: async (d) => {
      await cf(token, `/zones/${zone.id}/dns_records`, { method: "POST", body: JSON.stringify(cfWrite(domain, d)) });
    },
    update: async (d, m) => {
      await cf(token, `/zones/${zone.id}/dns_records/${m.id}`, { method: "PUT", body: JSON.stringify(cfWrite(domain, d)) });
    },
    },
    opts,
  );
}
