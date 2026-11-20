"use client";

import { useCallback, useEffect, useState } from "react";
import { useChatTeksten } from "./ChatTekstenContext";
import { Avatar } from "./Avatar";
import { StatusMaker } from "./StatusMaker";
import { StatusViewer, type StatusPersoon } from "./StatusViewer";
import type { StatusFeed } from "@/lib/messaging/status-vorm";

// Status bovenaan de chatlijst (15 nov 2026), zoals de statusbalk in WhatsApp: eerst je eigen status (of "toevoegen"), dan
// je contacten met een status; een gekleurde ring = nog niet alles gezien. Elke 2 minuten opnieuw opgehaald.

// compact (werker-app, 20 nov 2026): één regel met kleine rondjes in plaats van een kop en een rij van 48 px met namen eronder;
// alles blijft bereikbaar (eigen status bekijken of maken, de plus, de statussen van contacten). Zonder compact: zoals het was.

export function StatusRij({ myUserId, myName, avatars, onReageer, compact = false }: { myUserId: string; myName: string; avatars: Record<string, string>; onReageer: (userId: string) => void; compact?: boolean }) {
  const t = useChatTeksten().inbox;
  const [feed, setFeed] = useState<StatusFeed | null>(null);
  const [maken, setMaken] = useState(false);
  const [kijk, setKijk] = useState<{ personen: StatusPersoon[]; start: number } | null>(null);

  const laad = useCallback(async () => {
    const r = await fetch("/api/inbox/status", { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? ((await r.json().catch(() => null)) as StatusFeed | null) : null;
    if (d && Array.isArray(d.mijn) && Array.isArray(d.anderen)) setFeed(d);
  }, []);
  useEffect(() => {
    void laad();
    const klok = window.setInterval(() => void laad(), 120_000);
    return () => window.clearInterval(klok);
  }, [laad]);

  const personen = (): StatusPersoon[] => [
    ...(feed?.mijn.length ? [{ userId: myUserId, naam: myName, eigen: true, statussen: feed.mijn.map((s) => ({ ...s, gezien: true })) }] : []),
    ...(feed?.anderen ?? []).map((a) => ({ ...a, eigen: false })),
  ];
  const open = (userId: string) => {
    const lijst = personen();
    const start = lijst.findIndex((x) => x.userId === userId);
    if (start >= 0) setKijk({ personen: lijst, start });
  };
  const gezien = useCallback((eigenaar: string, statusId: string) => {
    void fetch(`/api/inbox/status/${encodeURIComponent(statusId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ van: eigenaar }) }).catch(() => null);
  }, []);
  const sluit = useCallback(() => {
    setKijk(null);
    void laad();
  }, [laad]);

  const mijnAantal = feed?.mijn.length ?? 0;
  return (
    <div className="border-b border-hair">
      {compact ? (
        <div className="relative flex items-center gap-2 overflow-x-auto px-4 py-1.5 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => (mijnAantal ? open(myUserId) : setMaken(true))}
            className="flex flex-shrink-0 items-center gap-2 rounded-full pr-1 text-xs font-medium text-neutralx-600 hover:text-ink"
          >
            <span className={`rounded-full p-0.5 ${mijnAantal ? "ring-2 ring-neutralx-300" : ""}`}>
              <Avatar userId={myUserId} name={myName} avatars={avatars} size={28} />
            </span>
            {t.statusMijn}
          </button>
          <button type="button" onClick={() => setMaken(true)} aria-label={t.statusToevoegen} title={t.statusToevoegen} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
            +
          </button>
          {(feed?.anderen ?? []).map((a) => {
            const nieuw = a.statussen.some((s) => !s.gezien);
            return (
              <button key={a.userId} type="button" onClick={() => open(a.userId)} aria-label={a.naam} title={a.naam} className={`flex-shrink-0 rounded-full p-0.5 ring-2 ${nieuw ? "ring-brand-500" : "ring-neutralx-300"}`}>
                <Avatar userId={a.userId} name={a.naam} avatars={avatars} size={28} />
              </button>
            );
          })}
          {feed && feed.anderen.length === 0 && <p className="min-w-0 truncate text-xs text-neutralx-500">{t.statusLeeg}</p>}
        </div>
      ) : (
      <>
      <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutralx-500">{t.statusTitel}</p>
      <div className="relative flex gap-3 overflow-x-auto px-4 pb-2 pt-1.5">
        <div className="relative flex w-16 flex-shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => (mijnAantal ? open(myUserId) : setMaken(true))}
            aria-label={mijnAantal ? t.statusMijn : t.statusToevoegen}
            className={`rounded-full p-0.5 ${mijnAantal ? "ring-2 ring-neutralx-300" : ""}`}
          >
            <Avatar userId={myUserId} name={myName} avatars={avatars} size={48} />
          </button>
          <button type="button" onClick={() => setMaken(true)} aria-label={t.statusToevoegen} className="absolute right-0.5 top-9 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white shadow-sm">
            +
          </button>
          <span className="w-full truncate text-center text-[11px] text-neutralx-600">{t.statusMijn}</span>
        </div>
        {(feed?.anderen ?? []).map((a) => {
          const nieuw = a.statussen.some((s) => !s.gezien);
          return (
            <button key={a.userId} type="button" onClick={() => open(a.userId)} className="flex w-16 flex-shrink-0 flex-col items-center gap-1">
              <span className={`rounded-full p-0.5 ring-2 ${nieuw ? "ring-brand-500" : "ring-neutralx-300"}`}>
                <Avatar userId={a.userId} name={a.naam} avatars={avatars} size={48} />
              </span>
              <span className={`w-full truncate text-center text-[11px] ${nieuw ? "font-semibold text-ink" : "text-neutralx-600"}`}>{a.naam}</span>
            </button>
          );
        })}
        {feed && feed.anderen.length === 0 && <p className="self-center text-xs text-neutralx-500">{t.statusLeeg}</p>}
      </div>
      </>
      )}
      {maken && (
        <StatusMaker
          onCancel={() => setMaken(false)}
          onKlaar={() => {
            setMaken(false);
            void laad();
          }}
        />
      )}
      {kijk && (
        <StatusViewer
          personen={kijk.personen}
          start={kijk.start}
          namen={feed?.namen ?? {}}
          onGezien={gezien}
          onSluit={sluit}
          onWeg={async (id) => {
            await fetch(`/api/inbox/status/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
            sluit();
          }}
          onReageer={(userId) => {
            setKijk(null);
            onReageer(userId);
          }}
        />
      )}
    </div>
  );
}
