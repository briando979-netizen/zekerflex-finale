"use client";

import { useChatTeksten } from "./ChatTekstenContext";
import { ANTWOORDEN, alsIcs, perAntwoord, type Antwoord, type MessageAfspraak } from "@/lib/messaging/afspraak";
import { vulIn } from "@/lib/i18n/vul-in";

// Een afspraak in de chat met aanmelden (zoals een evenement in WhatsApp, 14 nov 2026): titel, tijd en plek; iedereen
// antwoordt "ik kom", "misschien" of "ik kan niet", met namen; "Zet in je agenda" geeft een .ics (UTC met Z).

const TZ = "Europe/Amsterdam";

export function AfspraakCard({
  id,
  titel,
  afspraak,
  mine,
  disabled,
  myUserId,
  names,
  onAntwoord,
  onAnnuleer,
}: {
  id: string;
  titel: string;
  afspraak: MessageAfspraak;
  mine: boolean;
  disabled: boolean;
  myUserId?: string;
  names?: Record<string, string>;
  onAntwoord?: (antwoord: Antwoord | null) => void;
  onAnnuleer?: () => void;
}) {
  const chat = useChatTeksten();
  const t = chat.bubble;
  const locale = chat.shared.locale;
  const start = new Date(afspraak.start);
  const eind = new Date(afspraak.eind);
  const datum = start.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  const tijd = `${start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ })}–${eind.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ })}`;
  const per = perAntwoord(afspraak);
  const mijn = myUserId ? (afspraak.antwoorden[myUserId] ?? null) : null;
  const label: Record<Antwoord, string> = { ja: t.afspraakJa, misschien: t.afspraakMisschien, nee: t.afspraakNee };
  const naam = (uid: string) => (uid === myUserId ? t.afspraakJij : (names?.[uid] ?? "…"));
  const af = Boolean(afspraak.geannuleerd);

  const naarAgenda = () => {
    const blob = new Blob([alsIcs(titel, afspraak, id)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${titel.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "afspraak"}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="mb-1 min-w-[15rem] rounded-lg bg-black/[0.04] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutralx-500">
        <span aria-hidden>📅</span> {t.afspraakLabel}
      </p>
      <p className={`mt-0.5 text-sm font-semibold text-ink ${af ? "line-through" : ""}`}>{titel}</p>
      <p className="text-xs text-neutralx-600">
        {datum} · {tijd}
      </p>
      {afspraak.plek && <p className="text-xs text-neutralx-600">📍 {afspraak.plek}</p>}
      {af ? (
        <p className="mt-2 text-xs font-semibold text-crit">{t.afspraakAfgezegd}</p>
      ) : (
        <div className="mt-2 flex gap-1.5" role="group" aria-label={t.afspraakAntwoord}>
          {ANTWOORDEN.map((a) => (
            <button
              key={a}
              type="button"
              disabled={disabled || !onAntwoord}
              aria-pressed={mijn === a}
              onClick={() => onAntwoord?.(mijn === a ? null : a)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-50 ${mijn === a ? "bg-brand-600 text-white" : "bg-white text-ink hover:bg-black/5"}`}
            >
              {label[a]}
            </button>
          ))}
        </div>
      )}
      <ul className="mt-2 space-y-0.5 text-[11px] text-neutralx-600">
        {ANTWOORDEN.map((a) =>
          per[a].length ? (
            <li key={a}>
              <span className="font-semibold">{vulIn(t.afspraakTelling, { antwoord: label[a], aantal: per[a].length })}</span> {per[a].map(naam).join(", ")}
            </li>
          ) : null,
        )}
      </ul>
      <div className="mt-2 flex gap-3 border-t border-black/10 pt-2">
        <button type="button" onClick={naarAgenda} className="text-xs font-semibold text-brand-600 hover:underline">
          {t.afspraakAgenda}
        </button>
        {mine && !af && onAnnuleer && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t.afspraakAfzeggenVraag)) onAnnuleer();
            }}
            className="ml-auto text-xs text-neutralx-500 hover:text-crit"
          >
            {t.afspraakAfzeggen}
          </button>
        )}
      </div>
    </div>
  );
}
