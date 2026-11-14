"use client";

import { useState } from "react";
import { useChatTeksten } from "./ChatTekstenContext";
import type { GeplandBericht } from "@/lib/messaging/gepland-tijd";
import { vulIn } from "@/lib/i18n/vul-in";

// Je geplande berichten in dit gesprek (15 nov 2026), boven het invoerveld: hoeveel, en uitgeklapt per bericht wanneer
// het gaat (Nederlandse tijd) met "Niet versturen". Alleen jij ziet ze; de ander pas als ze verstuurd zijn.

const TZ = "Europe/Amsterdam";

export function GeplandBalk({ gepland, onAnnuleer }: { gepland: GeplandBericht[]; onAnnuleer: (id: string) => void }) {
  const chat = useChatTeksten();
  const t = chat.inbox;
  const locale = chat.shared.locale;
  const [open, setOpen] = useState(false);
  if (gepland.length === 0) return null;
  const wanneer = (iso: string) =>
    new Date(iso).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

  return (
    <div className="border-t border-hair bg-white px-3 py-1.5 text-xs">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-1.5 font-semibold text-plan-ink">
        <span aria-hidden>🕒</span>
        {gepland.length === 1 ? t.geplandEen : vulIn(t.geplandMeer, { n: String(gepland.length) })}
        <span aria-hidden className="ml-auto text-neutralx-400">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {gepland.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded-lg bg-plan-soft px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-plan-ink">{wanneer(g.sendAt)}</span>
                <span className="block truncate text-ink">{g.text}</span>
              </span>
              <button type="button" onClick={() => onAnnuleer(g.id)} className="flex-shrink-0 font-semibold text-crit">
                {t.geplandNiet}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
