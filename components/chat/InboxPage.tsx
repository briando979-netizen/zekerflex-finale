"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { MessageBubble } from "./MessageBubble";
import { Composer, type OutgoingMessage } from "./Composer";
import { UserCard } from "./UserCard";
import { PeoplePicker, CommunityCreateModal, CommunityManageModal, ChatSettingsModal } from "./modals";
import { PushToggle } from "@/components/app/PushToggle";
import { SwipeRow, ThreadMenuSheet, PinModal, type MenuAction } from "./ThreadMenu";
import { ChatSettingsPanel, readLook, type ChatLook } from "./ChatSettingsPanel";
import { Portal } from "./Portal";
import { BrainChat } from "@/components/brain/BrainChat";
import {
  dayLabel,
  fmtTime,
  lastSeenLabel,
  type ChatUser,
  type Msg,
  type Presence,
  type ThreadRow,
} from "./shared";

type Tab = "chats" | "updates" | "calls" | "tools" | "settings";
interface SavedContact { userId: string; label?: string; favourite: boolean }
interface CommunityRow { id: string; name: string; threadId: string | null; memberCount: number; myRole: string }

/** Tells the server this tab is in view, so it doesn't also push the messages it shows. */
const visibleQuery = () => (document.visibilityState === "visible" ? "?visible=1" : "");

