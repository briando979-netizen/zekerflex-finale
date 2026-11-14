"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Portal } from "./Portal";
import { useChatTeksten } from "./ChatTekstenContext";
import { hoeLangGeleden, statusKleur, type StatusKaart } from "@/lib/messaging/status-vorm";
import { vulIn } from "@/lib/i18n/vul-in";

// Statussen bekijken (15 nov 2026), zoals in WhatsApp: schermvullend, balkjes bovenin, rechts tikken = volgende, links =
// vorige, vanzelf door na een paar seconden. Bij een ander: je ziet hem (de eigenaar hoort dat) en kunt reageren. Bij je
// eigen status: wie hem zag, en weghalen.

export interface StatusPersoon {
  userId: string;
  naam: string;
  statussen: (StatusKaart & { gezienDoor?: Record<string, string> })[];
  eigen: boolean;
}

const DUUR_MS = 5000;

export function StatusViewer({
  personen,
  start,
  namen,
  onGezien,
  onWeg,
  onReageer,
  onSluit,
}: {
  personen: StatusPersoon[];
  start: number;
  /** namen van wie jouw status zag */
  namen: Record<string, string>;
  onGezien: (eigenaar: string, statusId: string) => void;
  onWeg: (statusId: string) => Promise<void>;
  onReageer: (userId: string) => void;
  onSluit: () => void;
}) {
  const chat = useChatTeksten();
  const t = chat.inbox;
  const [p, setP] = useState(start);
  // bij een ander: begin bij de eerste die je nog niet zag
  const [i, setI] = useState(() => Math.max(0, personen[start]?.statussen.findIndex((s) => !s.gezien) ?? 0));
  const [lijstOpen, setLijstOpen] = useState(false);
  const [nu, setNu] = useState(() => Date.now());
  const persoon = personen[p];
  const status = persoon?.statussen[i];
  const gemeld = useRef(new Set<string>());

  const volgende = useCallback(() => {
    setLijstOpen(false);
    if (!persoon) return onSluit();
    if (i < persoon.statussen.length - 1) return setI(i + 1);
    if (p < personen.length - 1) {
      setP(p + 1);
      setI(Math.max(0, personen[p + 1]?.statussen.findIndex((s) => !s.gezien) ?? 0));
      return;
    }
    onSluit();
  }, [i, onSluit, p, persoon, personen]);
  const vorige = () => {
    setLijstOpen(false);
    if (i > 0) return setI(i - 1);
    if (p > 0) {
      setP(p - 1);
      setI(0);
    }
  };

  // vanzelf door, behalve als je de lijst van kijkers open hebt
  useEffect(() => {
    if (!status || lijstOpen) return;
    const klok = window.setTimeout(volgende, DUUR_MS);
    return () => window.clearTimeout(klok);
  }, [status, lijstOpen, volgende]);

  // een status van een ander: één keer melden dat je hem zag
  useEffect(() => {
    if (!persoon || !status || persoon.eigen || status.gezien || gemeld.current.has(status.id)) return;
    gemeld.current.add(status.id);
    onGezien(persoon.userId, status.id);
  }, [onGezien, persoon, status]);

  // toetsen: Esc sluit, pijltjes bladeren (opnieuw bij elke weergave, zodat ze de huidige stand kennen)
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSluit();
      if (e.key === "ArrowRight") volgende();
      if (e.key === "ArrowLeft") vorige();
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  });
  // "x min geleden" loopt door
  useEffect(() => {
    const klok = window.setInterval(() => setNu(Date.now()), 30_000);
    return () => window.clearInterval(klok);
  }, []);

  if (!persoon || !status) return null;
  const geleden = hoeLangGeleden(status.at, nu);
  const wanneer = geleden.soort === "zojuist" ? t.statusZojuist : vulIn(geleden.soort === "min" ? t.statusMinGeleden : t.statusUurGeleden, { n: String(geleden.n) });
  const kijkers = Object.entries(status.gezienDoor ?? {}).sort((a, b) => (a[1] < b[1] ? 1 : -1));

  return (
    <Portal>
      <div role="dialog" aria-modal="true" aria-label={vulIn(t.statusVan, { naam: persoon.naam })} className="fixed inset-0 z-[97] flex flex-col bg-black text-white">
        <div className="flex gap-1 px-3 pt-3" aria-hidden>
          {persoon.statussen.map((s, n) => (
            <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded bg-white/30">
              <span
                key={n === i ? `nu-${s.id}` : s.id}
                className={`block h-full bg-white ${n < i ? "w-full" : n === i ? `status-balk w-full ${lijstOpen ? "[animation-play-state:paused]" : ""}` : "w-0"}`}
              />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{persoon.eigen ? t.statusMijn : persoon.naam}</span>
            <span className="block text-xs text-white/70">{wanneer}</span>
          </span>
          <button type="button" onClick={onSluit} className="rounded-full px-3 py-1 text-sm hover:bg-white/10">
            {t.statusSluiten}
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {status.soort === "tekst" ? (
            <div className="flex h-full w-full items-center justify-center p-8" style={{ backgroundColor: statusKleur(status.kleur) }}>
              <p className="max-w-xl whitespace-pre-wrap break-words text-center text-2xl font-semibold leading-snug">{status.tekst}</p>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto via de eigen route, alleen voor wie hem mag zien */}
              <img
                src={`/api/inbox/status/${encodeURIComponent(status.id)}/media?van=${encodeURIComponent(persoon.userId)}`}
                alt={status.tekst ?? ""}
                className="min-h-0 max-w-full flex-1 object-contain"
              />
              {status.tekst && <p className="w-full bg-black/60 px-4 py-3 text-center text-sm">{status.tekst}</p>}
            </div>
          )}
          {/* tikken: links vorige, rechts volgende (zoals WhatsApp) */}
          <button type="button" aria-label={t.statusVorige} onClick={vorige} className="absolute inset-y-0 left-0 w-1/3" />
          <button type="button" aria-label={t.statusVolgende} onClick={volgende} className="absolute inset-y-0 right-0 w-2/3" />
        </div>

        <div className="relative px-4 py-3">
          {persoon.eigen ? (
            <>
              {lijstOpen && (
                <ul className="mb-2 max-h-48 overflow-y-auto rounded-xl bg-white/10 p-2 text-sm">
                  {kijkers.length === 0 && <li className="px-2 py-1 text-white/70">{t.statusNogNiemand}</li>}
                  {kijkers.map(([id, tijd]) => (
                    <li key={id} className="flex justify-between gap-3 px-2 py-1">
                      <span className="truncate">{namen[id] || "…"}</span>
                      <span className="flex-shrink-0 text-white/60">{new Date(tijd).toLocaleTimeString(chat.shared.locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setLijstOpen((o) => !o)} aria-expanded={lijstOpen} className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-white/10">
                  👁 {vulIn(t.statusGezienDoor, { n: String(kijkers.length) })}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t.statusWeghalenVraag)) void onWeg(status.id);
                  }}
                  className="ml-auto rounded-full px-3 py-1.5 text-sm font-semibold text-[#FCA5A5] hover:bg-white/10"
                >
                  {t.statusWeghalen}
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => onReageer(persoon.userId)} className="w-full rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/25">
              {t.statusReageren}
            </button>
          )}
        </div>
      </div>
    </Portal>
  );
}
