"use client";

import { useMemo, useState } from "react";
import { Shell } from "./modals";
import { useChatTeksten } from "./ChatTekstenContext";
import { mediaOverzicht } from "./media-overzicht";
import { fmtBytes, listTime, type Msg } from "./shared";
import { vulIn } from "@/lib/i18n/vul-in";

// "Media, links en documenten" van het open gesprek, zoals WhatsApp (13 nov 2026). Uit de berichten die al geladen zijn
// (components/chat/media-overzicht.ts); foto's klein in het raster (?klein=1), een tik opent het origineel.

type Tab = "media" | "docs" | "links";

export function MediaOverzicht({
  threadId,
  messages,
  onClose,
  onOpenImage,
  onJump,
}: {
  threadId: string;
  messages: readonly Msg[];
  onClose: () => void;
  onOpenImage: (src: string, filename: string) => void;
  /** naar het bericht in het gesprek springen (bijv. om een video af te spelen) */
  onJump: (messageId: string) => void;
}) {
  const chat = useChatTeksten();
  const t = chat.modals;
  const [tab, setTab] = useState<Tab>("media");
  const o = useMemo(() => mediaOverzicht(messages), [messages]);
  const url = (mediaId: string) => `/api/inbox/${threadId}/media/${mediaId}`;
  const tabs: Array<[Tab, string, number]> = [
    ["media", t.tabMedia, o.media.length],
    ["docs", t.tabDocs, o.docs.length],
    ["links", t.tabLinks, o.links.length],
  ];
  const leeg = (tekst: string) => <p className="py-8 text-center text-sm text-neutralx-500">{tekst}</p>;

  return (
    <Shell title={t.mediaTitel} onClose={onClose}>
      <div className="mb-3 flex gap-1 rounded-xl bg-paper-soft p-1" role="tablist" aria-label={t.mediaTitel}>
        {tabs.map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${tab === k ? "bg-white text-ink shadow-sm" : "text-neutralx-500"}`}
          >
            {label} {n > 0 && <span className="font-normal text-neutralx-500">({n})</span>}
          </button>
        ))}
      </div>

      {tab === "media" &&
        (o.media.length === 0 ? (
          leeg(t.leegMedia)
        ) : (
          <ul className="grid grid-cols-3 gap-1">
            {o.media.map((m) => (
              <li key={m.id}>
                {m.soort === "foto" ? (
                  <button type="button" onClick={() => onOpenImage(url(m.mediaId), m.filename)} className="block aspect-square w-full overflow-hidden rounded-md bg-black/5" aria-label={m.filename}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${url(m.mediaId)}?klein=1`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onJump(m.id)}
                    className="grid aspect-square w-full place-items-center rounded-md bg-ink/90 p-1 text-center text-white"
                    aria-label={vulIn(t.naarVideo, { naam: m.filename })}
                  >
                    <span className="text-2xl" aria-hidden>
                      ▶
                    </span>
                    <span className="w-full truncate text-[10px]">{m.filename}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}

      {tab === "docs" &&
        (o.docs.length === 0 ? (
          leeg(t.leegDocs)
        ) : (
          <ul className="divide-y divide-hair">
            {o.docs.map((d) => (
              <li key={d.id}>
                <a href={`${url(d.mediaId)}?dl=1`} className="flex items-center gap-3 py-2.5 hover:bg-paper-soft">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-500 text-white" aria-hidden>
                    📄
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{d.filename}</span>
                    <span className="block text-[11px] text-neutralx-500">
                      {fmtBytes(d.sizeBytes)} · {listTime(d.at, undefined, chat.shared)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ))}

      {tab === "links" &&
        (o.links.length === 0 ? (
          leeg(t.leegLinks)
        ) : (
          <ul className="divide-y divide-hair">
            {o.links.map((l, i) => (
              <li key={`${l.id}-${i}`} className="flex items-center gap-2 py-2.5">
                <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#027EB5] [.app-scope[data-theme=dark]_&]:text-[#53BDEB]">{l.tekst}</span>
                  <span className="block text-[11px] text-neutralx-500">{listTime(l.at, undefined, chat.shared)}</span>
                </a>
                <button type="button" onClick={() => onJump(l.id)} className="flex-shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-paper-soft">
                  {t.naarBericht}
                </button>
              </li>
            ))}
          </ul>
        ))}

      <p className="mt-3 text-[11px] text-neutralx-400">{t.alleenGeladen}</p>
    </Shell>
  );
}
