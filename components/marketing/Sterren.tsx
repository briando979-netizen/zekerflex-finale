import { sterVulling } from "@/lib/shop/beoordeling";

// Vijf sterren, ook half gevuld (4,3 → vier vol en een derde): voor de kaartjes, de productpagina en de beoordelingen
// (lib/shop/beoordeling.ts). Neutraal van kleur: goud is geld, groen is doen (Kleuren in AGENTS.md).

const PAD = "M12 2.6l2.85 5.95 6.55.85-4.8 4.55 1.2 6.5L12 17.3l-5.8 3.15 1.2-6.5-4.8-4.55 6.55-.85z";

function Ster({ grootte, className }: { grootte: number; className: string }) {
  return (
    <svg width={grootte} height={grootte} viewBox="0 0 24 24" aria-hidden className={className}>
      <path d={PAD} fill="currentColor" />
    </svg>
  );
}

export function Sterren({ gemiddelde, label, grootte = 14 }: { gemiddelde: number; label: string; grootte?: number }) {
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 items-center gap-px align-middle">
      {sterVulling(gemiddelde).map((v, i) => (
        <span key={i} className="relative inline-block" style={{ width: grootte, height: grootte }}>
          <Ster grootte={grootte} className="absolute inset-0 text-neutralx-300" />
          {v > 0 && (
            <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.round(v * 100)}%` }}>
              <Ster grootte={grootte} className="text-ink" />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
