"use client";

import { useRef, useState, type TouchEvent } from "react";
import { canEdit, emojiOnlyCount, fmtBytes, fmtDuration, fmtTime, linkParts, type Msg } from "./shared";
import { Avatar } from "./Avatar";
import { IconReply, IconSmiley, IconDots, IconCopy, IconForward, IconPin, IconStar, IconPencil, IconTrash } from "./icons";
import { ActionList, MessageSheet, ReactionRow, type ActionItem } from "./MessageActions";
import { PollCard } from "./PollCard";
import { isProgramma } from "@/lib/messaging/bijlage";
import { useChatTeksten } from "./ChatTekstenContext";
import { vulIn } from "@/lib/i18n/vul-in";

/** Lang drukken (telefoon) opent het actiepaneel na zoveel ms. */
const LONG_PRESS_MS = 450;
/** Zo ver naar rechts vegen = beantwoorden. */
const SWIPE_REPLY_PX = 56;

function Ticks({ m }: { m: Msg }) {
  const t = useChatTeksten().bubble;
  if (m.failed) return <span className="font-bold text-crit" aria-label={t.statusNotSent}>!</span>;
  if (m.pending) return <span aria-label={t.statusSending}>🕓</span>;
  // gelezen = blauw: op de lichtgroene bubbel donkerblauw (5,3:1; #53BDEB haalde 1,9:1), in donker het WhatsApp-blauw
  return (
    <span className={m.readByOthers ? "text-[#0369A1] [.app-scope[data-theme=dark]_&]:text-[#53BDEB]" : ""} aria-label={m.readByOthers ? t.statusRead : t.statusSent}>
      {m.readByOthers ? "✓✓" : "✓"}
    </span>
  );
}

const RATES = [1, 1.5, 2] as const;

function VoiceNote({ src, durationSec }: { src: string; durationSec?: number }) {
  const t = useChatTeksten().bubble;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(durationSec ?? 0);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.playbackRate = rate;
      void a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };
  const seek = (fraction: number) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    a.currentTime = Math.max(0, Math.min(dur, fraction * dur));
    setPos(a.currentTime);
  };
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;
  return (
    <div className="flex min-w-[13rem] items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand-500 text-white"
        aria-label={playing ? t.pause : t.play}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className="relative h-1.5 cursor-pointer rounded-full bg-black/10"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek((e.clientX - r.left) / r.width);
          }}
          role="slider"
          aria-label={t.voicePosition}
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(pos)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seek((pos + 5) / (dur || 1));
            if (e.key === "ArrowLeft") seek((pos - 5) / (dur || 1));
          }}
        >
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500" style={{ left: `${pct}%` }} aria-hidden />
        </div>
        <span className="mt-1 block text-[11px] text-neutralx-500">{playing || pos > 0 ? fmtDuration(pos) : dur ? fmtDuration(dur) : t.voiceLabel}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]!;
          setRate(next);
          if (audioRef.current) audioRef.current.playbackRate = next;
        }}
        className="flex-shrink-0 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-neutralx-600"
        aria-label={vulIn(t.playbackRate, { snelheid: rate })}
      >
        {rate}×
      </button>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDur(d);
        }}
        onEnded={() => {
          setPlaying(false);
          setPos(0);
        }}
      />
    </div>
  );
}

