import { kvGet, kvSet } from "@/lib/storage/kv";

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  type: "error_count" | "slow_query" | "disk_space";
  threshold: number;
  window_minutes: number;
  created_at: string;
}

const KEY = "alert-rules";

export async function listRules(): Promise<AlertRule[]> {
  return (await kvGet<AlertRule[]>(KEY)) ?? [];
}

export async function addRule(rule: Omit<AlertRule, "id" | "created_at">): Promise<AlertRule> {
  const rules = await listRules();
  const newRule: AlertRule = { ...rule, id: "rule-" + Date.now(), created_at: new Date().toISOString() };
  rules.push(newRule);
  await kvSet(KEY, rules);
  return newRule;
}

export async function toggleRule(id: string): Promise<void> {
  const rules = await listRules();
  const rule = rules.find((r) => r.id === id);
  if (rule) {
    rule.enabled = !rule.enabled;
    await kvSet(KEY, rules);
  }
}

export async function deleteRule(id: string): Promise<void> {
  const rules = await listRules();
  await kvSet(KEY, rules.filter((r) => r.id !== id));
}
