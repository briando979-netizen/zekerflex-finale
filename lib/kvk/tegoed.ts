// ---------------------------------------------------------------------------
// Het tegoed bij KVKBase (13 nov 2026). Gemeten: het gratis plan (10 vragen per minuut, 50 tokens per maand) was op, en elke
// KVK-controle faalde met 429 QUOTA_EXCEEDED. De app noemde dat "rate limit" en niemand zag het. KVKBase stuurt bij elk
// antwoord het tegoed mee (X-Tokens-Remaining) en de limiet per minuut (X-RateLimit-Limit); op 429 zegt de code wat er is:
// QUOTA_EXCEEDED (maandtegoed op) of RATE_LIMIT_EXCEEDED (te veel vragen deze minuut, met Retry-After).
// Puur: lezen, beslissen; het bewaren staat in lib/kvk/tegoed-opslag.ts.
// ---------------------------------------------------------------------------

export interface KvkTegoed {
  /** tokens over in deze periode (X-Tokens-Remaining); null = niet meegestuurd */
  tokens: number | null;
  /** vragen per minuut van het plan (X-RateLimit-Limit); 10 = het gratis plan */
  perMinuut: number | null;
  /** het maandtegoed is op (QUOTA_EXCEEDED) */
  op: boolean;
  /** wanneer gemeten (ISO) */
  at: string;
}

export type KvkLimiet = { soort: "tegoed" } | { soort: "minuut"; naSeconden: number };

const getal = (v: string | null): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

/** Wat dit antwoord zegt over het tegoed; null als er niets in staat (geen headers, geen tegoedfout). */
export function tegoedUitAntwoord(headers: Pick<Headers, "get">, code: string | null, nu: Date): KvkTegoed | null {
  const tokens = getal(headers.get("x-tokens-remaining"));
  const perMinuut = getal(headers.get("x-ratelimit-limit"));
  const op = code === "QUOTA_EXCEEDED" || code === "INSUFFICIENT_TOKENS";
  if (tokens === null && perMinuut === null && !op) return null;
  return { tokens: op ? 0 : tokens, perMinuut, op, at: nu.toISOString() };
}

/** De limiet uit een 429 (of 402): tegoed op, of te veel vragen per minuut (met het aantal seconden uit Retry-After). */
export function limietUitAntwoord(status: number, code: string | null, retryAfter: string | null): KvkLimiet | null {
  if (status === 402 || code === "QUOTA_EXCEEDED" || code === "INSUFFICIENT_TOKENS") return { soort: "tegoed" };
  if (status === 429) return { soort: "minuut", naSeconden: Math.max(1, Math.min(3600, getal(retryAfter) ?? 60)) };
  return null;
}

/** De limiet die een fout van de KVK-dienst draagt (details.kvkLimiet), of uit een oudere Engelse melding; null = geen limiet. */
export function kvkLimietVan(err: unknown): KvkLimiet | null {
  if (!(err instanceof Error)) return null;
  const d = (err as { details?: unknown }).details;
  if (d && typeof d === "object" && "kvkLimiet" in d) {
    const l = (d as { kvkLimiet?: unknown }).kvkLimiet;
    if (l && typeof l === "object" && "soort" in l) return l as KvkLimiet;
  }
  if (/token quota|quota exceeded|tegoed .*op/i.test(err.message)) return { soort: "tegoed" };
  if (/rate limit|te veel vragen/i.test(err.message)) return { soort: "minuut", naSeconden: 60 };
  return null;
}

/** Tokens die we bewaren voor de controles van werkers en werkgevers: achtergrondtaken gebruiken KVKBase alleen daarboven. */
export const KVK_RESERVE = 100;

/** Mag een achtergrondtaak (bronnen, sales) nog bij KVKBase? Alleen met een bekend tegoed boven de reserve plus wat hij nodig heeft. */
export function achtergrondMag(t: KvkTegoed | null, nodig: number): boolean {
  return Boolean(t && !t.op && t.tokens !== null && t.tokens - Math.max(0, nodig) >= KVK_RESERVE);
}

/** Bijna op: minder dan 10 tokens (of op). Dan een taak voor de eigenaar (lib/admin/owner-todos.ts). */
export function tegoedLaag(t: KvkTegoed | null): boolean {
  return Boolean(t && (t.op || (t.tokens !== null && t.tokens < 10)));
}

/** Wanneer een wachtende controle weer mag: bij een op tegoed de volgende dag om 06:00 UTC, bij de minuutlimiet na Retry-After. */
export function volgendePoging(l: KvkLimiet, nu: Date): Date {
  if (l.soort === "minuut") return new Date(nu.getTime() + l.naSeconden * 1000);
  return new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate() + 1, 6, 0, 0));
}

/** De regel voor Beheer → Alles gratis, bij de KVK-dienst (Amsterdamse tijd). */
export function tegoedTekst(t: KvkTegoed | null, wachtend: number, wanneer: (iso: string) => string): string {
  const wacht = wachtend > 0 ? ` ${wachtend} ${wachtend === 1 ? "controle wacht" : "controles wachten"} op een herkansing.` : "";
  if (!t) return `Tegoed bij KVKBase: nog niet gemeten (dat gebeurt bij de eerstvolgende controle).${wacht}`;
  const plan = t.perMinuut === 10 ? " Plan: gratis (10 vragen per minuut, 50 tokens per maand)." : t.perMinuut ? ` Plan: ${t.perMinuut} vragen per minuut.` : "";
  if (t.op) return `Tegoed bij KVKBase: op (gemeten ${wanneer(t.at)}).${plan}${wacht}`;
  return `Tegoed bij KVKBase: ${t.tokens ?? "onbekend"} tokens over (gemeten ${wanneer(t.at)}).${plan}${wacht}`;
}
