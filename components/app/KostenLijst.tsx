import { CHATKNOP_VRIJ } from "@/lib/marketing/chatknop-vrij";

/**
 * De kostenregel van een klus: loon, platformkosten en het totaal excl. btw (bedragen uit lib/klusconcept/kosten-tekst.ts). Gedeeld
 * door /klus-plaatsen, de klus-wizard en "Snel een klus plaatsen" (23 nov 2026, schermcontrole van de live site):
 * - de eerste kolom neemt alle ruimte die over is (minmax(0,1fr)), zodat "Platformkosten, 7,5 uur" op een telefoon op één regel past;
 * - de scheidingslijn boven het totaal is één doorlopende lijn over beide kolommen (een rand op elke cel liet een gat in het midden);
 * - `chatknopVrij`: de chatknop rechtsonder valt niet over de bedragen (lib/marketing/chatknop-vrij.ts).
 * De totaalregel staat in een eigen div met dt en dd: dat mag in een dl en houdt de lijn heel.
 */
export function KostenLijst({
  loonLabel,
  platformLabel,
  totaalLabel,
  loon,
  platform,
  totaal,
  groot = false,
  chatknopVrij = false,
  className = "",
}: {
  loonLabel: string;
  platformLabel: string;
  totaalLabel: string;
  loon: string;
  platform: string;
  totaal: string;
  /** een groter totaal (text-xl in plaats van text-lg) */
  groot?: boolean;
  chatknopVrij?: boolean;
  className?: string;
}) {
  const vrij: Record<string, string> = chatknopVrij ? { [CHATKNOP_VRIJ]: "" } : {};
  return (
    <dl {...vrij} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm ${className}`}>
      <dt className="text-neutralx-600">{loonLabel}</dt>
      <dd className="num text-right font-semibold text-ink">{loon}</dd>
      <dt className="text-neutralx-600">{platformLabel}</dt>
      <dd className="num text-right font-semibold text-ink">{platform}</dd>
      <div className="col-span-2 flex items-baseline justify-between gap-4 border-t border-hair pt-2">
        <dt className="font-semibold text-ink">{totaalLabel}</dt>
        <dd className={`num text-right font-display font-bold text-ink ${groot ? "text-xl" : "text-lg"}`}>{totaal}</dd>
      </div>
    </dl>
  );
}
