"use client";

import { getPricingOptions, type PurchaseMode } from "@/lib/shop/purchase-mode";

interface Props {
  basePriceCents: number;
  selected: PurchaseMode;
  onChange: (mode: PurchaseMode) => void;
}

export function PurchaseModeSelector({ basePriceCents, selected, onChange }: Props) {
  const options = getPricingOptions(basePriceCents);

  return (
    <div className="space-y-2 rounded-lg border p-4" style={{ borderColor: "var(--a-border)", background: "var(--a-elev)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        Kopen als
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {options.map((opt) => (
          <button
            key={opt.mode}
            type="button"
            onClick={() => onChange(opt.mode)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              selected === opt.mode
                ? "bg-blue-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={
              selected === opt.mode
                ? { background: "var(--a-act)" }
                : { borderColor: "var(--a-border)", color: "var(--a-text)" }
            }
          >
            <span className="block">{opt.label}</span>
            <span className="text-xs opacity-75">
              {opt.pricePerMonthCents ? `€ ${(opt.pricePerMonthCents / 100).toFixed(2)}/mnd` : `€ ${(opt.priceCents / 100).toFixed(2)}`}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        {selected === "subscription"
          ? "Je betaalt maandelijks, kan elk moment opzeggen."
          : "Eenmalige aankoop, geen verplichtingen."}
      </p>
    </div>
  );
}
