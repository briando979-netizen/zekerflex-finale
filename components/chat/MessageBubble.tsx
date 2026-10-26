"use client";

import { useRef, useState } from "react";
import { fmtBytes, fmtDuration, fmtTime, type Msg } from "./shared";
import { Avatar } from "./Avatar";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "😢"];

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
  onReact,
  onDelete,
  myUserId,
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
  onReact?: (m: Msg, emoji: string) => void;
  onDelete?: (m: Msg) => void;
  myUserId?: string;
}) {
  const [pickOpen, setPickOpen] = useState(false);
  const mediaUrl = m.attachment ? `/api/inbox/${threadId}/media/${m.attachment.mediaId}` : null;

  if (m.deleted) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className="my-1 rounded-2xl bg-black/[0.04] px-3 py-2 text-[0.8em] italic text-neutralx-400">🚫 Dit bericht is verwijderd</div>
      </div>
    );
  }

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
    <div className={`group relative flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
      {onReact && pickOpen && (
        <div className={`absolute -top-8 z-20 flex gap-1 rounded-full bg-white px-2 py-1 shadow-lg ring-1 ring-black/5 ${mine ? "right-2" : "left-9"}`}>
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onReact(m, e);
                setPickOpen(false);
              }}
              className="text-lg leading-none transition-transform hover:scale-125"
              aria-label={`Reageer met ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
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
          // Touch has no hover, so a hidden-until-hover reply icon would
          // never appear there; only real hover-capable pointers get it
          // hidden by default.
          className="mb-1 block text-xs text-neutralx-400 hover:text-brand-600 [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:block"
          aria-label="Beantwoord"
        >
          ↩
        </button>
      )}
      {!mine && onReact && (
        <button
          type="button"
          onClick={() => setPickOpen((v) => !v)}
          aria-label="Reageer"
          className="mb-1 block text-base leading-none text-neutralx-400 hover:text-brand-600 [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:block"
        >
          🙂
        </button>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-[0.875em] shadow-sm ${
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

        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(m.reactions).map(([emoji, users]) => {
              const reacted = myUserId ? users.includes(myUserId) : false;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact?.(m, emoji)}
                  className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] leading-none ${reacted ? "bg-brand-100 text-brand-700" : "bg-black/[0.06] text-neutralx-600"}`}
                  aria-label={`${users.length}× ${emoji}${reacted ? " (jij reageerde)" : ""}`}
                >
                  <span>{emoji}</span>
                  {users.length > 1 && <span>{users.length}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {mine && onReact && (
        <button
          type="button"
          onClick={() => setPickOpen((v) => !v)}
          aria-label="Reageer"
          className="mb-1 block text-base leading-none text-neutralx-400 hover:text-brand-600 [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:block"
        >
          🙂
        </button>
      )}
      {mine && onDelete && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Dit bericht voor iedereen verwijderen?")) onDelete(m);
          }}
          aria-label="Verwijder bericht"
          className="mb-1 block text-xs leading-none text-neutralx-400 hover:text-crit [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:block"
        >
          🗑
        </button>
      )}
      {mine && onReply && (
        <button
          type="button"
          onClick={() => onReply(m)}
          className="mb-1 block text-xs text-neutralx-400 hover:text-brand-600 [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:block"
          aria-label="Beantwoord"
        >
          ↩
        </button>
      )}
    </div>
  );
}