/** Tekst met aanklikbare links. */
function RichText({ text, mine }: { text: string; mine: boolean }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        p.link ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={`break-all underline underline-offset-2 ${mine ? "text-[#0369A1]" : "text-[#027EB5]"} [.app-scope[data-theme=dark]_&]:text-[#53BDEB]`}
          >
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
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
  onEdit,
  onForward,
  onPin,
  myUserId,
  pinnedId,
  onRetry,
  onDiscard,
  onJumpTo,
  onOpenImage,
  onNotice,
  onStar,
  starred,
  onPollVote,
  onPollClose,
  names,
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
  /** your own text message, within 24 hours: back into the composer to rewrite */
  onEdit?: (m: Msg) => void;
  onForward?: (m: Msg) => void;
  onPin?: (m: Msg) => void;
  myUserId?: string;
  pinnedId?: string;
  /** versturen mislukte: opnieuw proberen / weggooien */
  onRetry?: (m: Msg) => void;
  onDiscard?: (m: Msg) => void;
  /** tik op een geciteerd bericht: spring ernaartoe */
  onJumpTo?: (messageId: string) => void;
  /** foto groot bekijken in de app (zonder: opent in een nieuw tabblad) */
  onOpenImage?: (src: string, filename: string) => void;
  /** korte melding onderin ("Gekopieerd") */
  onNotice?: (text: string) => void;
  /** bericht bewaren met een ster */
  onStar?: (m: Msg) => void;
  starred?: boolean;
  /** peiling: je hele keuze ([] = intrekken) */
  onPollVote?: (m: Msg, optionIds: string[]) => void;
  /** peiling sluiten (alleen de maker) */
  onPollClose?: (m: Msg) => void;
  /** userId → naam, voor wie op een peiling stemde */
  names?: Record<string, string>;
}) {
  const [pick, setPick] = useState<null | "up" | "down">(null);
  const pickOpen = pick !== null;
  const [menu, setMenu] = useState<null | "up" | "down">(null);
  const [sheet, setSheet] = useState(false);
  const [dx, setDx] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; horizontal: boolean | null } | null>(null);
  const longPressAt = useRef(0);
  const mediaUrl = m.attachment ? `/api/inbox/${threadId}/media/${m.attachment.mediaId}` : null;
  const chat = useChatTeksten();
  const t = chat.bubble;

  if (m.deleted) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className="my-1 rounded-2xl bg-black/[0.04] px-3 py-2 text-[0.8em] italic text-neutralx-400">{t.deleted}</div>
      </div>
    );
  }

  if (m.kind === "system") {
    return (
      <p className="mx-auto my-2 w-fit max-w-[80%] rounded-lg bg-white/80 px-3 py-1 text-center text-[11px] text-neutralx-500 shadow-sm">
        {m.text}
      </p>
    );
  }

  if (m.kind === "call") {
    const missed = m.call?.status === "missed" || m.call?.status === "declined";
    const label =
      m.call?.status === "missed"
        ? t.callMissed
        : m.call?.status === "declined"
          ? t.callDeclined
          : `${m.call?.mode === "video" ? t.callVideo : m.call?.mode === "screen" ? t.callScreen : t.callVoice} · ${m.call?.durationSec ? fmtDuration(m.call.durationSec) : "0:00"}`;
    const icon = m.call?.mode === "video" ? "📹" : m.call?.mode === "screen" ? "🖥️" : "📞";
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className={`my-1 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs shadow-sm ${missed && !mine ? "text-crit" : "text-neutralx-600"}`}>
          <span aria-hidden>{icon}</span>
          {label}
          <span className="text-neutralx-400">{fmtTime(m.at, chat.shared)}</span>
        </div>
      </div>
    );
  }

  const myReaction = myUserId ? (Object.entries(m.reactions ?? {}).find(([, u]) => u.includes(myUserId))?.[0] ?? null) : null;
  const preview = m.text || (m.kind === "image" ? t.previewPhoto : m.kind === "voice" ? t.previewVoice : m.kind === "file" ? `📎 ${m.attachment?.filename ?? t.previewFileFallback}` : m.kind === "location" ? t.previewLocation : "");

  const items: ActionItem[] = m.failed
    ? [
        ...(onRetry ? [{ key: "retry", label: t.retrySend, icon: "↻", run: () => onRetry(m) }] : []),
        ...(onDiscard ? [{ key: "discard", label: t.discard, icon: <IconTrash className="h-4 w-4" />, danger: true, run: () => onDiscard(m) }] : []),
      ]
    : [
        ...(onReply && !m.pending ? [{ key: "reply", label: t.reply, icon: <IconReply className="h-4 w-4" />, run: () => onReply(m) }] : []),
        ...(m.text
          ? [
              {
                key: "copy",
                label: t.copy,
                icon: <IconCopy className="h-4 w-4" />,
                run: () => {
                  void navigator.clipboard?.writeText(m.text).then(
                    () => onNotice?.(t.copied),
                    () => onNotice?.(t.copyFailed),
                  );
                },
              },
            ]
          : []),
        ...(onForward && !m.pending && m.kind !== "poll" ? [{ key: "fwd", label: t.forward, icon: <IconForward className="h-4 w-4" />, run: () => onForward(m) }] : []),
        ...(onPin && !m.pending
          ? [{ key: "pin", label: pinnedId === m.id ? t.unpin : t.pin, icon: <IconPin className="h-4 w-4" />, run: () => onPin(m) }]
          : []),
        ...(onStar && !m.pending
          ? [{ key: "star", label: starred ? t.unstar : t.star, icon: <IconStar className="h-4 w-4" />, run: () => onStar(m) }]
          : []),
        ...(mine && onEdit && canEdit(m, myUserId) ? [{ key: "edit", label: t.edit, icon: <IconPencil className="h-4 w-4" />, run: () => onEdit(m) }] : []),
        ...(mine && onDelete && !m.pending
          ? [
              {
                key: "del",
                label: t.deleteForAll,
                icon: <IconTrash className="h-4 w-4" />,
                danger: true,
                run: () => {
                  if (window.confirm(t.deleteConfirm)) onDelete(m);
                },
              },
            ]
          : []),
      ];

  // in de bovenste helft van het scherm klapt een menu naar beneden open, anders naar boven
  const direction = (): "up" | "down" => {
    const r = rowRef.current?.getBoundingClientRect();
    return r && r.top < window.innerHeight / 2 ? "down" : "up";
  };
  const openMenu = () => {
    setPick(null);
    setMenu(direction());
  };
  const touchDevice = () => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
  // het actiepaneel staat in een portal: React stuurt die aanrakingen toch langs deze rij, die negeren we
  const fromRow = (target: EventTarget) => Boolean(rowRef.current?.contains(target as Node));

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || !fromRow(e.target)) return;
    touch.current = {
      x: t.clientX,
      y: t.clientY,
      horizontal: null,
      timer: setTimeout(() => {
        longPressAt.current = Date.now();
        navigator.vibrate?.(10);
        setSheet(true);
      }, LONG_PRESS_MS),
    };
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = touch.current;
    const t = e.touches[0];
    if (!s || !t) return;
    const mx = t.clientX - s.x;
    const my = t.clientY - s.y;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      if (s.horizontal === null) s.horizontal = Math.abs(mx) > Math.abs(my);
    }
    if (s.horizontal && onReply && !m.pending && !m.failed) setDx(Math.max(0, Math.min(80, mx)));
  };
  const onTouchEnd = () => {
    const s = touch.current;
    if (s?.timer) clearTimeout(s.timer);
    if (dx >= SWIPE_REPLY_PX && onReply) {
      navigator.vibrate?.(10);
      onReply(m);
    }
    setDx(0);
    touch.current = null;
  };

  const big = m.kind === "text" && !m.replyTo && !m.forwarded ? emojiOnlyCount(m.text) : 0;
  // ruimte achter de laatste regel tekst voor tijd + vinkjes (zoals WhatsApp), zodat de bubbel compact blijft
  const metaPx = 34 + (mine ? 16 : 0) + (m.editedAt ? 42 : 0) + (m.auto ? 64 : 0) + (starred ? 14 : 0);
  const textOnly = m.kind === "text" && !big;

  const meta = (
    <span className="flex items-center justify-end gap-1 whitespace-nowrap text-[10px] leading-none text-neutralx-500">
      {starred && (
        <span role="img" aria-label={t.starred} className="text-amber-500">
          ★
        </span>
      )}
      {m.auto && <span className="italic">{t.auto}</span>}
      {m.editedAt ? (
        // edited: the time of the edit, the original send time on hover
        <span title={vulIn(t.sentAt, { tijd: fmtTime(m.at, chat.shared) })}>
          <span className="italic">{t.edited}</span> {fmtTime(m.editedAt, chat.shared)}
        </span>
      ) : (
        fmtTime(m.at, chat.shared)
      )}
      {mine && <Ticks m={m} />}
    </span>
  );

  const hoverBar = (
    <div
      className={`mb-1 items-center gap-0.5 self-center ${pickOpen || menu ? "flex" : "hidden [@media(hover:hover)]:group-hover:flex [@media(hover:hover)]:group-focus-within:flex"}`}
    >
      {onReact && !m.pending && !m.failed && (
        <button
          type="button"
          onClick={() => {
            setMenu(null);
            setPick((v) => (v ? null : direction()));
          }}
          aria-label={t.react}
          aria-expanded={pickOpen}
          className="grid h-7 w-7 place-items-center rounded-full text-neutralx-400 hover:bg-black/5 hover:text-brand-600"
        >
          <IconSmiley className="h-[18px] w-[18px]" />
        </button>
      )}
      {onReply && !m.pending && !m.failed && (
        <button
          type="button"
          onClick={() => onReply(m)}
          className="grid h-7 w-7 place-items-center rounded-full text-neutralx-400 hover:bg-black/5 hover:text-brand-600"
          aria-label={t.replyShort}
        >
          <IconReply className="h-4 w-4" />
        </button>
      )}
      {items.length > 0 && (
        <button
          type="button"
          onClick={() => (menu ? setMenu(null) : openMenu())}
          aria-label={t.moreActions}
          aria-haspopup="menu"
          aria-expanded={Boolean(menu)}
          className="grid h-7 w-7 place-items-center rounded-full text-neutralx-400 hover:bg-black/5 hover:text-brand-600"
        >
          <IconDots className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div
      ref={rowRef}
      className={`group relative flex items-end gap-1.5 [touch-action:pan-y_pinch-zoom] ${mine ? "justify-end" : "justify-start"}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onContextMenu={(e) => {
        // Android: lang drukken geeft een contextmenu; dan ons paneel in plaats van tekst selecteren
        if (!touchDevice() || !fromRow(e.target)) return;
        e.preventDefault();
        if (Date.now() - longPressAt.current > 800) setSheet(true);
      }}
      onClickCapture={(e) => {
        // de tik die bij het lang drukken hoort mag geen link of foto openen
        if (fromRow(e.target) && Date.now() - longPressAt.current < 600) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {/* beantwoorden door te vegen: het pijltje verschijnt links */}
      {dx > 0 && (
        <span
          className="pointer-events-none absolute left-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white text-brand-600 shadow-sm"
          style={{ opacity: Math.min(1, dx / SWIPE_REPLY_PX) }}
          aria-hidden
        >
          <IconReply className="h-4 w-4" />
        </span>
      )}

      {/* klik naast een open menu sluit het */}
      {(pickOpen || menu) && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => {
            setPick(null);
            setMenu(null);
          }}
        />
      )}
      {onReact && pickOpen && (
        <div className={`absolute z-20 rounded-full bg-white shadow-lg ring-1 ring-black/5 ${mine ? "right-2" : "left-9"} ${pick === "down" ? "top-full mt-1" : "bottom-full mb-1"}`}>
          <ReactionRow
            selected={myReaction}
            onPick={(e) => {
              onReact(m, e);
              setPick(null);
            }}
          />
        </div>
      )}
      {menu && (
        <div
          className={`absolute z-20 min-w-[12rem] overflow-hidden rounded-xl bg-white text-sm shadow-lg ring-1 ring-black/5 ${mine ? "right-2" : "left-9"} ${menu === "down" ? "top-full mt-1" : "bottom-full mb-1"}`}
          onKeyDown={(e) => e.key === "Escape" && setMenu(null)}
        >
          <ActionList items={items} onDone={() => setMenu(null)} />
        </div>
      )}
      {sheet && (
        <MessageSheet
          preview={preview}
          items={items}
          {...(onReact && !m.pending && !m.failed ? { reactions: { selected: myReaction, onPick: (e: string) => onReact(m, e) } } : {})}
          onClose={() => setSheet(false)}
        />
      )}

      {!mine && (
        <button
          type="button"
          onClick={() => onAvatarClick?.(m.from)}
          className={`mb-0.5 flex-shrink-0 ${showAvatar ? "" : "invisible"}`}
          aria-label={senderName ? vulIn(t.profileOf, { naam: senderName }) : t.profile}
          tabIndex={showAvatar ? 0 : -1}
        >
          <Avatar userId={m.from} name={senderName ?? "?"} {...(senderRole ? { role: senderRole } : {})} avatars={avatars ?? {}} size={26} />
        </button>
      )}
      {mine && hoverBar}

      <div
        className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"} transition-transform duration-150`}
        style={dx ? { transform: `translateX(${dx}px)`, transitionDuration: "0ms" } : undefined}
      >
        {big ? (
          <div
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === "ContextMenu") && e.target === e.currentTarget && openMenu()}
            className="rounded-xl px-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [@media(hover:none)]:select-none"
          >
            <p className={`leading-tight ${big === 1 ? "text-[3em]" : big === 2 ? "text-[2.5em]" : "text-[2.1em]"}`}>{m.text}</p>
            <div className="mt-0.5 flex justify-end">
              <span className="rounded-full bg-white/80 px-1.5 py-0.5 shadow-sm">{meta}</span>
            </div>
          </div>
        ) : (
          <div
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === "ContextMenu") && e.target === e.currentTarget && openMenu()}
            className={`relative max-w-full rounded-2xl px-2.5 pb-1.5 pt-1.5 text-[0.875em] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [@media(hover:none)]:select-none [-webkit-touch-callout:none] ${
              mine ? "rounded-tr-none bg-[#D9FDD3]" : "rounded-tl-none bg-white"
            } ${m.failed ? "ring-1 ring-crit/40" : ""}`}
          >
            {mine ? (
              <span className="absolute right-[-8px] top-0 h-[13px] w-2 bg-[#D9FDD3] [clip-path:polygon(0_0,0_100%,100%_0)]" aria-hidden />
            ) : (
              <span className="absolute left-[-8px] top-0 h-[13px] w-2 bg-white [clip-path:polygon(100%_0,100%_100%,0_0)]" aria-hidden />
            )}
            {m.forwarded && <p className="mb-0.5 flex items-center gap-1 text-[11px] italic text-neutralx-400">{t.forwarded}</p>}
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
              <button
                type="button"
                onClick={() => m.replyTo && onJumpTo?.(m.replyTo.id)}
                className="mb-1 block w-full rounded-md border-l-4 border-brand-500 bg-black/[0.05] px-2 py-1 text-left text-xs text-neutralx-600 hover:bg-black/[0.08]"
                aria-label={vulIn(t.goToQuoted, { tekst: m.replyTo.excerpt || t.quoteFallback })}
              >
                <span className="line-clamp-2">{m.replyTo.excerpt || t.quoteFallback}</span>
              </button>
            )}

            {m.kind === "image" && mediaUrl &&
              (onOpenImage ? (
                <button type="button" onClick={() => onOpenImage(mediaUrl, m.attachment?.filename ?? t.photoName)} className="mb-1 block overflow-hidden rounded-lg" aria-label={t.viewPhoto}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${mediaUrl}?klein=1`} alt={m.attachment?.filename ?? ""} loading="lazy" className="max-h-72 min-h-[6rem] min-w-[8rem] bg-black/5 object-cover" />
                </button>
              ) : (
                <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-1 block overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${mediaUrl}?klein=1`} alt={m.attachment?.filename ?? ""} loading="lazy" className="max-h-72 min-h-[6rem] min-w-[8rem] bg-black/5 object-cover" />
                </a>
              ))}

            {m.kind === "voice" && mediaUrl && (
              <VoiceNote src={mediaUrl} {...(m.attachment?.durationSec != null ? { durationSec: m.attachment.durationSec } : {})} />
            )}

            {m.kind === "file" && mediaUrl && (
              <a href={`${mediaUrl}?dl=1`} className="flex items-center gap-2.5 rounded-lg bg-black/[0.04] px-2.5 py-2 hover:bg-black/[0.07]">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-500 text-white">📄</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{m.attachment?.filename}</span>
                  <span className="block text-[11px] text-neutralx-500">{m.attachment ? vulIn(t.fileDownload, { grootte: fmtBytes(m.attachment.sizeBytes) }) : ""}</span>
                  {m.attachment && isProgramma(m.attachment.filename) && (
                    <span className="block text-[11px] font-medium text-ink">{t.programWarning}</span>
                  )}
                </span>
              </a>
            )}

            {m.kind === "location" && m.location && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${m.location.lat}&mlon=${m.location.lng}#map=16/${m.location.lat}/${m.location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-lg bg-black/[0.04] px-2.5 py-2 hover:bg-black/[0.07]"
              >
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-500 text-white">📍</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{m.location.label || t.sharedLocation}</span>
                  <span className="block text-[11px] text-neutralx-500">
                    {vulIn(t.openInMap, { coords: `${m.location.lat.toFixed(4)}, ${m.location.lng.toFixed(4)}` })}
                  </span>
                </span>
              </a>
            )}

            {m.kind === "poll" && (
              <PollCard
                question={m.text}
                poll={m.poll}
                mine={mine}
                disabled={Boolean(m.pending || m.failed)}
                {...(myUserId ? { myUserId } : {})}
                {...(names ? { names } : {})}
                {...(onPollVote ? { onVote: (ids: string[]) => onPollVote(m, ids) } : {})}
                {...(onPollClose ? { onClose: () => onPollClose(m) } : {})}
              />
            )}

            {textOnly ? (
              <>
                <p className="whitespace-pre-wrap break-words text-ink">
                  <RichText text={m.text} mine={mine} />
                  <span className="inline-block h-3 align-bottom" style={{ width: metaPx }} aria-hidden />
                </p>
                <span className="absolute bottom-1.5 right-2.5">{meta}</span>
              </>
            ) : (
              <>
                {m.text && m.kind !== "poll" && (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-ink">
                    <RichText text={m.text} mine={mine} />
                  </p>
                )}
                <div className="mt-1">{meta}</div>
              </>
            )}
          </div>
        )}

        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div className={`relative z-[1] -mt-1.5 flex flex-wrap gap-1 ${mine ? "pr-2" : "pl-2"}`}>
            {Object.entries(m.reactions).map(([emoji, users]) => {
              const reacted = myUserId ? users.includes(myUserId) : false;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact?.(m, emoji)}
                  className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] leading-none shadow-sm ring-1 ${reacted ? "bg-brand-50 text-brand-700 ring-brand-300" : "bg-white text-neutralx-600 ring-black/5"}`}
                  aria-label={vulIn(reacted ? t.reactionMine : t.reactionLabel, { aantal: users.length, emoji })}
                >
                  <span>{emoji}</span>
                  {users.length > 1 && <span>{users.length}</span>}
                </button>
              );
            })}
          </div>
        )}

        {m.failed && (
          <p role="alert" className="mt-1 flex flex-wrap items-center justify-end gap-x-2 text-[11px] text-crit">
            <span>{vulIn(t.notSent, { reden: m.failed })}</span>
            {onRetry && (
              <button type="button" onClick={() => onRetry(m)} className="font-semibold underline">
                {t.retry}
              </button>
            )}
            {onDiscard && (
              <button type="button" onClick={() => onDiscard(m)} className="text-neutralx-500 underline">
                {t.discard}
              </button>
            )}
          </p>
        )}
      </div>

      {!mine && hoverBar}
    </div>
  );
}
