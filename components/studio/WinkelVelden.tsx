import type { ReactNode } from "react";
import { input } from "@/components/studio/ui";

// ---------------------------------------------------------------------------
// Bouwstenen voor de instellingen van de webshop (Kortingen, Verzending,
// Betalen): de balk bovenaan die bewaart of verwerpt (zoals bij een product),
// een veld met label, uitleg en foutzin, en een invoer voor een bedrag.
// Zonder hooks: de schermen houden zelf de staat bij.
// ---------------------------------------------------------------------------

/** De zwarte balk bovenaan: "Niet-opgeslagen wijzigingen" of een fout, met Verwerpen en Opslaan. */
export function OpslaanBalk({ gewijzigd, fout, bezig, onOpslaan, onVerwerp }: { gewijzigd: boolean; fout: string | null; bezig: boolean; onOpslaan: () => void; onVerwerp: () => void }) {
  if (!gewijzigd && !fout) return null;
  return (
    <div className="sticky top-14 z-30 -mx-4 mb-4 flex flex-wrap items-center gap-3 bg-[#1a1a1a] px-4 py-2.5 text-white shadow-lg sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <p className="min-w-0 flex-1 text-sm font-semibold" role={fout ? "alert" : "status"}>
        {fout ?? "Niet-opgeslagen wijzigingen"}
      </p>
      {gewijzigd && (
        <button type="button" onClick={onVerwerp} disabled={bezig} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50">
          Verwerpen
        </button>
      )}
      <button type="button" disabled={bezig || !gewijzigd} onClick={onOpslaan} className="rounded-xl bg-white px-3.5 py-1.5 text-sm font-semibold text-[#1a1a1a] hover:bg-white/90 disabled:opacity-50">
        {bezig ? "Opslaan…" : "Opslaan"}
      </button>
    </div>
  );
}

/** Een veld: het label hoort bij de invoer met `id`; uitleg en foutzin staan eronder (aria-describedby: `${id}-uitleg`). */
export function Veld({ id, label, uitleg, fout, children, className = "" }: { id: string; label: string; uitleg?: string | undefined; fout?: string | undefined; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-[#303030]">
        {label}
      </label>
      {children}
      {fout ? (
        <p id={`${id}-uitleg`} role="alert" className="mt-1 text-xs font-semibold text-[#b42318]">
          {fout}
        </p>
      ) : uitleg ? (
        <p id={`${id}-uitleg`} className="mt-1 text-xs text-[#707070]">
          {uitleg}
        </p>
      ) : null}
    </div>
  );
}

/** Wat een invoer in een Veld meekrijgt: gekoppeld aan de uitleg, rood bij een fout. */
export const veldProps = (id: string, fout: string | undefined, uitleg = true) => ({
  id,
  "aria-invalid": fout ? true : undefined,
  ...(fout || uitleg ? { "aria-describedby": `${id}-uitleg` } : {}),
});

/** Een bedrag in euro's met het €-teken ervoor. */
export function EuroInvoer({ id, waarde, onWaarde, placeholder, fout, uitleg = true }: { id: string; waarde: string; onWaarde: (v: string) => void; placeholder: string; fout?: string | undefined; uitleg?: boolean }) {
  return (
    <span className="relative block">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#707070]">
        €
      </span>
      <input {...veldProps(id, fout, uitleg)} className={`${input} pl-7 ${fout ? "border-[#b42318]" : ""}`} inputMode="decimal" value={waarde} placeholder={placeholder} onChange={(e) => onWaarde(e.target.value)} />
    </span>
  );
}
