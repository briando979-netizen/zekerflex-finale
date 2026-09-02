"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Avatar } from "./Avatar";
import { MessageBubble } from "./MessageBubble";
import { Composer, type OutgoingMessage } from "./Composer";
import { UserCard } from "./UserCard";
import { CallOverlay } from "./CallOverlay";
import { Portal } from "./Portal";
import {
  dayLabel,
  fmtTime,
  lastSeenLabel,
  type ChatUser,
  type Msg,
  type Presence,
  type ThreadRow,
} from "./shared";

const randId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

export function ChatDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{ userId: string; name: string; isAdmin: boolean } | null>(null);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [dir, setDir] = useState<Record<string, ChatUser>>({});
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [theirTyping, setTheirTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [available, setAvailable] = useState(true);
  const [cardUser, setCardUser] = useState<string | null>(null);

  const [call, setCall] = useState<null | { threadId: string; callId: string; mode: "audio" | "video" | "screen"; role: "caller" | "callee"; peerName: string }>(null);
  const [incoming, setIncoming] = useState<null | { threadId: string; callId: string; mode: string; fromName: string }>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTypingPing = useRef(0);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;

  const loadThreads = useCallback(async () => {
    try {
      const r = await fetch("/api/inbox", { cache: "no-store" });
      if (r.status === 401) return setAvailable(false);
      if (!r.ok) return;
      const d = await r.json();
      setMe(d.me);
      setThreads(d.threads);
      setDir(d.directory);
      setPresence(d.presence ?? {});
      setAvatars(d.avatars ?? {});
      setTotalUnread(d.totalUnread);
    } catch {
      /* ignore */
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/inbox/${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setMessages((prev) => {
        const server: Msg[] = d.messages;
        const pending = prev.filter((m) => m.pending && !server.some((s) => s.text === m.text && s.from === m.from && s.kind === m.kind));
        return [...server, ...pending];
      });
      setDir((prev) => ({ ...prev, ...d.directory }));
      setPresence((prev) => ({ ...prev, ...d.presence }));
      setAvatars((prev) => ({ ...prev, ...d.avatars }));
      setQuickReplies(d.settings?.quickReplies ?? []);
      void loadThreads();
    } catch {
      /* ignore */
    }
  }, [loadThreads]);

  // open via global event
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      setOpen(true);
      try {
        if (detail.threadId) return setActive(detail.threadId);
        let body: Record<string, unknown> | null = null;
        if (detail.support) body = { support: true, text: detail.text ?? "Hallo, ik heb een vraag." };
        else if (detail.shiftId) body = { shiftId: detail.shiftId, text: detail.text ?? "Hallo, ik heb een vraag over deze klus." };
        else if (detail.toUserId) body = { toUserId: detail.toUserId, text: detail.text ?? "Hallo!" };
        if (!body) return;
        const r = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = await r.json();
        if (r.ok && d.threadId) {
          await loadThreads();
          setActive(d.threadId);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("zf:chat", handler as EventListener);
    return () => window.removeEventListener("zf:chat", handler as EventListener);
  }, [loadThreads]);

  useEffect(() => {
    void loadThreads();
    const id = setInterval(loadThreads, 8000);
    return () => clearInterval(id);
  }, [loadThreads]);

  useEffect(() => {
    if (!active) return;
    void loadThread(active);
    const id = setInterval(() => activeRef.current && void loadThread(activeRef.current), 3000);
    return () => clearInterval(id);
  }, [active, loadThread]);

  useEffect(() => {
    if (!active) return setTheirTyping(false);
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/inbox/${active}/typing`, { cache: "no-store" });
        setTheirTyping(Boolean((await r.json()).typing));
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [active]);

  // incoming call poll (dock is always mounted on dashboards)
  useEffect(() => {
    if (!available || !me) return;
    const id = setInterval(async () => {
      if (call) return;
      try {
        const r = await fetch("/api/calls/incoming", { cache: "no-store" });
        if (r.status === 401) return setAvailable(false);
        if (r.ok) setIncoming((await r.json()).incoming);
      } catch {
        /* ignore */
      }
    }, 3500);
    return () => clearInterval(id);
  }, [call, available, me]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, theirTyping, active]);

  const otherOf = (t: ThreadRow) => {
    if (t.kind === "support") return { userId: "support", name: "ZekerFlex Support", role: "support", support: true };
    if (t.kind === "group") return { userId: t.id, name: t.title || "Community", role: "employer", support: false };
    const id = t.participants.find((p) => p !== me?.userId) ?? t.participants[0]!;
    const u = dir[id];
    return { userId: id, name: u?.name ?? "Onbekend", role: u?.role ?? "employer", support: false };
  };
  const activeThread = threads.find((t) => t.id === active) ?? null;

  const pingTyping = () => {
    const now = Date.now();
    if (!active || now - lastTypingPing.current < 3000) return;
    lastTypingPing.current = now;
    fetch(`/api/inbox/${active}/typing`, { method: "POST" }).catch(() => undefined);
  };

  const send = async (msg: OutgoingMessage) => {
    if (!active) return;
    setMessages((m) => [
      ...m,
      {
        id: "tmp-" + Date.now(),
        from: me?.userId ?? "me",
        at: new Date().toISOString(),
        text: msg.text,
        kind: msg.kind,
        pending: true,
        ...(msg.attachment ? { attachment: msg.attachment } : {}),
        ...(msg.location ? { location: msg.location } : {}),
      },
    ]);
    await fetch(`/api/inbox/${active}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msg) });
    await loadThread(active);
  };

  const startSupport = async () => {
    const r = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ support: true, text: "Hoi, ik heb een vraag." }) });
    const d = await r.json();
    if (r.ok && d.threadId) {
      await loadThreads();
      setActive(d.threadId);
    }
  };

  const startCall = (mode: "audio" | "video" | "screen") => {
    if (!activeThread || activeThread.kind !== "direct") return;
    setCall({ threadId: activeThread.id, callId: randId(), mode, role: "caller", peerName: otherOf(activeThread).name });
  };

  const acceptIncoming = () => {
    if (!incoming) return;
    setOpen(true);
    fetch(`/api/inbox/${incoming.threadId}/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId: incoming.callId, type: "accept", mode: incoming.mode }) }).catch(() => undefined);
    setCall({ threadId: incoming.threadId, callId: incoming.callId, mode: incoming.mode as "audio" | "video" | "screen", role: "callee", peerName: incoming.fromName });
    setIncoming(null);
  };
  const declineIncoming = () => {
    if (!incoming) return;
    fetch(`/api/inbox/${incoming.threadId}/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId: incoming.callId, type: "decline", mode: incoming.mode }) }).catch(() => undefined);
    setIncoming(null);
  };

  // The dedicated inbox pages show the full conversation UI (but calls still work there).
  const hideDock = pathname?.endsWith("/berichten");
  if (!available) return null;

  return (
    <>
      {!hideDock && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-5 right-5 z-[55] flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lift transition-transform hover:scale-105"
          aria-label={open ? "Chat sluiten" : "Chat openen"}
        >
          {open ? <span className="text-xl">✕</span> : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5v-9Z" fill="currentColor" />
            </svg>
          )}
          {totalUnread > 0 && !open && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-crit px-1 text-[10px] font-bold text-white">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </button>
      )}

      {open && !hideDock && (
        <div className="chat-surface fixed bottom-24 right-5 z-[55] flex h-[min(34rem,calc(100vh-8rem))] w-[calc(100vw-2.5rem)] max-w-[24rem] flex-col overflow-hidden rounded-2xl border border-hairstrong bg-white shadow-lift animate-slide-up-fade">
          {!activeThread ? (
            <>
              <div className="flex items-center justify-between border-b border-hair bg-brand-500 px-4 py-3 text-white">
                <div>
                  <p className="font-display text-sm font-bold">Berichten</p>
                  <p className="text-[11px] text-white/70">{me?.name}</p>
                </div>
                <button type="button" onClick={startSupport} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/25">+ Support</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {threads.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-neutralx-500">
                    <p className="font-medium text-ink">Nog geen gesprekken</p>
                    <p className="mt-1">Chat met een opdrachtgever vanaf een klus, of met ZekerFlex Support.</p>
                    <button type="button" onClick={startSupport} className="btn-primary mt-4 text-sm">Start met Support</button>
                  </div>
                ) : (
                  <ul className="divide-y divide-hair">
                    {threads.map((t) => {
                      const o = otherOf(t);
                      return (
                        <li key={t.id}>
                          <button type="button" onClick={() => setActive(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-soft">
                            <Avatar userId={o.userId} name={o.name} role={o.role} avatars={avatars} size={40} support={o.support} online={t.kind === "direct" ? presence[o.userId]?.online ?? false : undefined} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-semibold text-ink">{o.name}</span>
                                <span className="flex-shrink-0 text-[10px] text-neutralx-400">{t.lastMessage ? fmtTime(t.lastMessage.at) : ""}</span>
                              </span>
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs text-neutralx-500">
                                  {t.lastMessage ? (t.lastMessage.from === me?.userId ? "Jij: " : "") + t.lastMessage.text : t.shiftTitle ?? "Nieuw gesprek"}
                                </span>
                                {t.unread > 0 && <span className="grid h-4 min-w-4 flex-shrink-0 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{t.unread}</span>}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 border-b border-hair bg-brand-500 px-3 py-2 text-white">
                <button type="button" onClick={() => { setActive(null); setReplyTo(null); }} aria-label="Terug" className="text-lg leading-none">‹</button>
                <Avatar userId={otherOf(activeThread).userId} name={otherOf(activeThread).name} role={otherOf(activeThread).role} avatars={avatars} size={30} support={otherOf(activeThread).support} />
                <button type="button" onClick={() => activeThread.kind === "direct" && setCardUser(otherOf(activeThread).userId)} className="min-w-0 flex-1 text-left leading-tight">
                  <p className="truncate text-sm font-semibold">{otherOf(activeThread).name}</p>
                  <p className="truncate text-[11px] text-white/70">
                    {theirTyping ? "aan het typen…" : activeThread.kind === "direct" ? lastSeenLabel(presence[otherOf(activeThread).userId]) : activeThread.shiftTitle ?? ""}
                  </p>
                </button>
                {activeThread.kind === "direct" && (
                  <>
                    <button type="button" onClick={() => startCall("audio")} aria-label="Bellen" className="text-base">📞</button>
                    <button type="button" onClick={() => startCall("video")} aria-label="Videobellen" className="text-base">📹</button>
                  </>
                )}
              </div>

              <div
                ref={scrollRef}
                className="flex-1 space-y-1.5 overflow-y-auto bg-paper-soft px-3 py-3"
                style={{ backgroundImage: "radial-gradient(rgba(12,14,18,0.03) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
              >
                {messages.map((m, i) => {
                  const mine = Boolean(me && m.from === me.userId);
                  const showDay = i === 0 || dayLabel(messages[i - 1]!.at) !== dayLabel(m.at);
                  const showSender = activeThread.kind === "group" || activeThread.kind === "support";
                  const next = messages[i + 1];
                  const lastOfRun = !next || next.from !== m.from || next.kind === "system";
                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div className="my-2 flex justify-center">
                          <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[10px] font-medium text-neutralx-500">{dayLabel(m.at)}</span>
                        </div>
                      )}
                      <MessageBubble
                        m={m}
                        mine={mine}
                        threadId={activeThread.id}
                        {...(!mine && dir[m.from]?.name ? { senderName: dir[m.from]!.name } : {})}
                        {...(!mine && dir[m.from]?.role ? { senderRole: dir[m.from]!.role } : {})}
                        showSender={showSender}
                        showAvatar={!mine && lastOfRun}
                        avatars={avatars}
                        onReply={setReplyTo}
                        onAvatarClick={setCardUser}
                      />
                    </div>
                  );
                })}
                {theirTyping && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">
                      <span className="flex gap-1"><Dot /><Dot d="0.15s" /><Dot d="0.3s" /></span>
                    </div>
                  </div>
                )}
              </div>

              <Composer
                threadId={activeThread.id}
                quickReplies={quickReplies}
                replyTo={replyTo}
                onClearReply={() => setReplyTo(null)}
                onSend={send}
                onTyping={pingTyping}
              />
            </>
          )}
        </div>
      )}

      {cardUser && (
        <UserCard
          userId={cardUser}
          onClose={() => setCardUser(null)}
          onMessage={(uid) => {
            setCardUser(null);
            window.dispatchEvent(new CustomEvent("zf:chat", { detail: { toUserId: uid } }));
          }}
          onCall={(uid, mode) => {
            setCardUser(null);
            window.dispatchEvent(new CustomEvent("zf:chat", { detail: { toUserId: uid } }));
            setTimeout(() => startCall(mode), 500);
          }}
        />
      )}

      {call && (
        <CallOverlay
          threadId={call.threadId}
          callId={call.callId}
          mode={call.mode}
          role={call.role}
          peerName={call.peerName}
          onEnd={() => { setCall(null); if (active) void loadThread(active); }}
        />
      )}
      {incoming && !call && (
        <Portal>
          <div className="fixed bottom-6 left-1/2 z-[78] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-ink px-5 py-3 text-white shadow-lift">
            <span className="text-sm"><span className="font-semibold">{incoming.fromName}</span> belt je{incoming.mode === "video" ? " (video)" : ""}…</span>
            <button type="button" onClick={declineIncoming} className="rounded-full bg-white/15 px-3 py-1 text-sm">Weiger</button>
            <button type="button" onClick={acceptIncoming} className="rounded-full bg-brand-mint px-3 py-1 text-sm font-semibold text-ink">Opnemen</button>
          </div>
        </Portal>
      )}
    </>
  );
}

function Dot({ d = "0s" }: { d?: string }) {
  return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutralx-400" style={{ animationDelay: d }} />;
}