export function InboxPage({
  mobileHeight = "h-[calc(100dvh-12rem)]",
  desktopHeight = "md:h-[calc(100vh-15rem)]",
}: {
  /** Tailwind height class below md, where the inbox is one pane at a time (the shell's chrome differs per area) */
  mobileHeight?: string;
  /** Tailwind md: height class — the employer shell has more chrome above the chat than the freelancer app */
  desktopHeight?: string;
} = {}) {
  const [me, setMe] = useState<{ userId: string; name: string; isAdmin: boolean } | null>(null);
  // Below md there's room for one pane: the list, or the open conversation (WhatsApp-style).
  const [pane, setPane] = useState<"list" | "conversation">("list");
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
  const [showBrain, setShowBrain] = useState(false);
  // per-user chat settings: archive, mute, lock (PIN), favourites, lists, block
  const [chatPrefs, setChatPrefs] = useState<{ lists: string[]; hasPin: boolean; lockedCount: number; pinOk: boolean; blocked: string[] }>({
    lists: [],
    hasPin: false,
    lockedCount: 0,
    pinOk: false,
    blocked: [],
  });
  const [view, setView] = useState<"main" | "archived" | "locked">("main");
  const [filter, setFilter] = useState<string>("all");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pinAsk, setPinAsk] = useState<null | { mode: "set" | "unlock"; then?: () => void }>(null);
  const pinRef = useRef<string | null>(null);
  // look & feel chosen in Instellingen → Chats (this browser only)
  const [look, setLook] = useState<ChatLook>({ font: "m", wallpaper: "dots" });
  useEffect(() => {
    setLook(readLook());
    const on = (e: Event) => setLook((e as CustomEvent<ChatLook>).detail);
    window.addEventListener("zf:chat-look", on);
    return () => window.removeEventListener("zf:chat-look", on);
  }, []);
  const pinHeaders = (): Record<string, string> => (pinRef.current ? { "x-chat-pin": pinRef.current } : {});
  // WhatsApp-style tabs: updates (ZekerFlex meldingen) and call history
  const [updates, setUpdates] = useState<{ id: string; kind: string; title: string; body: string; href: string; at: string; urgent: boolean }[] | null>(null);
  const [calls, setCalls] = useState<{ threadId: string; peerUserId: string; at: string; mode: string; status: string; outgoing: boolean; durationSec: number | null }[] | null>(null);
  useEffect(() => {
    if (tab === "updates") {
      fetch("/api/me/notifications", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setUpdates(d.items ?? []))
        .catch(() => setUpdates([]));
    }
    if (tab === "calls") {
      fetch("/api/inbox/calls", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setCalls(d.calls ?? []);
          setDir((p) => ({ ...p, ...d.directory }));
        })
        .catch(() => setCalls([]));
    }
  }, [tab]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;
  const lastPing = useRef(0);

  const loadThreads = useCallback(async () => {
    const r = await fetch(`/api/inbox${visibleQuery()}`, { cache: "no-store", headers: pinHeaders() });
    if (!r.ok) return;
    const d = await r.json();
    setMe(d.me);
    setThreads(d.threads);
    if (d.chatPrefs) setChatPrefs(d.chatPrefs);
    setDir((p) => ({ ...p, ...d.directory }));
    setPresence((p) => ({ ...p, ...d.presence }));
    setAvatars((p) => ({ ...p, ...d.avatars }));
    setContacts(d.contacts ?? []);
    setActive((a) => {
      if (a) return a;
      // ?thread= comes from a call/message notification
      const wanted = new URLSearchParams(window.location.search).get("thread");
      const rows: ThreadRow[] = d.threads;
      return (wanted && rows.some((t) => t.id === wanted) ? wanted : null) ?? rows[0]?.id ?? null;
    });
  }, []);

  const loadCommunities = useCallback(async () => {
    const r = await fetch("/api/communities", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setCommunities(d.communities ?? []);
    setDir((p) => ({ ...p, ...d.directory }));
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const r = await fetch(`/api/inbox/${id}${visibleQuery()}`, { cache: "no-store", headers: pinHeaders() });
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

  // opened from a call/message notification: straight into that conversation
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("thread")) setPane("conversation");
  }, []);

  const openThread = (id: string) => {
    setActive(id);
    setPane("conversation");
  };

  useEffect(() => {
    if (!active) return;
    setMessages([]);
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

  // the call log line shows up right away instead of on the next poll
  useEffect(() => {
    const onEnded = (e: Event) => {
      const t = (e as CustomEvent<{ threadId: string }>).detail?.threadId;
      if (t && t === activeRef.current) void loadThread(t);
    };
    window.addEventListener("zf:call-ended", onEnded);
    return () => window.removeEventListener("zf:call-ended", onEnded);
  }, [loadThread]);

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

  const doAction = async (threadId: string, a: MenuAction): Promise<void> => {
    if (a.action === "lock" && !chatPrefs.hasPin) {
      setPinAsk({ mode: "set", then: () => void doAction(threadId, a) });
      return;
    }
    const r = await fetch(`/api/inbox/${threadId}/prefs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      window.alert(d?.error?.message ?? "Dat lukte niet.");
      return;
    }
    if ((a.action === "delete" || a.action === "lock" || a.action === "archive") && active === threadId) {
      setActive(null);
      setPane("list");
    }
    await loadThreads();
    if (active === threadId && a.action !== "delete") void loadThread(threadId);
  };

  const listed = threads
    .filter((t) => (view === "locked" ? t.locked : view === "archived" ? t.archived && !t.locked : !t.archived && !t.locked))
    .filter(
      (t) =>
        filter === "all" ||
        (filter === "unread" && t.unread > 0) ||
        (filter === "fav" && t.favorite) ||
        (filter.startsWith("list:") && t.lists?.includes(filter.slice(5))),
    );
  const archivedCount = threads.filter((t) => t.archived && !t.locked).length;
  const menuThread = menuFor ? (threads.find((t) => t.id === menuFor) ?? null) : null;

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
      openThread(d.threadId);
    }
  };

  const startSupport = async () => {
    // Already talking to Support → just open that conversation (this used to post
    // "Hoi, ik heb een vraag." again on every click).
    const existing = threads.find((t) => t.kind === "support");
    if (existing) {
      setTab("chats");
      openThread(existing.id);
      return;
    }
    const r = await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ support: true, text: "Hoi, ik heb een vraag." }),
    });
    const d = await r.json();
    if (r.ok) {
      await loadThreads();
      openThread(d.threadId);
    }
  };

  // The layout's ChatDock owns calls (ringing, the call screen); this only asks it to dial.
  const startCall = (mode: "audio" | "video" | "screen") => {
    if (!activeThread || activeThread.kind !== "direct") return;
    const o = otherOf(activeThread);
    window.dispatchEvent(
      new CustomEvent("zf:call", {
        detail: { threadId: activeThread.id, mode, peerName: o.name, peerUserId: o.userId, peerRole: o.role },
      }),
    );
  };

  const headerPresence = activeThread && activeThread.kind === "direct"
    ? lastSeenLabel(presence[otherOf(activeThread).userId])
    : activeThread?.kind === "group"
      ? `${activeThread.participants.length} leden`
      : "";

  return (
    // One column with a fixed height: the push banner takes what it needs and
    // the chat gets the rest — so the composer never slides under the bottom
    // tab bar on a phone (the banner used to come on top of the chat height).
    <div className={`flex ${mobileHeight} min-h-[26rem] flex-col gap-3 ${desktopHeight}`}>
    <div className="flex-shrink-0 empty:hidden">
      <PushToggle variant="banner" />
    </div>
    <div className="chat-surface grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-hair bg-white shadow-card md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {/* ─── left pane ─── */}
      <div className={`${pane === "conversation" && activeThread ? "hidden md:flex" : "flex"} min-h-0 flex-col border-hair md:border-r`}>
        <div className="flex items-center gap-2 border-b border-hair px-3 py-2.5">
          <p className="font-display text-base font-bold text-ink">{{ chats: "Chats", updates: "Updates", calls: "Oproepen", tools: "Tools", settings: "Instellingen" }[tab]}</p>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setPicker("chat")} className="grid h-8 w-8 place-items-center rounded-lg text-neutralx-500 hover:bg-paper-soft" aria-label="Nieuw gesprek">✎</button>
            <button type="button" onClick={() => setShowSettings(true)} className="grid h-8 w-8 place-items-center rounded-lg text-neutralx-500 hover:bg-paper-soft" aria-label="Instellingen">⚙</button>
          </div>
        </div>


        <div className="flex-1 overflow-y-auto">
          {tab === "chats" && (
            <>
              <button type="button" onClick={startSupport} className="w-full px-4 py-2 text-left text-xs font-semibold text-brand-600 hover:bg-paper-soft">
                + ZekerFlex Support
              </button>
              {view !== "main" ? (
                <button
                  type="button"
                  onClick={() => {
                    if (view === "locked") {
                      pinRef.current = null;
                      void loadThreads();
                    }
                    setView("main");
                  }}
                  className="flex w-full items-center gap-2 border-b border-hair px-4 py-2.5 text-left text-sm font-semibold text-ink hover:bg-paper-soft"
                >
                  ‹ {view === "archived" ? "Gearchiveerd" : "Vergrendelde chats"}
                </button>
              ) : (
                <>
                  {chatPrefs.lockedCount > 0 && (
                    <button type="button" onClick={() => setPinAsk({ mode: "unlock" })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink hover:bg-paper-soft">
                      <span className="w-10 text-center">🔒</span>Vergrendelde chats <span className="ml-auto text-xs text-neutralx-400">{chatPrefs.lockedCount}</span>
                    </button>
                  )}
                  {archivedCount > 0 && (
                    <button type="button" onClick={() => setView("archived")} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink hover:bg-paper-soft">
                      <span className="w-10 text-center">🗄</span>Gearchiveerd <span className="ml-auto text-xs text-neutralx-400">{archivedCount}</span>
                    </button>
                  )}
                  <div className="flex gap-1.5 overflow-x-auto px-3 py-2">
                    {[["all", "Alle"], ["unread", "Ongelezen"], ["fav", "Favorieten"], ...chatPrefs.lists.map((l) => [`list:${l}`, l])].map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setFilter(k!)}
                        className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium ${filter === k ? "bg-brand-500 text-white" : "bg-paper-soft text-neutralx-600"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {listed.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-neutralx-400">{threads.length === 0 ? "Nog geen gesprekken." : "Geen gesprekken hier."}</p>
              ) : (
                <ul className="divide-y divide-hair">
                  {listed.map((t) => {
                    const o = otherOf(t);
                    const pres = presence[o.userId];
                    return (
                      <li key={t.id}>
                        <SwipeRow archived={Boolean(t.archived)} onArchive={() => void doAction(t.id, { action: t.archived ? "unarchive" : "archive" })} onMore={() => setMenuFor(t.id)}>
                        <div className="group relative">
                        <button
                          type="button"
                          onClick={() => openThread(t.id)}
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
                              <span className="flex flex-shrink-0 items-center gap-1">
                                {t.favorite && <span className="text-[10px] text-amber-500">★</span>}
                                {t.muted && <span className="text-[10px]" title="Gedempt">🔕</span>}
                                {t.unread > 0 && (
                                  <span className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white ${t.muted ? "bg-neutralx-400" : "bg-brand-500"}`}>{t.unread}</span>
                                )}
                              </span>
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMenuFor(t.id)}
                          className="absolute right-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white text-neutralx-500 shadow-sm hover:text-ink md:group-hover:grid"
                          aria-label="Meer opties"
                        >
                          ⋯
                        </button>
                        </div>
                        </SwipeRow>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {tab === "tools" && (
            <div className="border-b border-hair">
              <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutralx-400">Tools</p>
              <button type="button" onClick={() => setShowBrain(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink hover:bg-paper-soft">
                <span className="w-8 text-center text-lg">✨</span>
                <span>
                  ZekerFlex-assistent
                  <span className="block text-xs text-neutralx-500">Vraag naar je klussen, uren, uitbetalingen of hoe iets werkt</span>
                </span>
              </button>
              <button type="button" onClick={() => setShowSettings(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink hover:bg-paper-soft">
                <span className="w-8 text-center text-lg">⚡</span>
                <span>
                  Snelle antwoorden &amp; afwezig-bericht
                  <span className="block text-xs text-neutralx-500">Vaste antwoorden en een automatisch bericht als je niet bereikbaar bent</span>
                </span>
              </button>
              <button type="button" onClick={() => setPicker("chat")} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink hover:bg-paper-soft">
                <span className="w-8 text-center text-lg">✎</span>Nieuw gesprek
              </button>
              <button type="button" onClick={() => { setTab("chats"); void startSupport(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink hover:bg-paper-soft">
                <span className="w-8 text-center text-lg">🛟</span>Chat met ZekerFlex Support
              </button>
              <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutralx-400">Contacten</p>
            </div>
          )}
          {tab === "tools" && (
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

          {tab === "tools" && (
            <>
              <p className="border-t border-hair px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutralx-400">Communities</p>
              <button type="button" onClick={() => setShowCommunityCreate(true)} className="w-full px-4 py-2.5 text-left text-xs font-semibold text-brand-600 hover:bg-paper-soft">
                + Nieuwe community
              </button>
              <ul className="divide-y divide-hair">
                {communities.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => { if (c.threadId) { setTab("chats"); openThread(c.threadId); void loadThreads(); } }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-soft">
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
          {tab === "updates" && (
            <ul className="divide-y divide-hair">
              {updates === null && <p className="px-5 py-10 text-center text-sm text-neutralx-400">Laden…</p>}
              {updates?.length === 0 && <p className="px-5 py-10 text-center text-sm text-neutralx-400">Geen nieuwe updates. Hier zie je nieuws over je klussen, uren en account.</p>}
              {updates?.map((u) => (
                <li key={u.id}>
                  <a href={u.href} className="flex gap-3 px-4 py-3 hover:bg-paper-soft">
                    <span className={`mt-0.5 grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-lg ${u.urgent ? "bg-warn/20" : "bg-brand-50"}`}>
                      {{ chat: "💬", shift: "📋", offer: "🤝", action: "⚡", verification: "🛡", info: "ℹ️" }[u.kind] ?? "ℹ️"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{u.title}</span>
                        <span className="flex-shrink-0 text-[10px] text-neutralx-400">{fmtTime(u.at)}</span>
                      </span>
                      <span className="line-clamp-2 text-xs text-neutralx-500">{u.body}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {tab === "calls" && (
            <ul className="divide-y divide-hair">
              {calls === null && <p className="px-5 py-10 text-center text-sm text-neutralx-400">Laden…</p>}
              {calls?.length === 0 && <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen oproepen. Bel iemand vanuit een chat met 📞 of 📹.</p>}
              {calls?.map((c, i) => {
                const u = dir[c.peerUserId];
                const missed = c.status === "missed" || c.status === "declined";
                const ring = (mode: "audio" | "video") =>
                  window.dispatchEvent(
                    new CustomEvent("zf:call", { detail: { threadId: c.threadId, mode, peerName: u?.name ?? "", peerUserId: c.peerUserId, peerRole: u?.role ?? "employer" } }),
                  );
                return (
                  <li key={c.threadId + c.at + i} className="flex items-center gap-3 px-4 py-3">
                    <Avatar userId={c.peerUserId} name={u?.name ?? "…"} role={u?.role ?? "employer"} avatars={avatars} size={40} />
                    <button type="button" onClick={() => { setTab("chats"); openThread(c.threadId); }} className="min-w-0 flex-1 text-left">
                      <span className={`block truncate text-sm font-semibold ${missed && !c.outgoing ? "text-crit" : "text-ink"}`}>{u?.name ?? "Onbekend"}</span>
                      <span className="block text-xs text-neutralx-500">
                        {c.outgoing ? "↗" : "↙"} {missed ? (c.outgoing ? "Niet opgenomen" : "Gemist") : c.durationSec ? `${Math.floor(c.durationSec / 60)}:${String(c.durationSec % 60).padStart(2, "0")}` : "Beëindigd"} · {dayLabel(c.at)} {fmtTime(c.at)}
                      </span>
                    </button>
                    <button type="button" onClick={() => ring(c.mode === "video" ? "video" : "audio")} className="grid h-9 w-9 place-items-center rounded-full text-lg text-brand-600 hover:bg-paper-soft" aria-label="Terugbellen">
                      {c.mode === "video" ? "📹" : "📞"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {tab === "settings" && (
            <ChatSettingsPanel
              me={{ name: me?.name ?? "" }}
              blocked={chatPrefs.blocked}
              names={Object.fromEntries(Object.entries(dir).map(([id, u]) => [id, u.name]))}
              hasPin={chatPrefs.hasPin}
              employer={Boolean(me && dir[me.userId]?.role === "employer")}
              onUnblock={(uid) => {
                const t = threads.find((x) => x.kind === "direct" && x.participants.includes(uid));
                if (t) void doAction(t.id, { action: "unblock" });
              }}
              onSetPin={() => setPinAsk({ mode: "set" })}
              onSupport={() => {
                setTab("chats");
                void startSupport();
              }}
              onChanged={() => void loadThreads()}
            />
          )}
        </div>

        {/* WhatsApp-style bottom bar */}
        <nav className="grid flex-shrink-0 grid-cols-5 border-t border-hair bg-white">
          {(
            [
              ["chats", "💬", "Chats"],
              ["updates", "🔔", "Updates"],
              ["calls", "📞", "Oproepen"],
              ["tools", "🧰", "Tools"],
              ["settings", "⚙️", "Instellingen"],
            ] as const
          ).map(([k, icon, label]) => {
            const unread = k === "chats" ? threads.filter((t) => !t.archived && !t.muted && t.unread > 0).length : 0;
            return (
              <button key={k} type="button" onClick={() => setTab(k)} className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${tab === k ? "text-brand-700" : "text-neutralx-500"}`}>
                <span className={`grid h-7 w-12 place-items-center rounded-full text-base ${tab === k ? "bg-brand-50" : ""}`}>{icon}</span>
                {label}
                {unread > 0 && <span className="absolute right-[18%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">{unread}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─── conversation ─── */}
      {!activeThread ? (
        <div className="hidden place-items-center text-sm text-neutralx-400 md:grid">Kies een gesprek</div>
      ) : (
        <div className={`${pane === "list" ? "hidden md:flex" : "flex"} min-h-0 flex-col`}>
          <div className="flex items-center gap-3 border-b border-hair px-4 py-2.5">
            <button
              type="button"
              onClick={() => setPane("list")}
              className="-ml-2 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-2xl leading-none text-neutralx-500 hover:bg-paper-soft md:hidden"
              aria-label="Terug naar gesprekken"
            >
              ‹
            </button>
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
            <button
              type="button"
              onClick={() => setMenuFor(activeThread.id)}
              className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft ${activeThread.kind === "support" ? "ml-auto" : ""}`}
              aria-label="Meer opties"
            >
              ⋮
            </button>
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
            className={`flex-1 space-y-1.5 overflow-y-auto px-5 py-4 ${look.font === "s" ? "text-[14px]" : look.font === "l" ? "text-[19px]" : "text-[16px]"}`}
            style={
              look.wallpaper === "plain"
                ? { background: "#FFFFFF" }
                : look.wallpaper === "mint"
                  ? { background: "#E4F8EF" }
                  : look.wallpaper === "dark"
                    ? { background: "#14161A" }
                    : { background: "#F4F4F0", backgroundImage: "radial-gradient(rgba(12,14,18,0.03) 1px, transparent 1px)", backgroundSize: "18px 18px" }
            }
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

          {activeThread.kind === "direct" && chatPrefs.blocked.includes(otherOf(activeThread).userId) ? (
            <div className="flex items-center justify-center gap-3 border-t border-hair px-4 py-3 text-sm text-neutralx-600">
              Je hebt {otherOf(activeThread).name} geblokkeerd.
              <button type="button" onClick={() => void doAction(activeThread.id, { action: "unblock" })} className="font-semibold text-brand-600 underline">
                Deblokkeer
              </button>
            </div>
          ) : (
          <Composer
            key={activeThread.id}
            threadId={activeThread.id}
            quickReplies={quickReplies}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            onSend={send}
            onTyping={pingTyping}
            lastIncoming={[...messages].reverse().find((m) => m.from !== me?.userId && m.text)?.text ?? ""}
          />
          )}
        </div>
      )}

      {/* ─── overlays ─── */}
      {menuThread && (
        <ThreadMenuSheet
          name={otherOf(menuThread).name}
          flags={menuThread}
          direct={menuThread.kind === "direct"}
          blocked={chatPrefs.blocked.includes(otherOf(menuThread).userId)}
          lists={chatPrefs.lists}
          onAction={(a) => void doAction(menuThread.id, a)}
          onClose={() => setMenuFor(null)}
        />
      )}
      {pinAsk && (
        <PinModal
          mode={pinAsk.mode}
          onClose={() => setPinAsk(null)}
          onDone={async (pin) => {
            const r = await fetch("/api/inbox/pin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: pinAsk.mode === "set" ? "set" : "check", pin }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) return d?.error?.message ?? "Dat lukte niet.";
            if (pinAsk.mode === "unlock" && !d.ok) return "Onjuiste pincode.";
            pinRef.current = pin;
            const then = pinAsk.then;
            const unlocking = pinAsk.mode === "unlock";
            setPinAsk(null);
            setChatPrefs((c) => ({ ...c, hasPin: true }));
            if (unlocking) setView("locked");
            then?.();
            await loadThreads();
            return null;
          }}
        />
      )}
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
            if (threadId) { setTab("chats"); openThread(threadId); }
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
      {showBrain && (
        <Portal>
          <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setShowBrain(false)}>
            <div className="h-[90vh] w-full overflow-hidden rounded-t-2xl shadow-lift sm:h-[80vh] sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <BrainChat onClose={() => setShowBrain(false)} />
            </div>
          </div>
        </Portal>
      )}
      {showSettings && <ChatSettingsModal onClose={() => { setShowSettings(false); if (active) void loadThread(active); }} />}
    </div>
    </div>
  );
}

function Dot({ d = "0s" }: { d?: string }) {
  return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutralx-400" style={{ animationDelay: d }} />;
}
