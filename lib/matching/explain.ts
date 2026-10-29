// ---------------------------------------------------------------------------
// Match-uitleg: zet de opgeslagen score + scoreBreakdown van een ShiftMatch om
// in leesbare redenen ("waarom past deze kandidaat?"). De breakdown komt als
// JSON uit de DB, dus alles wordt defensief gelezen — nooit gooien. Zuiver →
// makkelijk te testen. De scoring zelf zit in lib/matching/score.ts; dit legt
// alleen uit wat daar al berekend is.
// ---------------------------------------------------------------------------

export type ReasonStrength = "goed" | "ok" | "zwak";

export interface MatchReason {
  label: string;
  strength: ReasonStrength;
  detail: string;
}

export interface MatchExplanation {
  scorePct: number;
  verdict: string;
  reasons: MatchReason[];
}

export interface ExplainMatchInput {
  score: number;
  travelMinutes: number;
  distanceMeters?: number | null;
  withinGeofence?: boolean | null;
  breakdown?: unknown; // het opgeslagen scoreBreakdown-JSON
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function band(x: number): ReasonStrength {
  return x >= 0.75 ? "goed" : x >= 0.45 ? "ok" : "zwak";
}

function translatePenalty(p: string): string {
  if (/travel estimated/i.test(p)) return "reistijd is geschat (routekaart tijdelijk niet beschikbaar)";
  return p;
}

export function explainMatch(input: ExplainMatchInput): MatchExplanation {
  const scorePct = Math.round(clamp01(input.score) * 100);
  const reasons: MatchReason[] = [];
  const b = (input.breakdown ?? {}) as Record<string, unknown>;

  const reliability = num(b.reliability);
  if (reliability !== null) {
    reasons.push({ label: "Betrouwbaarheid", strength: band(reliability), detail: `${Math.round(reliability * 100)}% op basis van eerdere diensten` });
  }

  const skill = num(b.skill);
  if (skill !== null) {
    reasons.push({
      label: "Vaardigheid",
      strength: band(skill),
      detail: skill >= 0.75 ? "ruim voldoende voor deze klus" : skill >= 0.45 ? "voldoende voor deze klus" : "net aan voor deze klus",
    });
  }

  const km = input.distanceMeters != null && Number.isFinite(input.distanceMeters) ? Math.round(input.distanceMeters / 100) / 10 : null;
  const travelComp = num(b.travel);
  reasons.push({
    label: "Reistijd",
    strength: travelComp !== null ? band(travelComp) : input.travelMinutes <= 20 ? "goed" : input.travelMinutes <= 40 ? "ok" : "zwak",
    detail: `${input.travelMinutes} min${km !== null ? ` · ${km} km` : ""}${input.withinGeofence ? " · in de buurt" : ""}`,
  });

  const badge = num(b.badge);
  if (badge !== null && badge > 0) {
    reasons.push({ label: "Badge-bonus", strength: "goed", detail: "extra punten voor een aangetoond keurmerk" });
  }

  const penalties = Array.isArray(b.penalties) ? (b.penalties as unknown[]).filter((p): p is string => typeof p === "string") : [];
  for (const p of penalties) {
    reasons.push({ label: "Let op", strength: "zwak", detail: translatePenalty(p) });
  }

  const verdict = scorePct >= 75 ? "Sterke match" : scorePct >= 50 ? "Goede match" : scorePct >= 30 ? "Redelijke match" : "Zwakke match";
  return { scorePct, verdict, reasons };
}
