"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { useChatTeksten } from "./ChatTekstenContext";
import { vulIn } from "@/lib/i18n/vul-in";
import { IconChatBubble, IconPhone, IconPhoneDown, IconVideo } from "./icons";

// ---------------------------------------------------------------------------
// Je wordt gebeld (15 nov 2026, eigenaar: "dezelfde knoppen als WhatsApp"). Op de telefoon een volledig scherm met de foto,
// de naam en de soort oproep, en onderaan drie ronde knoppen: Weiger (rood), Bericht en Opnemen. Bericht weigert met een
// kort antwoord in de chat ("Ik kan nu niet praten…") of opent de chat voor een eigen bericht. Op een computer een kaart
// rechtsboven, zodat je verder kunt typen terwijl het overgaat. ChatDock beltelt, laat de beltoon horen en kiest wat er
// gebeurt; dit onderdeel toont alleen. Eigen vormgeving, geen WhatsApp-merk.
// ---------------------------------------------------------------------------

export interface Binnenkomend {
  threadId: string;
  callId: string;
  mode: string;
  fromUserId: string;
  fromName: string;
  fromRole: string;
}

export function BinnenkomendGesprek({
  oproep,
  avatars,
  onOpnemen,
  onWeigeren,
  onAntwoord,
  onEigenBericht,
}: {
  oproep: Binnenkomend;
  avatars: Record<string, string>;
  onOpnemen: () => void;
  onWeigeren: () => void;
  /** weigeren met dit korte bericht in de chat */
  onAntwoord: (tekst: string) => void;
  /** weigeren en de chat openen om zelf iets te schrijven */
  onEigenBericht: () => void;
}) {
  const chat = useChatTeksten();
  const [antwoorden, setAntwoorden] = useState(false);
  const opnemen = useRef<HTMLButtonElement | null>(null);
  const video = oproep.mode === "video";
  const soort = video ? chat.bel.videooproep : oproep.mode === "screen" ? chat.bel.schermoproep : chat.bel.spraakoproep;

  // de focus op Opnemen, zodat Enter of spatie meteen opneemt
  useEffect(() => {
    opnemen.current?.focus();
  }, []);

  // Escape sluit eerst de lijst met antwoorden
  useEffect(() => {
    if (!antwoorden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAntwoorden(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [antwoorden]);

  const snel = [chat.dock.snelAntwoord1, chat.dock.snelAntwoord2, chat.dock.snelAntwoord3];

  return (
    <div
      role="alertdialog"
      aria-label={vulIn(chat.dock.beltJeNaam, { naam: oproep.fromName })}
      className="fixed inset-0 z-[78] flex flex-col bg-[#0b0f0e] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white animate-slide-up-fade sm:inset-auto sm:right-4 sm:top-4 sm:w-[22rem] sm:rounded-3xl sm:pb-0 sm:pt-0 sm:shadow-lift"
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center sm:flex-none sm:py-6">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-white/60">
          {video ? <IconVideo className="h-3.5 w-3.5" /> : <IconPhone className="h-3.5 w-3.5" />}
          {soort}
        </p>
        <div className="relative mt-8 sm:mt-5">
          <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-white/10" />
          <span className="hidden sm:block">
            <Avatar userId={oproep.fromUserId} name={oproep.fromName} role={oproep.fromRole} avatars={avatars} size={72} />
          </span>
          <span className="sm:hidden">
            <Avatar userId={oproep.fromUserId} name={oproep.fromName} role={oproep.fromRole} avatars={avatars} size={128} />
          </span>
        </div>
        <p className="mt-6 max-w-full truncate font-display text-3xl font-semibold sm:mt-4 sm:text-xl">{oproep.fromName}</p>
        <p className="mt-1 text-sm text-white/60">
          {video ? chat.dock.beltJeVideo : oproep.mode === "screen" ? chat.dock.beltJeScherm : chat.dock.beltJe}
        </p>
      </div>

      {antwoorden ? (
        // weigeren met een bericht, zoals bij WhatsApp
        <div className="mx-3 mb-6 overflow-hidden rounded-2xl bg-white text-ink sm:mb-3">
          <p className="px-4 pb-1 pt-3 text-xs font-semibold text-neutralx-500">{chat.dock.weigerMetBericht}</p>
          <ul>
            {snel.map((tekst) => (
              <li key={tekst}>
                <button type="button" onClick={() => onAntwoord(tekst)} className="w-full border-t border-hair px-4 py-3 text-left text-sm hover:bg-paper-soft">
                  {tekst}
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={onEigenBericht} className="w-full border-t border-hair px-4 py-3 text-left text-sm font-semibold text-brand-600 hover:bg-paper-soft">
                {chat.dock.eigenBericht}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setAntwoorden(false)} className="w-full border-t border-hair px-4 py-3 text-center text-sm text-neutralx-500 hover:bg-paper-soft">
                {chat.dock.annuleren}
              </button>
            </li>
          </ul>
        </div>
      ) : (
        <div className="grid grid-cols-3 items-start gap-2 px-6 pb-10 pt-2 sm:pb-6">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onWeigeren}
              aria-label={chat.dock.weiger}
              className="grid h-16 w-16 place-items-center rounded-full bg-crit text-3xl transition hover:brightness-110 active:scale-95 sm:h-14 sm:w-14"
            >
              <IconPhoneDown />
            </button>
            <span aria-hidden="true" className="text-xs text-white/75">{chat.dock.weiger}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setAntwoorden(true)}
              aria-label={chat.dock.weigerMetBericht}
              className="grid h-16 w-16 place-items-center rounded-full bg-white/15 text-2xl transition hover:bg-white/25 active:scale-95 sm:h-14 sm:w-14"
            >
              <IconChatBubble />
            </button>
            <span aria-hidden="true" className="text-xs text-white/75">{chat.dock.bericht}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              ref={opnemen}
              type="button"
              onClick={onOpnemen}
              aria-label={chat.dock.opnemen}
              className="grid h-16 w-16 animate-pulse place-items-center rounded-full bg-ok text-3xl text-white transition hover:brightness-110 active:scale-95 motion-reduce:animate-none sm:h-14 sm:w-14"
            >
              {video ? <IconVideo /> : <IconPhone />}
            </button>
            <span aria-hidden="true" className="text-xs text-white/75">{chat.dock.opnemen}</span>
          </div>
        </div>
      )}
    </div>
  );
}
