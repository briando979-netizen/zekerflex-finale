import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Funnel event-tracking — waar haken mensen af? Soeverein, cookievrij: per
// funnel-stap een maand-teller in de KeyValueStore. Server-side ankers (bv.
// "aangemeld", "verificatie-klaar") loggen betrouwbaar; de client kan tussen-
// stappen (bv. "verificatie-foto-voorkant") posten via /api/analytics/funnel.
// Geen externe dienst (PostHog/Mixpanel), geen persoonsgegevens — enkel tellers.
// ---------------------------------------------------------------------------

export interface FunnelDef {
  key: string;
  label: string;
  steps: { key: string; label: string }[];
}

export const FUNNELS: FunnelDef[] = [
  {
    key: "onboarding-werknemer",
    label: "Werknemer-onboarding",
    steps: [
      { key: "aangemeld", label: "Account aangemaakt" },
      { key: "verificatie-gestart", label: "Verificatie gestart" },
      { key: "verificatie-foto", label: "Foto's gemaakt" },
      { key: "verificatie-klaar", label: "Geverifieerd" },
      { key: "eerste-reactie", label: "Eerste reactie op klus" },
    ],
  },
  {
    key: "onboarding-opdrachtgever",
    label: "Opdrachtgever-onboarding",
    steps: [
      { key: "aangemeld", label: "Account aangemaakt" },
      { key: "bedrijf-ingevuld", label: "Bedrijfsgegevens ingevuld" },
      { key: "eerste-klus", label: "Eerste klus uitgezet" },
      { key: "eerste-match", label: "Eerste match" },
    ],
  },
];

const stepKeys = new Map(FUNNELS.map((f) => [f.key, new Set(f.steps.map((s) => s.key))]));

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const counterKey = (funnel: string, step: string, month: string) => `funnel:${funnel}:${step}:${month}`;

/** Count one occurrence of a funnel step. Unknown funnel/step is ignored. Never throws. */
export async function recordFunnel(funnel: string, step: string, when = new Date()): Promise<void> {
  if (!stepKeys.get(funnel)?.has(step)) return;
  const key = counterKey(funnel, step, monthKey(when));
  try {
    const cur = (await kvGet<number>(key)) ?? 0;
    await kvSet(key, cur + 1);
  } catch {
    /* best effort */
  }
}

export interface FunnelReportStep {
  key: string;
  label: string;
  count: number;
  /** conversion from the previous step, 0..1 (1 for the first step) */
  conversion: number;
  /** drop-off from the previous step, 0..1 */
  dropoff: number;
}

export interface FunnelReport {
  key: string;
  label: string;
  month: string;
  steps: FunnelReportStep[];
}

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))));
  }
  return out;
}

export async function funnelReport(funnelKey: string, months = 1): Promise<FunnelReport | null> {
  const def = FUNNELS.find((f) => f.key === funnelKey);
  if (!def) return null;
  const buckets = lastMonths(months);
  const steps: FunnelReportStep[] = [];
  let prev = 0;
  for (let i = 0; i < def.steps.length; i++) {
    const s = def.steps[i]!;
    let count = 0;
    for (const m of buckets) count += (await kvGet<number>(counterKey(funnelKey, s.key, m)).catch(() => 0)) ?? 0;
    const conversion = i === 0 ? 1 : prev > 0 ? Math.min(1, count / prev) : 0;
    steps.push({ key: s.key, label: s.label, count, conversion: Math.round(conversion * 100) / 100, dropoff: Math.round((1 - conversion) * 100) / 100 });
    prev = count;
  }
  return { key: def.key, label: def.label, month: months === 1 ? buckets[0]! : `${buckets[buckets.length - 1]}…${buckets[0]}`, steps };
}

export async function allFunnelReports(months = 1): Promise<FunnelReport[]> {
  const out: FunnelReport[] = [];
  for (const f of FUNNELS) {
    const r = await funnelReport(f.key, months);
    if (r) out.push(r);
  }
  return out;
}
