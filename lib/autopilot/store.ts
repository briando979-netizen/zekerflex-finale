import { kvAppend, kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Autopilot state in the KeyValueStore: global settings, the live log, the
// "already done" ledger (so a reminder is sent once, not every run) and the
// per-organisation opt-ins that employers switch on themselves.
// ---------------------------------------------------------------------------

export interface AutopilotSettings {
  enabled: boolean;
  /** action keys the owner switched off */
  disabled: string[];
}

export interface LogEntry {
  at: string;
  action: string;
  ok: boolean;
  count: number;
  summary: string;
  details?: string[];
  trigger: "cron" | "handmatig";
}

export interface TenantAutopilot {
  /** approve submitted hours automatically when they match the schedule and show no fraud signals */
  autoApproveHours: boolean;
  /** the employer user who switched it on — approvals run with THEIR rights */
  byUserId: string | null;
  since: string | null;
}

const SETTINGS = "autopilot:settings";
const LOG = "autopilot:log";
const ledgerKey = (action: string) => `autopilot:done:${action}`;
const tenantKey = (tenantId: string) => `autopilot:tenant:${tenantId}`;
const LEDGER_DAYS = 21;

export async function getSettings(): Promise<AutopilotSettings> {
  return (await kvGet<AutopilotSettings>(SETTINGS).catch(() => null)) ?? { enabled: true, disabled: [] };
}

export async function saveSettings(s: AutopilotSettings): Promise<void> {
  await kvSet(SETTINGS, s);
}

export async function log(entry: LogEntry): Promise<void> {
  await kvAppend(LOG, entry, 500).catch(() => undefined);
}

export async function readLog(limit = 100): Promise<LogEntry[]> {
  const all = (await kvGet<LogEntry[]>(LOG).catch(() => null)) ?? [];
  return all.slice(-limit).reverse();
}

/** Which of these ids were already handled by this action (within the ledger window). */
export async function alreadyDone(action: string, ids: string[]): Promise<Set<string>> {
  const ledger = (await kvGet<Record<string, string>>(ledgerKey(action)).catch(() => null)) ?? {};
  return new Set(ids.filter((id) => ledger[id]));
}

export async function markDone(action: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const ledger = (await kvGet<Record<string, string>>(ledgerKey(action)).catch(() => null)) ?? {};
  const now = new Date();
  const cutoff = now.getTime() - LEDGER_DAYS * 86_400_000;
  const next: Record<string, string> = {};
  for (const [id, at] of Object.entries(ledger)) if (new Date(at).getTime() > cutoff) next[id] = at;
  for (const id of ids) next[id] = now.toISOString();
  await kvSet(ledgerKey(action), next);
}

export async function getTenantAutopilot(tenantId: string): Promise<TenantAutopilot> {
  return (await kvGet<TenantAutopilot>(tenantKey(tenantId)).catch(() => null)) ?? { autoApproveHours: false, byUserId: null, since: null };
}

export async function setTenantAutopilot(tenantId: string, v: TenantAutopilot): Promise<void> {
  await kvSet(tenantKey(tenantId), v);
  // index of opted-in tenants so the runner doesn't scan every organisation
  const idx = new Set((await kvGet<string[]>("autopilot:tenants").catch(() => null)) ?? []);
  if (v.autoApproveHours) idx.add(tenantId);
  else idx.delete(tenantId);
  await kvSet("autopilot:tenants", [...idx]);
}

export async function optedInTenants(): Promise<string[]> {
  return (await kvGet<string[]>("autopilot:tenants").catch(() => null)) ?? [];
}
