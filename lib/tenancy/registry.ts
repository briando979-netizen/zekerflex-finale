import { kvGet, kvSet } from "@/lib/storage/kv";
import { matchTenantHost, type TenantHostEntry } from "./resolve";

// KV-register van host -> tenant + branding. Geen DB-migratie; runtime instelbaar
// vanuit Admin -> Klanten (tenants).
const KEY = "tenancy:hosts";
const MAX = 1000;

export async function listTenantHosts(): Promise<TenantHostEntry[]> {
  try {
    const v = await kvGet<TenantHostEntry[]>(KEY);
    if (Array.isArray(v)) return v;
  } catch {
    /* leeg */
  }
  return [];
}

export async function saveTenantHosts(entries: TenantHostEntry[]): Promise<void> {
  await kvSet(KEY, entries.slice(0, MAX));
}

export async function resolveByHost(host: string): Promise<TenantHostEntry | null> {
  return matchTenantHost(host, await listTenantHosts());
}
