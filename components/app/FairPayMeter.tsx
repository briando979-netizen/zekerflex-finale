"use client";

// Visuele "fair-pay-meter": laat zien hoe het gekozen uurtarief zich verhoudt
// tot de markt-mediaan voor dit soort werk, en wat de ingeschatte kans is dat de
// dienst op tijd vol raakt. Alles komt uit lib/pricing/advice (echte eigen
// historie) — een eerlijke indicatie met bron, geen belofte.

function euro(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

// Kleur = betekenis (met legenda eronder): groen hoog, oranje matig, rood laag.
function tone(chance: number): { bar: string; text: string } {
  if (chance >= 0.8) return { bar: "bg-brand-500", text: "text-brand-700" };
  if (chance >= 0.5) return { bar: "bg-warn", text: "text-warn" };
  return { bar: "bg-crit", text: "text-crit" };
}

export function FairPayMeter({
  rateCents,
  marketRateCents,
  fillChance,
  suggestedRateCents,
  suggestedFillChance,
  sample,
  onApplySuggested,
}: {
  rateCents: number;
  marketRateCents: number;
  fillChance: number;
  suggestedRateCents: number;
  suggestedFillChance: number;
  sample: number;
  onApplySuggested: (cents: number) => void;
}) {
  const pct = Math.round(fillChance * 100);
  const t = tone(fillChance);
  const relPct = marketRateCents > 0 ? Math.round(((rateCents - marketRateCents) / marketRateCents) * 100) : 0;

  // schaal: 70%..140% van de markt-mediaan
  const lo = marketRateCents * 0.7;
  const hi = marketRateCents * 1.4;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const posRate = clamp((rateCents - lo) / (hi - lo)) * 100;
  const posMarket = clamp((marketRateCents - lo) / (hi - lo)) * 100;
  const posSuggested = clamp((suggestedRateCents - lo) / (hi - lo)) * 100;
  const canBump = suggestedRateCents > rateCents;

  return (
    <div className="rounded-xl border border-hair bg-paper-soft px-4 py-3.5 text-xs sm:col-span-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">📊 Fair-pay-meter</p>
        <span className={`text-sm font-bold ${t.text}`}>{pct}%</span>
      </div>
      <p className="mt-0.5 text-neutralx-500">kans dat deze dienst op tijd vol raakt</p>

      {/* fill-chance balk */}
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutralx-200">
        <div className={`h-full rounded-full ${t.bar} transition-all`} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>

      {/* tarief vs markt */}
      <div className="mt-4">
        <div className="relative h-7">
          {/* track */}
          <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-gradient-to-r from-crit/30 via-warn/30 to-brand-400/40" />
          {/* markt-mediaan */}
          <div className="absolute top-1 h-5 w-px bg-neutralx-500" style={{ left: `${posMarket}%` }}>
            <span className="absolute -top-4 -translate-x-1/2 whitespace-nowrap text-[10px] text-neutralx-500">markt</span>
          </div>
          {/* voorgesteld (schim) */}
          {canBump && (
            <div className="absolute top-2.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-brand-300 ring-2 ring-white" style={{ left: `${posSuggested}%` }} />
          )}
          {/* jouw tarief */}
          <div className="absolute top-1.5 h-4 w-4 -translate-x-1/2 rounded-full bg-brand-600 ring-2 ring-white shadow" style={{ left: `${posRate}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-neutralx-500">
          <span>Markt-mediaan {euro(marketRateCents)}/u</span>
          <span className="font-medium text-ink-soft">
            jij {euro(rateCents)}/u ({relPct >= 0 ? "+" : ""}{relPct}%)
          </span>
        </div>
      </div>

      {canBump && (
        <button
          type="button"
          onClick={() => onApplySuggested(suggestedRateCents)}
          className="mt-3 w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-center font-semibold text-brand-700 hover:bg-brand-100"
        >
          Verhoog naar {euro(suggestedRateCents)}/u → kans {Math.round(suggestedFillChance * 100)}%
        </button>
      )}

      <div className="mt-3 flex items-center gap-3 text-[10px] text-neutralx-400">
        <span className="flex items-center gap-1"><Dot className="bg-brand-500" /> hoog</span>
        <span className="flex items-center gap-1"><Dot className="bg-warn" /> matig</span>
        <span className="flex items-center gap-1"><Dot className="bg-crit" /> laag</span>
        <span className="ml-auto">indicatie o.b.v. {sample} diensten</span>
      </div>
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${className}`} />;
}
