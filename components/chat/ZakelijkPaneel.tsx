"use client";

import Link from "next/link";
import { Portal } from "./Portal";
import { useChatTeksten } from "./ChatTekstenContext";
import { labelKlasse, labelsMetVoorstellen } from "@/lib/chat/zakelijk";

// Zakelijke tools (15 nov 2026), zoals in WhatsApp Business: één plek voor wat een bedrijf in de chat nodig heeft. Het
// bedrijfsprofiel (wat werkers zien), snelle antwoorden en het afwezigheidsbericht (de bestaande chatinstellingen),
// labels met hun aantal (tikken = filteren) en een klein overzicht. Alleen in de zakelijke weergave (lib/chat/zakelijk.ts).

export function ZakelijkPaneel({
  bedrijfsnaam,
  gesprekken,
  lijsten,
  onInstellingen,
  onZoZienWerkers,
  onFilter,
  onSluit,
}: {
  bedrijfsnaam: string;
  gesprekken: { lists?: string[]; unread: number; gemarkeerd?: boolean }[];
  lijsten: string[];
  /** de chatinstellingen openen (snelle antwoorden, afwezigheidsbericht) */
  onInstellingen: () => void;
  onZoZienWerkers?: () => void;
  /** filteren op een label */
  onFilter: (label: string) => void;
  onSluit: () => void;
}) {
  const ib = useChatTeksten().inbox;
  const voorgesteld = ib.zakelijkeLabels;
  const labels = labelsMetVoorstellen(lijsten, voorgesteld);
  const aantal = (l: string) => gesprekken.filter((g) => g.lists?.includes(l)).length;
  const ongelezen = gesprekken.filter((g) => g.unread > 0 || g.gemarkeerd).length;
  const metLabel = gesprekken.filter((g) => (g.lists?.length ?? 0) > 0).length;
  const sectie = "px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-neutralx-500";
  const rij = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink hover:bg-paper-soft";

  return (
    <Portal>
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 sm:items-center" onClick={onSluit}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ib.zakelijkeTools}
          className="chat-surface max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-white pb-3 shadow-lift sm:max-w-md sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
            <span aria-hidden className="text-lg">
              💼
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-base font-bold text-ink">{ib.zakelijkeTools}</span>
              {bedrijfsnaam && <span className="block truncate text-xs text-neutralx-500">{bedrijfsnaam}</span>}
            </span>
            <button type="button" onClick={onSluit} className="rounded-lg px-2 py-1 text-sm text-neutralx-500 hover:bg-paper-soft">
              {ib.zakelijkSluiten}
            </button>
          </div>

          <p className={sectie}>{ib.zakelijkOverzicht}</p>
          <div className="grid grid-cols-3 gap-2 px-4">
            {[
              [ib.zakelijkGesprekken, gesprekken.length],
              [ib.zakelijkOngelezen, ongelezen],
              [ib.zakelijkMetLabel, metLabel],
            ].map(([label, n]) => (
              <div key={String(label)} className="rounded-xl bg-paper-soft px-3 py-2">
                <span className="block font-display text-xl font-bold text-ink">{n}</span>
                <span className="block text-[11px] text-neutralx-500">{label}</span>
              </div>
            ))}
          </div>

          <p className={sectie}>{ib.zakelijkProfiel}</p>
          <p className="px-4 pb-1 text-xs text-neutralx-500">{ib.zakelijkProfielUitleg}</p>
          <Link href="/werkgever/bedrijf" className={rij} onClick={onSluit}>
            <span aria-hidden>🏢</span>
            {ib.zakelijkProfielBewerken}
          </Link>
          {onZoZienWerkers && (
            <button type="button" className={rij} onClick={onZoZienWerkers}>
              <span aria-hidden>👁</span>
              {ib.zakelijkZoZien}
            </button>
          )}

          <p className={sectie}>{ib.zakelijkBerichten}</p>
          <button type="button" className={rij} onClick={onInstellingen}>
            <span aria-hidden>⚡</span>
            <span className="min-w-0 flex-1">
              <span className="block">{ib.zakelijkSnel}</span>
              <span className="block text-xs text-neutralx-500">{ib.zakelijkSnelUitleg}</span>
            </span>
          </button>
          <button type="button" className={rij} onClick={onInstellingen}>
            <span aria-hidden>🌙</span>
            <span className="min-w-0 flex-1">
              <span className="block">{ib.zakelijkAfwezig}</span>
              <span className="block text-xs text-neutralx-500">{ib.zakelijkAfwezigUitleg}</span>
            </span>
          </button>

          <p className={sectie}>{ib.zakelijkLabels}</p>
          <p className="px-4 pb-2 text-xs text-neutralx-500">{ib.zakelijkLabelsUitleg}</p>
          <div className="flex flex-wrap gap-1.5 px-4">
            {labels.map((l) => (
              <button key={l} type="button" onClick={() => onFilter(l)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${labelKlasse(l, voorgesteld)}`}>
                {l} · {aantal(l)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}
