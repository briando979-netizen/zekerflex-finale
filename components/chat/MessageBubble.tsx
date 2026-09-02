"use client";

import { useRef, useState } from "react";
import { fmtBytes, fmtDuration, fmtTime, type Msg } from "./shared";
import { Avatar } from "./Avatar";

function Ticks({ m }: { m: Msg }) {
  if (m.pending) return <span>🕓</span>;
  return <span className={m.readByOthers ? "text-[#34B7F1]" : ""}>{m.readByOthers ? "✓✓" : "✓"}</span>;
}

function VoiceNote({ src, durationSec }: { src: string; durationSec?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand-500 text-white"
        aria-label={playing ? "Pauze" : "Afspelen"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="h-1 w-32 rounded-full bg-black/10">
        <div className="h-full w-0 rounded-full bg-brand-500" />
      </div>
      <span className="text-[11px] text-neutralx-500">{durationSec ? fmtDuration(durationSec) : "spraak"}</span>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} preload="none" />
    </div>
  );
}

export function MessageBubble({
  m,
  mine,
  threadId,
  senderName,
  senderRole,
  showSender,
  showAvatar,
  avatars,
  onReply,
  onAvatarClick,
}: {
  m: Msg;
  mine: boolean;
  threadId: string;
  senderName?: string;
  senderRole?: string;
  showSender?: boolean;
  /** render the sender's photo in the gutter (incoming messages) */
  showAvatar?: boolean;
  avatars?: Record<string, string>;
  onReply?: (m: Msg) => void;
  onAvatarClick?: (userId: string) => void;
}) {
  const mediaUrl = m.attachment ? `/api/inbox/${threadId}/media/${m.attachment.mediaId}` : null;

  if (m.kind === "system") {
    return (
      <p className="mx-auto my-2 w-fit max-w-[80%] rounded-full bg-black/5 px-3 py-1 text-center text-[11px] text-neutralx-500">
        {m.text}
      </p>
    );
  }

  if (m.kind === "call") {
    const label =
      m.call?.status === "missed"
        ? "Gemiste oproep"
        : m.call?.status === "declined"
          ? "Oproep geweigerd"
          : `Gesprek · ${m.call?.durationSec ? fmtDuration(m.call.durationSec) : "0:00"}`;
    const icon = m.call?.mode === "video" ? "📹" : m.call?.mode === "screen" ? "🖥️" : "📞";
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className="my-1 flex items-center gap-2 rounded-full bg-black/5 px-3 py-1.5 text-xs text-neutralx-600">
          <span>{icon}</span>
          {label}
          <span className="text-neutralx-400">{fmtTime(m.at)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine && (
        <button
          type="button"
          onClick={() => onAvatarClick?.(m.from)}
          className={`mb-0.5 flex-shrink-0 ${showAvatar ? "" : "invisible"}`}
          aria-label={senderName ? `Profiel van ${senderName}` : "Profiel"}
        >
          <Avatar userId={m.from} name={senderName ?? "?"} {...(senderRole ? { role: senderRole } : {})} avatars={avatars ?? {}} size={26} />
        </button>
      )}
      {!mine && onReply && (
        <button
          type="button"
          onClick={() => onReply(m)}
          className="mb-1 hidden text-xs text-neutralx-400 hover:text-brand-600 group-hover:block"
          aria-label="Beantwoord"
        >
          ↩
        </button>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          mine ? "rounded-br-sm bg-[#DCF8C6]" : "rounded-bl-sm bg-white"
        }`}
      >
        {showSender && !mine && senderName && (
          <button
            type="button"
            onClick={() => onAvatarClick?.(m.from)}
            className="mb-0.5 block text-[11px] font-semibold text-brand-600 hover:underline"
          >
            {senderName}
          </button>
        )}

        {m.replyTo && (
          <div className="mb-1 border-l-2 border-brand-400 bg-black/[0.04] px-2 py-1 text-xs text-neutralx-500">
            {m.replyTo.excerpt || "bericht"}
          </div>
        )}

        {m.kind === "image" && mediaUrl && (
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl} alt={m.attachment?.filename ?? ""} className="mb-1 max-h-64 rounded-lg object-cover" />
          </a>
        )}

        {m.kind === "voice" && mediaUrl && (
          <VoiceNote src={mediaUrl} {...(m.attachment?.durationSec != null ? { durationSec: m.attachment.durationSec } : {})} />
        )}

        {m.kind === "file" && mediaUrl && (
          <a
            href={`${mediaUrl}?dl=1`}
            className="flex items-center gap-2.5 rounded-lg bg-black/[0.04] px-2.5 py-2"
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-500 text-white">📄</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{m.attachment?.filename}</span>
              <span className="block text-[11px] text-neutralx-500">
                {m.attachment ? fmtBytes(m.attachment.sizeBytes) : ""}
              </span>
            </span>
          </a>
        )}

        {m.kind === "location" && m.location && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${m.location.lat}&mlon=${m.location.lng}#map=16/${m.location.lat}/${m.location.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg bg-black/[0.04] px-2.5 py-2"
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-500 text-white">📍</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">
                {m.location.label || "Gedeelde locatie"}
              </span>
              <span className="block text-[11px] text-neutralx-500">
                {m.location.lat.toFixed(4)}, {m.location.lng.toFixed(4)} · open in kaart
              </span>
            </span>
          </a>
        )}

        {m.text && <p className="whitespace-pre-wrap break-words text-ink">{m.text}</p>}

        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-neutralx-400">
          {m.auto && <span className="italic">automatisch</span>}
          {fmtTime(m.at)}
          {mine && <Ticks m={m} />}
        </span>
      </div>
      {mine && onReply && (
        <button
          type="button"
          onClick={() => onReply(m)}
          className="mb-1 hidden text-xs text-neutralx-400 hover:text-brand-600 group-hover:block"
          aria-label="Beantwoord"
        >
          ↩
        </button>
      )}
    </div>
  );
}
