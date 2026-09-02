"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { MessageBubble } from "./MessageBubble";
import { Composer, type OutgoingMessage } from "./Composer";
import { UserCard } from "./UserCard";
import { CallOverlay } from "./CallOverlay";
import { PeoplePicker, CommunityCreateModal, CommunityManageModal, ChatSettingsModal } from "./modals";
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

type Tab = "chats" | "contacts" | "communities";
interface SavedContact { userId: string; label?: string; favourite: boolean }
interface CommunityRow { id: string; name: string; threadId: string | null; memberCount: number; myRole: string }

const randId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

export function InboxPage() {
  const [me, setMe] = useState<{ userId: string; name: string; isAdmin: boolean } | null>(null);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [dir, setDir] = useState<Record<string, ChatUser>>({});
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [tab, setTab] = useState<Tab>("chats");

  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);

  const [cardUser, setCardUser] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "chat" | "community-invite">(null);
  const [showCommunityCreate, setShowCommunityCreate] = useState(false);
  const [manageCommunity, setManageCommunity] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const [call, setCall] = useState<null | { threadId: string; callId: string; mode: "audio" | "video" | "screen"; role: "caller" | "callee"; peerName: string }>(null);
  const [incoming, setIncoming] = useState<null | { threadId: string; callId: string; mode: string; fromName: string }>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;
  const lastPing = useRef(0);

  const loadThreads = useCallback(async () => {
    const r = await fetch("/api/inbox", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setMe(d.me);
    setThreads(d.threads);
    setDir((p) => ({ ...p, ...d.directory }));
    setPresence((p) => ({ ...p, ...d.presence }));
    setAvatars((p) => ({ ...p, ...d.avatars }));
    setContacts(d.contacts ?? []);
    setActive((a) => a ?? d.threads[0]?.id ?? null);
  }, []);

  const loadCommunities = useCallback(async () => {
    const r = await fetch("/api/communities", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setCommunities(d.communities ?? []);
    setDir((p) => ({ ...p, ...d.directory }));
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const r = await fetch(`/api/inbox/${id}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setMessages((prev) => {
      const server: Msg[] = d.messages;
      const pending = prev.filter((m) => m.pending && !server.some((s) => s.text === m.text && s.from === m.from && s.kind === m.kind));
      return [...server, ...pending];
    });
    setDir((p) => ({ ...p, ...d.directory }));
    setPresence((p) => ({ ...p, ...d.presence }));
    setAvatars((p) => ({ ...p, ...d.avatars }));
    setQuickReplies(d.settings?.quickReplies ?? []);
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    void loadThreads();
    void loadCommunities();
    const i = setInterval(loadThreads, 8000);
    return () => clearInterval(i);
  }, [loadThreads, loadCommunities]);

  useEffect(() => {
    if (!active) return;
    void loadThread(active);
    const i = setInterval(() => activeRef.current && loadThread(activeRef.current), 3000);
    return () => clearInterval(i);
  }, [active, loadThread]);

  useEffect(() => {
    if (!active) return;
    const i = setInterval(async () => {
      try {
        const r = await fetch(`/api/inbox/${active}/typing`, { cache: "no-store" });
        setTyping(Boolean((await r.json()).typing));
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(i);
  }, [active]);

  // incoming call poll
  useEffect(() => {
    if (!me) return;
    const i = setInterval(async () => {
      if (call) return;
      try {
        const r = await fetch("/api/calls/incoming", { cache: "no-store" });
        if (r.ok) setIncoming((await r.json()).incoming);
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(i);
  }, [call, me]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, active]);

  const otherOf = (t: ThreadRow): { userId: string; name: string; role: string; support: boolean } => {
    if (t.kind === "support") return { userId: "support", name: "ZekerFlex Support", role: "support", support: true };
    if (t.kind === "group") return { userId: t.id, name: t.title || "Community", role: "employer", support: false };
    const id = t.participants.find((p) => p !== me?.userId) ?? t.participants[0]!;
    const u = dir[id];
    return { userId: id, name: u?.name ?? "…", role: u?.role ?? "employer", support: false };
  };
  const activeThread = threads.find((t) => t.id === active) ?? null;

  const pingTyping = () => {
    const n = Date.now();
    if (!active || n - lastPing.current < 3000) return;
    lastPing.current = n;
    fetch(`/api/inbox/${active}/typing`, { method: "POST" }).catch(() => undefined);
  };

  const send = async (msg: OutgoingMessage) => {
    if (!active) return;
    const optimistic: Msg = {
      id: "tmp" + Date.now(),
      from: me?.userId ?? "me",
      at: new Date().toISOString(),
      text: msg.text,
      kind: msg.kind,
      pending: true,
      ...(msg.attachment ? { attachment: msg.attachment } : {}),
      ...(msg.location ? { location: msg.location } : {}),
    };
    setMessages((m) => [...m, optimistic]);
    await fetch(`/api/inbox/${active}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    await loadThread(active);
  };

  const startThreadWith = async (userId: string) => {
    setPicker(null);
    const r = await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: userId, text: "👋" }),
    });
    if (r.ok) {
      const d = await r.json();
      await loadThreads();
      setTab("chats");
      setActive(d.threadId);
    }
  };

  const startSupport = async () => {
    const r = await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ support: true, text: "Hoi, ik heb een vraag." }),
    });
    const d = await r.json();
    if (r.ok) {
      await loadThreads();
      setActive(d.threadId);
    }
  };

  const startCall = (mode: "audio" | "video" | "screen") => {
    if (!activeThread || activeThread.kind !== "direct") return;
    const o = otherOf(activeThread);
    setCall({ threadId: activeThread.id, callId: randId(), mode, role: "caller", peerName: o.name });
  };

  const acceptIncoming = () => {
    if (!incoming) return;
    fetch(`/api/inbox/${incoming.threadId}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: incoming.callId, type: "accept", mode: incoming.mode }),
    }).catch(() => undefined);
    setCall({
      threadId: incoming.threadId,
      callId: incoming.callId,
      mode: incoming.mode as "audio" | "video" | "screen",
      role: "callee",
      peerName: incoming.fromName,
    });
    setIncoming(null);
  };
  const declineIncoming = () => {
    if (!incoming) return;
    fetch(`/api/inbox/${incoming.threadId}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: incoming.callId, type: "decline", mode: incoming.mode }),
    }).catch(() => undefined);
    setIncoming(null);
  };

  const headerPresence = activeThread && activeThread.kind === "direct"
    ? lastSeenLabel(presence[otherOf(activeThread).userId])
    : activeThread?.kind === "group"
      ? `${activeThread.participants.length} leden`
      : "";

  return (
    <div className="chat-surface grid h-[calc(100vh-15rem)] grid-cols-[minmax(0,20rem)_1fr] overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
      {/* ─── left pane ─── */}
      <div className="flex flex-col border-r border-hair">
        <div className="flex items-center gap-2 border-b border-hair px-3 py-2.5">
          <p className="font-display text-sm font-bold text-ink">Berichten</p>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setPicker("chat")} className="grid h-8 w-8 place-items-center rounded-lg text-neutralx-500 hover:bg-paper-soft" aria-label="Nieuw gesprek">✎</button>
            <button type="button" onClick={() => setShowSettings(true)} className="grid h-8 w-8 place-items-center rounded-lg text-neutralx-500 hover:bg-paper-soft" aria-label="Instellingen">⚙</button>
          </div>
        </div>

        <div className="flex border-b border-hair text-xs font-medium">
          {(["chats", "contacts", "communities"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2 ${tab === t ? "border-b-2 border-brand-500 text-brand-700" : "text-neutralx-500"}`}
            >
              {t === "chats" ? "Gesprekken" : t === "contacts" ? "Contacten" : "Communities"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "chats" && (
            <>
              <button type="button" onClick={startSupport} className="w-full px-4 py-2 text-left text-xs font-semibold text-brand-600 hover:bg-paper-soft">
                + ZekerFlex Support
              </button>
              {threads.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen gesprekken.</p>
              ) : (
                <ul className="divide-y divide-hair">
                  {threads.map((t) => {
                    const o = otherOf(t);
                    const pres = presence[o.userId];
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setActive(t.id)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left ${active === t.id ? "bg-brand-50" : "hover:bg-paper-soft"}`}
                        >
                          <Avatar userId={o.userId} name={o.name} role={o.role} avatars={avatars} size={40} support={o.support} online={t.kind === "direct" ? pres?.online ?? false : undefined} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold text-ink">{o.name}</span>
                              <span className="flex-shrink-0 text-[10px] text-neutralx-400">{t.lastMessage ? fmtTime(t.lastMessage.at) : ""}</span>
                            </span>
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs text-neutralx-500">
                                {t.lastMessage ? (t.lastMessage.from === me?.userId ? "Jij: " : "") + t.lastMessage.text : t.shiftTitle ?? "—"}
                              </span>
                              {t.unread > 0 && (
                                <span className="grid h-4 min-w-4 flex-shrink-0 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{t.unread}</span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {tab === "contacts" && (
            <ul className="divide-y divide-hair">
              {contacts.length === 0 && <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen opgeslagen contacten. Klik op iemand in een gesprek om ze op te slaan.</p>}
              {contacts.map((c) => {
                const u = dir[c.userId];
                return (
                  <li key={c.userId}>
                    <button type="button" onClick={() => startThreadWith(c.userId)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-soft">
                      <Avatar userId={c.userId} name={u?.name ?? "…"} role={u?.role ?? "employer"} avatars={avatars} size={40} online={presence[c.userId]?.online ?? false} />
                      <span className="min-w-0 flex-1">
                        <span className="truncate text-sm font-semibold text-ink">{c.favourite ? "★ " : ""}{u?.name ?? "Onbekend"}</span>
                        <span className="block truncate text-xs text-neutralx-500">{c.label || u?.meta || ""}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {tab === "communities" && (
            <>
              <button type="button" onClick={() => setShowCommunityCreate(true)} className="w-full px-4 py-2.5 text-left text-xs font-semibold text-brand-600 hover:bg-paper-soft">
                + Nieuwe community
              </button>
              <ul className="divide-y divide-hair">
                {communities.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => { if (c.threadId) { setTab("chats"); setActive(c.threadId); void loadThreads(); } }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-soft">
                      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-brand-500 text-sm font-bold text-white">{c.name.slice(0, 2).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                        <span className="block truncate text-xs text-neutralx-500">{c.memberCount} leden · {c.myRole === "owner" ? "eigenaar" : c.myRole}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {communities.length === 0 && <p className="px-5 py-8 text-center text-sm text-neutralx-400">Maak je eigen community en nodig freelancers uit.</p>}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ─── conversation ─── */}
      {!activeThread ? (
        <div className="grid place-items-center text-sm text-neutralx-400">Kies een gesprek</div>
      ) : (
        <div className="flex flex-col">
          <div className="flex items-center gap-3 border-b border-hair px-4 py-2.5">
            <Avatar userId={otherOf(activeThread).userId} name={otherOf(activeThread).name} role={otherOf(activeThread).role} avatars={avatars} size={38} support={otherOf(activeThread).support} />
            <button type="button" onClick={() => activeThread.kind === "direct" && setCardUser(otherOf(activeThread).userId)} className="min-w-0 text-left">
              <p className="truncate text-sm font-semibold text-ink">{otherOf(activeThread).name}</p>
              <p className="truncate text-xs text-neutralx-400">{typing ? "aan het typen…" : activeThread.shiftTitle ?? headerPresence}</p>
            </button>
            {activeThread.kind === "direct" && (
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => startCall("audio")} className="grid h-9 w-9 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft" aria-label="Bellen">📞</button>
                <button type="button" onClick={() => startCall("video")} className="grid h-9 w-9 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft" aria-label="Videobellen">📹</button>
                <button type="button" onClick={() => startCall("screen")} className="grid h-9 w-9 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft" aria-label="Scherm delen">🖥️</button>
                <button type="button" onClick={() => setCardUser(otherOf(activeThread).userId)} className="grid h-9 w-9 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft" aria-label="Profiel">ⓘ</button>
              </div>
            )}
            {activeThread.kind === "group" && activeThread.communityId && (
              <button
                type="button"
                onClick={() => setManageCommunity(activeThread.communityId!)}
                className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-paper-soft"
              >
                Beheer
              </button>
            )}
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-1.5 overflow-y-auto bg-paper-soft px-5 py-4"
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
            {typing && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">
                  <span className="flex gap-1">
                    <Dot /><Dot d="0.15s" /><Dot d="0.3s" />
                  </span>
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
        </div>
      )}

      {/* ─── overlays ─── */}
      {cardUser && (
        <UserCard
          userId={cardUser}
          onClose={() => setCardUser(null)}
          onMessage={(uid) => { setCardUser(null); void startThreadWith(uid); }}
          onCall={(uid, mode) => {
            setCardUser(null);
            void startThreadWith(uid).then(() => setTimeout(() => startCall(mode), 400));
          }}
        />
      )}
      {picker === "chat" && <PeoplePicker title="Nieuw gesprek" cta="Bericht" onClose={() => setPicker(null)} onPick={startThreadWith} />}
      {showCommunityCreate && (
        <CommunityCreateModal
          onClose={() => setShowCommunityCreate(false)}
          onCreated={(_id, threadId) => {
            setShowCommunityCreate(false);
            void loadCommunities();
            void loadThreads();
            if (threadId) { setTab("chats"); setActive(threadId); }
          }}
        />
      )}
      {manageCommunity && (
        <CommunityManageModal
          communityId={manageCommunity}
          onClose={() => setManageCommunity(null)}
          onChanged={() => { void loadCommunities(); void loadThreads(); if (active) void loadThread(active); }}
        />
      )}
      {showSettings && <ChatSettingsModal onClose={() => { setShowSettings(false); if (active) void loadThread(active); }} />}

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
          <div className="fixed bottom-6 left-1/2 z-[78] flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-ink px-5 py-3 text-white shadow-lift">
            <span className="text-sm">
              <span className="font-semibold">{incoming.fromName}</span> belt je{incoming.mode === "video" ? " (video)" : ""}…
            </span>
            <button type="button" onClick={declineIncoming} className="rounded-full bg-white/15 px-3 py-1 text-sm">Weiger</button>
            <button type="button" onClick={acceptIncoming} className="rounded-full bg-brand-mint px-3 py-1 text-sm font-semibold text-ink">Opnemen</button>
          </div>
        </Portal>
      )}
    </div>
  );
}

function Dot({ d = "0s" }: { d?: string }) {
  return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutralx-400" style={{ animationDelay: d }} />;
}
