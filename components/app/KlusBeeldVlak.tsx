import type { ReactNode } from "react";
import { accentMetAlpha, vlakAchtergrond } from "@/lib/shifts/beeld-vlak";

/**
 * Het beeld bovenaan een klus in een voorbeeld (de klus-wizard van de werkgever en /klus-plaatsen): een rustig vlak met de kleur
 * van de branche en een kleine kleurstip, zonder foto's van mensen (23 nov 2026, eigenaar). De kleuren komen uit
 * lib/shifts/category.ts, dezelfde als de stip in de functiekiezer. Alleen voor voorbeelden: de echte kaarten in de werker-app
 * (ShiftCard) en de openbare pagina's houden hun foto. De ouder is `relative` en geeft de verhouding (bijv. aspect-[16/9]); dit
 * vlak vult hem (absolute inset-0).
 * `klein`: alleen een stip in het midden, voor een miniatuur.
 */
export function KlusBeeldVlak({ accent, label, klein = false, children }: { accent: string; label: string; klein?: boolean; children?: ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-paper-soft" style={{ backgroundImage: vlakAchtergrond(accent) }}>
      <span aria-hidden className="absolute -bottom-10 -right-8 h-36 w-36 rounded-full" style={{ background: accentMetAlpha(accent, 0.1) }} />
      {klein ? <span aria-hidden className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: accent }} /> : <BrancheEtiket accent={accent} label={label} />}
      {children}
    </div>
  );
}

/** Het etiket met de branche linksboven op het beeld: een witte pil met de kleurstip van de branche (geen gekleurde pil op een foto meer). */
export function BrancheEtiket({ accent, label }: { accent: string; label: string }) {
  return (
    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-hair bg-white px-2 py-1 text-[11px] font-semibold text-ink">
      <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: accent }} />
      {label}
    </span>
  );
}
