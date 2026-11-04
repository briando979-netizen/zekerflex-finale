"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { MessageBubble } from "./MessageBubble";
import { useMessageSearch } from "./useMessageSearch";
import { useStickyScroll } from "./useStickyScroll";
import { ChatSearchBar } from "./ChatSearchBar";
import { ForwardPicker } from "./ForwardPicker";
import { ChatPinnedBanner } from "./ChatPinnedBanner";
import { ImageViewer } from "./ImageViewer";
import {
  IconSearch,
  IconDots,
  IconPhone,
  IconVideo,
  IconScreenShare,
  IconChatBubble,
  IconBell,
  IconBriefcase,
  IconGear,
  IconPencil,
  IconChevronDown,
  IconClose,
  IconStar,
  IconBack,
} from "./icons";
import { Composer, type OutgoingMessage } from "./Composer";
import { UserCard } from "./UserCard";
import { PeoplePicker, CommunityCreateModal, CommunityManageModal, ChatSettingsModal } from "./modals";
import { PushToggle } from "@/components/app/PushToggle";
import { SwipeRow, ThreadMenuSheet, PinModal, type MenuAction } from "./ThreadMenu";
import { ChatSettingsPanel, readLook, type ChatLook } from "./ChatSettingsPanel";
import { Portal } from "./Portal";
import { BrainChat } from "@/components/brain/BrainChat";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { allDrafts, DRAFT_EVENT } from "./drafts";
import {
  canEdit,
  canShareScreen,
  dayLabel,
  fmtTime,
  lastSeenLabel,
  listTime,
  threadMatches,
  toggleReaction,
  withReactions,
  type ChatUser,
  type Msg,
  type Presence,
  type SavedMsg,
  type ThreadRow,
} from "./shared";

type Tab = "chats" | "updates" | "calls" | "tools" | "settings";
interface SavedContact { userId: string; label?: string; favourite: boolean }
interface CommunityRow { id: string; name: string; threadId: string | null; memberCount: number; myRole: string }

/** Tells the server this tab is in view, so it doesn't also push the messages it shows. */
const visibleQuery = () => (document.visibilityState === "visible" ? "?visible=1" : "");

const TAB_TITLE: Record<Tab, string> = { chats: "Chats", updates: "Updates", calls: "Oproepen", tools: "Tools", settings: "Instellingen" };

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
  const [toolsView, setToolsView] = useState<"main" | "saved">("main");
  const [listQuery, setListQuery] = useState("");
  // unsent text per conversation (drafts.ts): shown as "Concept: …" in the list
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    setDrafts(allDrafts());
    const on = () => setDrafts(allDrafts());
    window.addEventListener(DRAFT_EVENT, on);
    return () => window.removeEventListener(DRAFT_EVENT, on);
  }, []);
  // a file dragged onto the conversation goes to the composer's preview
  const [dragOver, setDragOver] = useState(false);
  const [dropped, setDropped] = useState<File | null>(null);
  const clearDropped = useCallback(() => setDropped(null), []);

  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);

  const [cardUser, setCardUser] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "chat" | "community-invite">(null);
  const [showCommunityCreate, setShowCommunityCreate] = useState(false);
  const [manageCommunity, setManageCommunity] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBrain, setShowBrain] = useState(false);
  const [viewer, setViewer] = useState<{ src: string; filename: string } | null>(null);
  // short message at the bottom ("Gekopieerd", "Doorgestuurd naar …", an error) instead of window.alert
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string, error = false) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, error });
    noticeTimer.current = setTimeout(() => setNotice(null), error ? 6000 : 2500);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

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
    if (tab !== "tools") setToolsView("main");
  }, [tab]);

  // messages saved with a star (lib/messaging/bewaard.ts); perThread is always the server's version
  const [saved, setSaved] = useState<SavedMsg[] | null>(null);
  const [savedPerThread, setSavedPerThread] = useState<Record<string, string[]>>({});
  const loadSaved = useCallback(async () => {
    const r = await fetch("/api/inbox/bewaard", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setSaved((s) => s ?? []);
    const d = (await r.json()) as { bewaard: SavedMsg[]; perThread: Record<string, string[]> };
    setSaved(d.bewaard);
    setSavedPerThread(d.perThread);
  }, []);
  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);
  const toggleSaved = async (threadId: string, messageId: string, on: boolean) => {
    const r = await fetch("/api/inbox/bewaard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, messageId, aan: on }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return say(d?.error?.message ?? "Bewaren lukte niet.", true);
    setSavedPerThread(d.perThread ?? {});
    setSaved((list) => {
      const rest = (list ?? []).filter((b) => !(b.threadId === threadId && b.messageId === messageId));
      return on && d.bewaard ? [d.bewaard as SavedMsg, ...rest] : rest;
    });
    say(on ? "Bewaard" : "Niet meer bewaard");
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const search = useMessageSearch(messages);
  useEffect(() => {
    if (search.activeId) document.getElementById(`ip-msg-${search.activeId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [search.activeId]);
  const [forwarding, setForwarding] = useState<Msg | null>(null);
  const [pinned, setPinned] = useState<{ id: string; excerpt: string } | null>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;
  const threadsRef = useRef<ThreadRow[]>([]);
  threadsRef.current = threads;
  const lastPing = useRef(0);
  // failed messages keep what was sent, so "Opnieuw" can send it again
  const outbox = useRef(new Map<string, OutgoingMessage>());

  // unread count when a conversation opens: the "N ongelezen berichten" line
  const [unreadAtOpen, setUnreadAtOpen] = useState(0);
  useEffect(() => {
    setUnreadAtOpen(threadsRef.current.find((t) => t.id === active)?.unread ?? 0);
  }, [active]);
  const sticky = useStickyScroll({
    scrollRef,
    contentRef,
    messages,
    threadId: active,
    myUserId: me?.userId,
    unreadAtOpen,
    typing,
    idPrefix: "ip-msg-",
  });

  // briefly highlight a message after jumping to it (quoted reply, saved message)
  const [flashId, setFlashId] = useState<string | null>(null);
  const jumpTo = useCallback((id: string): boolean => {
    const el = document.getElementById(`ip-msg-${id}`);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1600);
    return true;
  }, []);
  const pendingJump = useRef<{ threadId: string; messageId: string } | null>(null);
  useEffect(() => {
    const j = pendingJump.current;
    if (!j || j.threadId !== active || messages.length === 0) return;
    pendingJump.current = null;
    // after the opening scroll of useStickyScroll
    requestAnimationFrame(() => {
      if (!jumpTo(j.messageId)) say("Dit bericht staat verder terug in het gesprek.");
    });
  }, [messages, active, jumpTo, say]);

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
    // a late answer for a conversation you already left must not fill the open one
    if (activeRef.current !== id) return;
    setMessages((prev) => {
      const server: Msg[] = d.messages;
      const local = prev.filter((m) => (m.pending || m.failed) && !server.some((s) => s.text === m.text && s.from === m.from && s.kind === m.kind));
      return [...server, ...local];
    });
    setDir((p) => ({ ...p, ...d.directory }));
    setPresence((p) => ({ ...p, ...d.presence }));
    setAvatars((p) => ({ ...p, ...d.avatars }));
    setQuickReplies(d.settings?.quickReplies ?? []);
    setPinned(d.pinned ?? null);
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
    return () => {
      clearInterval(i);
      setTyping(false);
    };
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
      say(d?.error?.message ?? "Dat lukte niet.", true);
      return;
    }
    if ((a.action === "delete" || a.action === "lock" || a.action === "archive") && active === threadId) {
      setActive(null);
      setPane("list");
    }
    const done: Partial<Record<MenuAction["action"], string>> = {
      archive: "Chat gearchiveerd",
      unarchive: "Chat uit het archief gehaald",
      mute: "Chat gedempt",
      unmute: "Dempen opgeheven",
      favorite: "Toegevoegd aan favorieten",
      unfavorite: "Uit favorieten gehaald",
      lock: "Chat vergrendeld",
      clear: "Chat gewist",
      delete: "Chat verwijderd",
      block: "Geblokkeerd",
      unblock: "Gedeblokkeerd",
    };
    const msg = done[a.action];
    if (msg) say(msg);
    await loadThreads();
    if (active === threadId && a.action !== "delete") void loadThread(threadId);
  };

  const q = listQuery.trim();
  const inView = (t: ThreadRow) => (view === "locked" ? t.locked : view === "archived" ? t.archived && !t.locked : !t.archived && !t.locked);
  const listed = q
    ? // searching looks through every chat you can see, archived ones included
      threads.filter((t) => threadMatches(q, otherOf(t).name, t.lastMessage?.text, t.shiftTitle, t.title))
    : threads
        .filter(inView)
        .filter(
          (t) =>
            filter === "all" ||
            (filter === "unread" && t.unread > 0) ||
            (filter === "fav" && t.favorite) ||
            (filter.startsWith("list:") && t.lists?.includes(filter.slice(5))),
        );
  const archivedCount = threads.filter((t) => t.archived && !t.locked).length;
  const unreadChats = threads.filter((t) => !t.archived && !t.locked && t.unread > 0).length;
  const menuThread = menuFor ? (threads.find((t) => t.id === menuFor) ?? null) : null;

  const emptyText = q
    ? `Geen chats gevonden voor “${q}”.`
    : threads.length === 0
      ? "Nog geen gesprekken."
      : view === "archived"
        ? "Geen gearchiveerde chats."
        : view === "locked"
          ? "Geen vergrendelde chats."
          : filter === "unread"
            ? "Je hebt alles gelezen."
            : filter === "fav"
              ? "Nog geen favorieten. Kies ★ in het menu van een chat."
              : filter.startsWith("list:")
                ? "Deze lijst is nog leeg."
                : "Geen gesprekken hier.";

  const pingTyping = () => {
    const n = Date.now();
    if (!active || n - lastPing.current < 3000) return;
    lastPing.current = n;
    fetch(`/api/inbox/${active}/typing`, { method: "POST" }).catch(() => undefined);
  };

  // another conversation opened: stop editing/replying (that message belongs to the old one)
  useEffect(() => {
    setEditing(null);
    setReplyTo(null);
  }, [active]);

  // your own message rewritten: shown at once, then the server's version (with its editedAt)
  const saveEdit = async (messageId: string, text: string) => {
    if (!active) return;
    const threadId = active;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text, editedAt: new Date().toISOString() } : m)));
    const r = await fetch(`/api/inbox/${threadId}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, text }),
    }).catch(() => null);
    if (r?.ok) {
      const server = ((await r.json()) as { message: Msg }).message;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...server } : m)));
    } else {
      const d = r ? await r.json().catch(() => ({})) : {};
      say(d?.error?.message ?? "Bewerken lukte niet. Probeer het opnieuw.", true);
      await loadThread(threadId);
    }
  };

  const send = async (msg: OutgoingMessage) => {
    if (!active) return;
    if (msg.editId) return saveEdit(msg.editId, msg.text);
    const threadId = active;
    const tmpId = "tmp" + Date.now();
    const optimistic: Msg = {
      id: tmpId,
      from: me?.userId ?? "me",
      at: new Date().toISOString(),
      text: msg.text,
      kind: msg.kind,
      pending: true,
      ...(msg.attachment ? { attachment: msg.attachment } : {}),
      ...(msg.location ? { location: msg.location } : {}),
    };
    outbox.current.set(tmpId, msg);
    setMessages((m) => [...m, optimistic]);
    const r = await fetch(`/api/inbox/${threadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    }).catch(() => null);
    if (!r?.ok) {
      // stays in the conversation with a reason and "Opnieuw", instead of a clock that never goes away
      const d = r ? await r.json().catch(() => ({})) : {};
      const reason: string = d?.error?.message ?? (r ? "er ging iets mis" : "geen verbinding");
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, pending: false, failed: reason } : m)));
      return;
    }
    outbox.current.delete(tmpId);
    await loadThread(threadId);
  };

  const retry = (m: Msg) => {
    const original = outbox.current.get(m.id);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    outbox.current.delete(m.id);
    if (original) void send(original);
  };
  const discard = (m: Msg) => {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    outbox.current.delete(m.id);
  };

  const react = async (msg: Msg, emoji: string) => {
    if (!active || !me) return;
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? toggleReaction(m, me.userId, emoji) : m)));
    try {
      const r = await fetch(`/api/inbox/${active}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id, emoji }),
      });
      if (r.ok) {
        const reactions = ((await r.json()).reactions ?? {}) as Record<string, string[]>;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? withReactions(m, reactions) : m)));
      }
    } catch {
      /* optimistische staat blijft staan */
    }
  };

  const del = async (msg: Msg) => {
    if (!active) return;
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, deleted: true } : m)));
    const r = await fetch(`/api/inbox/${active}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: msg.id }),
    }).catch(() => null);
    if (!r?.ok) {
      say("Verwijderen lukte niet.", true);
      void loadThread(active);
    }
  };

  const doForward = async (toThreadId: string) => {
    const msg = forwarding;
    setForwarding(null);
    if (!msg || !active) return;
    const r = await fetch("/api/inbox/forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromThreadId: active, messageId: msg.id, toThreadId }),
    }).catch(() => null);
    const to = threads.find((t) => t.id === toThreadId);
    if (r?.ok) say(`Doorgestuurd naar ${to ? otherOf(to).name : "het gesprek"}`);
    else say("Doorsturen lukte niet.", true);
  };

  const togglePin = async (msg: Msg) => {
    if (!active) return;
    const toPin = pinned?.id === msg.id ? null : msg.id;
    setPinned(toPin ? { id: msg.id, excerpt: msg.text || "bericht" } : null);
    try {
      await fetch(`/api/inbox/${active}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: toPin }),
      });
      void loadThread(active);
    } catch {
      /* genegeerd */
    }
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
    } else {
      const d = await r.json().catch(() => ({}));
      say(d?.error?.message ?? "Dit gesprek kon niet starten.", true);
    }
  };

  const startSupport = async () => {
    // Already talking to Support → just open that conversation (this used to post
    // "Hoi, ik heb een vraag." again on every click).
    setTab("chats");
    const existing = threads.find((t) => t.kind === "support");
    if (existing) {
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

  const openSaved = (b: SavedMsg) => {
    pendingJump.current = { threadId: b.threadId, messageId: b.messageId };
    setTab("chats");
    if (active === b.threadId) {
      setPane("conversation");
      pendingJump.current = null;
      if (!jumpTo(b.messageId)) say("Dit bericht staat verder terug in het gesprek.");
      return;
    }
    if (!threads.some((t) => t.id === b.threadId)) {
      pendingJump.current = null;
      say("Dit gesprek staat niet in je lijst (vergrendeld of verwijderd).", true);
      return;
    }
    openThread(b.threadId);
  };

  const headerSub = (() => {
    if (!activeThread) return "";
    if (activeThread.kind === "group") return `${activeThread.participants.length} leden`;
    if (activeThread.kind === "support") return "Wij helpen je zo snel mogelijk";
    return [lastSeenLabel(presence[otherOf(activeThread).userId]), activeThread.shiftTitle].filter(Boolean).join(" · ");
  })();
  const activeOther = activeThread ? otherOf(activeThread) : null;
  const savedHere = active ? (savedPerThread[active] ?? []) : [];

  const iconBtn = "grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft hover:text-ink";
  const rowBtn = "flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink hover:bg-paper-soft";
  const sectionHead = "px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-neutralx-400";

  return (
    // One column with a fixed height: the push banner takes what it needs and
    // the chat gets the rest — so the composer never slides under the bottom
    // tab bar on a phone (the banner used to come on top of the chat height).
    <div className={`flex ${mobileHeight} min-h-[26rem] flex-col gap-3 ${desktopHeight}`}>
    <div className="flex-shrink-0 empty:hidden">
      <PushToggle variant="banner" />
    </div>
    <div className="chat-surface relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-hair bg-white shadow-card md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {/* ─── left pane ─── */}
      <div className={`${pane === "conversation" && activeThread ? "hidden md:flex" : "flex"} min-h-0 flex-col border-hair md:border-r`}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          {tab === "tools" && toolsView === "saved" ? (
            <button type="button" onClick={() => setToolsView("main")} className="-ml-2 flex items-center gap-1 rounded-lg px-1 font-display text-lg font-bold text-ink hover:bg-paper-soft" aria-label="Terug naar Tools">
              <IconBack className="h-5 w-5" /> Bewaarde berichten
            </button>
          ) : (
            <h2 className="font-display text-lg font-bold text-ink">{TAB_TITLE[tab]}</h2>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setPicker("chat")} className={iconBtn} aria-label="Nieuw gesprek" title="Nieuw gesprek">
              <IconPencil className="h-5 w-5" />
            </button>
          </div>
        </div>

        {tab === "chats" && (
          <div className="flex-shrink-0 px-3 pb-2">
            <label className="flex items-center gap-2 rounded-full bg-paper-soft px-3 py-2 focus-within:ring-2 focus-within:ring-brand-400">
              <IconSearch className="h-4 w-4 flex-shrink-0 text-neutralx-400" />
              <input
                type="text"
                inputMode="search"
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setListQuery("")}
                placeholder="Zoek een chat of bericht"
                aria-label="Zoek in je chats"
                className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-neutralx-400 md:text-sm"
              />
              {listQuery && (
                <button type="button" onClick={() => setListQuery("")} className="grid h-5 w-5 place-items-center rounded-full text-neutralx-400 hover:text-ink" aria-label="Zoekopdracht wissen">
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            {!q && view === "main" && (
              <div className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]">
                {[
                  ["all", "Alle"],
                  ["unread", unreadChats ? `Ongelezen ${unreadChats}` : "Ongelezen"],
                  ["fav", "Favorieten"],
                  ...chatPrefs.lists.map((l) => [`list:${l}`, l]),
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k!)}
                    aria-pressed={filter === k}
                    className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === k ? "bg-brand-500 text-white" : "bg-paper-soft text-neutralx-600 hover:bg-black/[0.06]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-hair">
          {tab === "chats" && (
            <>
              {!q && view !== "main" && (
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
                  <IconBack className="h-4 w-4" /> {view === "archived" ? "Gearchiveerd" : "Vergrendelde chats"}
                </button>
              )}
              {!q && view === "main" && (
                <>
                  {chatPrefs.lockedCount > 0 && (
                    <button type="button" onClick={() => setPinAsk({ mode: "unlock" })} className={rowBtn}>
                      <span className="w-10 text-center" aria-hidden>🔒</span>Vergrendelde chats <span className="ml-auto text-xs text-neutralx-400">{chatPrefs.lockedCount}</span>
                    </button>
                  )}
                  {archivedCount > 0 && (
                    <button type="button" onClick={() => setView("archived")} className={rowBtn}>
                      <span className="w-10 text-center" aria-hidden>🗄</span>Gearchiveerd <span className="ml-auto text-xs text-neutralx-400">{archivedCount}</span>
                    </button>
                  )}
                </>
              )}
              {listed.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-neutralx-500">{emptyText}</p>
                  {threads.length === 0 && !q && (
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <button type="button" onClick={() => setPicker("chat")} className="btn-primary px-4 py-2 text-sm">
                        Begin een gesprek
                      </button>
                      <button type="button" onClick={() => void startSupport()} className="text-sm font-semibold text-brand-600 hover:underline">
                        Chat met ZekerFlex Support
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <ul className="[&>li:last-child_.zf-row-line]:border-transparent">
                  {listed.map((t) => {
                    const o = otherOf(t);
                    const pres = presence[o.userId];
                    const unread = t.unread > 0;
                    return (
                      <li key={t.id}>
                        <SwipeRow archived={Boolean(t.archived)} onArchive={() => void doAction(t.id, { action: t.archived ? "unarchive" : "archive" })} onMore={() => setMenuFor(t.id)}>
                        <div className="group relative">
                        <button
                          type="button"
                          onClick={() => openThread(t.id)}
                          aria-current={active === t.id ? "true" : undefined}
                          className={`flex w-full items-center gap-3 pl-4 text-left ${active === t.id ? "bg-brand-50" : "hover:bg-paper-soft"}`}
                        >
                          <Avatar userId={o.userId} name={o.name} role={o.role} avatars={avatars} size={44} support={o.support} online={t.kind === "direct" ? pres?.online ?? false : undefined} />
                          <span className="zf-row-line min-w-0 flex-1 border-b border-hair py-3 pr-4">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[15px] font-semibold text-ink md:text-sm">{o.name}</span>
                              <span className={`flex-shrink-0 text-[11px] ${unread && !t.muted ? "font-semibold text-[#1DA851]" : "text-neutralx-500"}`}>{t.lastMessage ? listTime(t.lastMessage.at) : ""}</span>
                            </span>
                            <span className="mt-0.5 flex items-center justify-between gap-2">
                              <span className={`truncate text-[13px] md:text-xs ${unread ? "font-medium text-neutralx-600" : "text-neutralx-500"}`}>
                                {drafts[t.id] && t.id !== active ? (
                                  <>
                                    <span className="font-semibold text-[#1DA851]">Concept: </span>
                                    {drafts[t.id]}
                                  </>
                                ) : t.lastMessage ? (
                                  (t.lastMessage.from === me?.userId ? "Jij: " : "") + t.lastMessage.text
                                ) : (
                                  t.shiftTitle ?? "—"
                                )}
                              </span>
                              <span className="flex flex-shrink-0 items-center gap-1">
                                {q && t.archived && <span className="rounded bg-paper-soft px-1 text-[10px] text-neutralx-500">archief</span>}
                                {t.favorite && <span className="text-[11px] text-amber-500" aria-label="favoriet">★</span>}
                                {t.muted && <span className="text-[11px]" title="Gedempt" aria-label="gedempt">🔕</span>}
                                {unread && (
                                  <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white ${t.muted ? "bg-neutralx-400" : "bg-[#1DA851]"}`} aria-label={`${t.unread} ongelezen`}>
                                    {t.unread}
                                  </span>
                                )}
                              </span>
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMenuFor(t.id)}
                          className="absolute right-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white text-neutralx-500 shadow-sm hover:text-ink md:group-hover:grid md:focus-visible:grid"
                          aria-label={`Meer opties voor ${o.name}`}
                        >
                          <IconChevronDown className="h-4 w-4" />
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

          {tab === "tools" && toolsView === "saved" && (
            <ul className="divide-y divide-hair">
              {saved === null && <p className="px-5 py-10 text-center text-sm text-neutralx-400">Laden…</p>}
              {saved?.length === 0 && (
                <p className="px-6 py-12 text-center text-sm text-neutralx-500">
                  Nog niets bewaard. Houd een bericht ingedrukt (op een computer: ⋯ naast het bericht) en kies <strong>Bewaren</strong>.
                </p>
              )}
              {saved?.map((b) => {
                const t = threads.find((x) => x.id === b.threadId);
                const fromName = b.from === me?.userId ? "Jij" : (dir[b.from]?.name ?? "…");
                return (
                  <li key={b.threadId + b.messageId} className="flex items-start gap-3 px-4 py-3 hover:bg-paper-soft">
                    <Avatar userId={b.from} name={fromName} role={dir[b.from]?.role ?? "employer"} avatars={avatars} size={36} />
                    <button type="button" onClick={() => openSaved(b)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {fromName}
                          {t ? <span className="font-normal text-neutralx-500"> · {otherOf(t).name}</span> : null}
                        </span>
                        <span className="flex-shrink-0 text-[11px] text-neutralx-500">{listTime(b.at)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-3 block text-[13px] text-neutralx-600">{b.excerpt || "bericht"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleSaved(b.threadId, b.messageId, false)}
                      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-amber-500 hover:bg-black/5"
                      aria-label="Niet meer bewaren"
                      title="Niet meer bewaren"
                    >
                      ★
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {tab === "tools" && toolsView === "main" && (
            <>
              <p className={sectionHead}>Tools</p>
              <button type="button" onClick={() => setShowBrain(true)} className={rowBtn}>
                <span className="w-8 text-center text-lg" aria-hidden>✨</span>
                <span>
                  ZekerFlex-assistent
                  <span className="block text-xs text-neutralx-500">Vraag naar je klussen, uren, uitbetalingen of hoe iets werkt</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setToolsView("saved");
                  void loadSaved();
                }}
                className={rowBtn}
              >
                <span className="grid w-8 place-items-center text-amber-500" aria-hidden><IconStar className="h-5 w-5" /></span>
                <span className="flex-1">
                  Bewaarde berichten
                  <span className="block text-xs text-neutralx-500">Berichten die je met een ster bewaarde</span>
                </span>
                {saved && saved.length > 0 && <span className="text-xs text-neutralx-400">{saved.length}</span>}
              </button>
              <button type="button" onClick={() => setShowSettings(true)} className={rowBtn}>
                <span className="w-8 text-center text-lg" aria-hidden>⚡</span>
                <span>
                  Snelle antwoorden &amp; afwezig-bericht
                  <span className="block text-xs text-neutralx-500">Vaste antwoorden en een automatisch bericht als je niet bereikbaar bent</span>
                </span>
              </button>
              <button type="button" onClick={() => void startSupport()} className={rowBtn}>
                <span className="w-8 text-center text-lg" aria-hidden>🛟</span>
                <span>
                  Chat met ZekerFlex Support
                  <span className="block text-xs text-neutralx-500">Een vraag over je account, klussen of betalingen</span>
                </span>
              </button>

              <p className={`${sectionHead} border-t border-hair`}>Contacten</p>
              {contacts.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-neutralx-400">Nog geen opgeslagen contacten. Tik op iemands naam in een gesprek om die op te slaan.</p>
              ) : (
                <ul>
                  {contacts.map((c) => {
                    const u = dir[c.userId];
                    return (
                      <li key={c.userId}>
                        <button type="button" onClick={() => startThreadWith(c.userId)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper-soft">
                          <Avatar userId={c.userId} name={u?.name ?? "…"} role={u?.role ?? "employer"} avatars={avatars} size={40} online={presence[c.userId]?.online ?? false} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{c.favourite ? "★ " : ""}{u?.name ?? "Onbekend"}</span>
                            <span className="block truncate text-xs text-neutralx-500">{c.label || u?.meta || ""}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className={`${sectionHead} flex items-center border-t border-hair`}>
                Communities
                <button type="button" onClick={() => setShowCommunityCreate(true)} className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-brand-600 hover:bg-paper-soft">
                  + Nieuwe community
                </button>
              </div>
              {communities.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-neutralx-400">Maak je eigen community en nodig freelancers uit.</p>
              ) : (
                <ul>
                  {communities.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => { if (c.threadId) { setTab("chats"); openThread(c.threadId); void loadThreads(); } }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper-soft">
                        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-brand-500 text-sm font-bold text-white">{c.name.slice(0, 2).toUpperCase()}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                          <span className="block truncate text-xs text-neutralx-500">{c.memberCount} leden · {c.myRole === "owner" ? "eigenaar" : c.myRole}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === "updates" && (
            <ul className="divide-y divide-hair">
              {updates === null && <p className="px-5 py-10 text-center text-sm text-neutralx-400">Laden…</p>}
              {updates?.length === 0 && <p className="px-5 py-10 text-center text-sm text-neutralx-400">Geen nieuwe updates. Hier zie je nieuws over je klussen, uren en account.</p>}
              {updates?.map((u) => (
                <li key={u.id}>
                  <a href={u.href} className="flex gap-3 px-4 py-3 hover:bg-paper-soft">
                    <span className={`mt-0.5 grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-lg ${u.urgent ? "bg-warn/20" : "bg-brand-50"}`} aria-hidden>
                      {{ chat: "💬", shift: "📋", offer: "🤝", action: "⚡", verification: "🛡", info: "ℹ️" }[u.kind] ?? "ℹ️"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{u.title}</span>
                        <span className="flex-shrink-0 text-[11px] text-neutralx-500">{listTime(u.at)}</span>
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
              {calls?.length === 0 && <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen oproepen. Bel iemand vanuit een chat met de telefoon- of videoknop bovenin.</p>}
              {calls?.map((c, i) => {
                const u = dir[c.peerUserId];
                const missed = c.status === "missed" || c.status === "declined";
                const ring = (mode: "audio" | "video") =>
                  window.dispatchEvent(
                    new CustomEvent("zf:call", { detail: { threadId: c.threadId, mode, peerName: u?.name ?? "", peerUserId: c.peerUserId, peerRole: u?.role ?? "employer" } }),
                  );
                return (
                  <li key={c.threadId + c.at + i} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar userId={c.peerUserId} name={u?.name ?? "…"} role={u?.role ?? "employer"} avatars={avatars} size={40} />
                    <button type="button" onClick={() => { setTab("chats"); openThread(c.threadId); }} className="min-w-0 flex-1 text-left">
                      <span className={`block truncate text-sm font-semibold ${missed && !c.outgoing ? "text-crit" : "text-ink"}`}>{u?.name ?? "Onbekend"}</span>
                      <span className="block text-xs text-neutralx-500">
                        <span aria-hidden className={missed && !c.outgoing ? "text-crit" : "text-[#1DA851]"}>{c.outgoing ? "↗" : "↙"}</span>{" "}
                        {missed ? (c.outgoing ? "Niet opgenomen" : "Gemist") : c.durationSec ? `${Math.floor(c.durationSec / 60)}:${String(c.durationSec % 60).padStart(2, "0")}` : "Beëindigd"} · {dayLabel(c.at)} {fmtTime(c.at)}
                      </span>
                    </button>
                    <button type="button" onClick={() => ring(c.mode === "video" ? "video" : "audio")} className="grid h-10 w-10 place-items-center rounded-full text-brand-600 hover:bg-paper-soft" aria-label={`${u?.name ?? "Contact"} terugbellen`}>
                      {c.mode === "video" ? <IconVideo className="h-5 w-5" /> : <IconPhone className="h-5 w-5" />}
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
              onSupport={() => void startSupport()}
              onChanged={() => void loadThreads()}
            />
          )}
        </div>

        {/* WhatsApp-style bottom bar */}
        <nav aria-label="Inboxnavigatie" className="grid flex-shrink-0 grid-cols-5 border-t border-hair bg-white">
          {(
            [
              ["chats", IconChatBubble, "Chats"],
              ["updates", IconBell, "Updates"],
              ["calls", IconPhone, "Oproepen"],
              ["tools", IconBriefcase, "Tools"],
              ["settings", IconGear, "Instellingen"],
            ] as const
          ).map(([k, Ico, label]) => {
            const badge = k === "chats" ? threads.filter((t) => !t.archived && !t.muted && t.unread > 0).length : 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-current={tab === k ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${tab === k ? "text-brand-700" : "text-neutralx-500 hover:text-ink"}`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${tab === k ? "bg-brand-50" : ""}`}><Ico className="h-5 w-5" /></span>
                {label}
                {badge > 0 && <span className="absolute right-[18%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#1DA851] px-1 text-[9px] font-bold text-white" aria-label={`${badge} ongelezen chats`}>{badge}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─── conversation ─── */}
      {!activeThread || !activeOther ? (
        <div className="hidden place-items-center bg-paper-soft/40 md:grid">
          <div className="max-w-xs text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600" aria-hidden><IconChatBubble className="h-7 w-7" /></span>
            <p className="mt-3 font-display text-base font-bold text-ink">Kies een gesprek</p>
            <p className="mt-1 text-sm text-neutralx-500">Of begin een nieuw gesprek met iemand uit je klussen.</p>
            <button type="button" onClick={() => setPicker("chat")} className="btn-primary mt-4 px-4 py-2 text-sm">Nieuw gesprek</button>
          </div>
        </div>
      ) : (
        <div
          className={`${pane === "list" ? "hidden md:flex" : "flex"} relative min-h-0 flex-col`}
          onDragOver={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) setDropped(f);
          }}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-2 z-[6] grid place-items-center rounded-2xl border-2 border-dashed border-brand-500 bg-white/85 text-sm font-semibold text-brand-700">
              Laat los om te versturen
            </div>
          )}
          <div className="flex items-center gap-1 border-b border-hair px-2 py-2 sm:gap-2 sm:px-3">
            <button type="button" onClick={() => setPane("list")} className={`${iconBtn} md:hidden`} aria-label="Terug naar gesprekken">
              <IconBack className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeThread.kind === "direct") setCardUser(activeOther.userId);
                else if (activeThread.kind === "group" && activeThread.communityId) setManageCommunity(activeThread.communityId);
              }}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-paper-soft"
              title={activeThread.kind === "direct" ? "Profiel bekijken" : activeThread.kind === "group" ? "Community beheren" : undefined}
            >
              <Avatar userId={activeOther.userId} name={activeOther.name} role={activeOther.role} avatars={avatars} size={38} support={activeOther.support} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{activeOther.name}</span>
                <span className={`block truncate text-xs ${typing ? "font-medium text-[#1DA851]" : "text-neutralx-500"}`}>{typing ? "aan het typen…" : headerSub}</span>
              </span>
            </button>
            <div className="flex flex-shrink-0 items-center">
              {activeThread.kind === "direct" && (
                <>
                  <button type="button" onClick={() => startCall("video")} className={iconBtn} aria-label="Videobellen" title="Videobellen"><IconVideo className="h-5 w-5" /></button>
                  <button type="button" onClick={() => startCall("audio")} className={iconBtn} aria-label="Bellen" title="Bellen"><IconPhone className="h-5 w-5" /></button>
                  {/* the header only renders after the threads load in the browser, so no hydration mismatch */}
                  {canShareScreen() && (
                    <button type="button" onClick={() => startCall("screen")} className={`${iconBtn} hidden sm:grid`} aria-label="Scherm delen" title="Scherm delen"><IconScreenShare className="h-5 w-5" /></button>
                  )}
                </>
              )}
              {activeThread.kind === "group" && activeThread.communityId && (
                <button type="button" onClick={() => setManageCommunity(activeThread.communityId!)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-paper-soft">
                  Beheer
                </button>
              )}
              <button type="button" onClick={search.openSearch} className={iconBtn} aria-label="Zoek in gesprek" title="Zoek in gesprek">
                <IconSearch className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setMenuFor(activeThread.id)} className={iconBtn} aria-label="Meer opties" title="Meer opties">
                <IconDots className="h-5 w-5" />
              </button>
            </div>
          </div>

          {search.open && (
            <ChatSearchBar
              query={search.query}
              onQuery={search.setQuery}
              count={search.count}
              position={search.position}
              onPrev={search.prev}
              onNext={search.next}
              onClose={search.close}
            />
          )}
          {pinned && (
            <ChatPinnedBanner
              excerpt={pinned.excerpt}
              onJump={() => jumpTo(pinned.id)}
              onUnpin={() => {
                setPinned(null);
                if (active) void fetch(`/api/inbox/${active}/pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: null }) });
              }}
            />
          )}

          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              onScroll={sticky.onScroll}
              className={`zf-chat-wall absolute inset-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 ${look.font === "s" ? "text-[14px]" : look.font === "l" ? "text-[19px]" : "text-[16px]"}`}
              data-wall={look.wallpaper}
              style={
                look.wallpaper === "plain"
                  ? { background: "#FFFFFF" }
                  : look.wallpaper === "mint"
                    ? { background: "#E4F8EF" }
                    : look.wallpaper === "dark"
                      ? { background: "#14161A" }
                      : { background: "#EFEAE2", backgroundImage: "radial-gradient(rgba(12,14,18,0.04) 1px, transparent 1px)", backgroundSize: "20px 20px" }
              }
            >
              <div ref={contentRef} className="mx-auto max-w-3xl space-y-1">
                {messages.map((m, i) => {
                  const mine = Boolean(me && m.from === me.userId);
                  const prev = messages[i - 1];
                  const showDay = !prev || amsterdamDayKey(prev.at) !== amsterdamDayKey(m.at);
                  const showSender = activeThread.kind === "group" || activeThread.kind === "support";
                  const next = messages[i + 1];
                  const lastOfRun = !next || next.from !== m.from || next.kind === "system";
                  // a new speaker gets a little more room, like WhatsApp
                  const firstOfRun = !prev || prev.from !== m.from || prev.kind === "system" || showDay;
                  const highlighted = search.activeId === m.id || flashId === m.id;
                  return (
                    <div key={m.id} id={`ip-msg-${m.id}`} className={`${firstOfRun && i > 0 ? "pt-1.5" : ""} rounded-xl transition-shadow ${highlighted ? "ring-2 ring-brand-400/70" : ""}`}>
                      {showDay && (
                        <div className="my-2 flex justify-center">
                          <span className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-medium text-neutralx-600 shadow-sm">{dayLabel(m.at)}</span>
                        </div>
                      )}
                      {sticky.dividerId === m.id && (
                        <div className="my-2 flex items-center gap-2" role="separator">
                          <span className="h-px flex-1 bg-black/10" />
                          <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-neutralx-600 shadow-sm">
                            {unreadAtOpen === 1 ? "1 ongelezen bericht" : `${unreadAtOpen} ongelezen berichten`}
                          </span>
                          <span className="h-px flex-1 bg-black/10" />
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
                        onReply={(r) => {
                          setEditing(null);
                          setReplyTo(r);
                        }}
                        onAvatarClick={setCardUser}
                        onReact={react}
                        onDelete={del}
                        onEdit={(e) => {
                          setReplyTo(null);
                          setEditing(e);
                        }}
                        onForward={setForwarding}
                        onPin={togglePin}
                        onRetry={retry}
                        onDiscard={discard}
                        onJumpTo={(id) => {
                          if (!jumpTo(id)) say("Dat bericht staat verder terug in het gesprek.");
                        }}
                        onOpenImage={(src, filename) => setViewer({ src, filename })}
                        onNotice={say}
                        onStar={(s) => void toggleSaved(activeThread.id, s.id, !savedHere.includes(s.id))}
                        starred={savedHere.includes(m.id)}
                        {...(me ? { myUserId: me.userId } : {})}
                        {...(pinned ? { pinnedId: pinned.id } : {})}
                      />
                    </div>
                  );
                })}
                {typing && (
                  <div className="flex justify-start pt-1">
                    <div className="rounded-2xl rounded-tl-none bg-white px-3 py-2.5 shadow-sm" aria-label="aan het typen">
                      <span className="flex gap-1">
                        <Dot /><Dot d="0.15s" /><Dot d="0.3s" />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {!sticky.atBottom && messages.length > 0 && (
              <button
                type="button"
                onClick={() => sticky.toBottom()}
                className="absolute bottom-3 right-3 z-[3] grid h-10 w-10 place-items-center rounded-full bg-white text-neutralx-600 shadow-lift ring-1 ring-black/5 hover:text-ink"
                aria-label={sticky.newCount ? `${sticky.newCount} nieuwe berichten, naar beneden` : "Naar het nieuwste bericht"}
                title="Naar het nieuwste bericht"
              >
                <IconChevronDown className="h-5 w-5" />
                {sticky.newCount > 0 && (
                  <span className="absolute -right-1 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#1DA851] px-1 text-[11px] font-bold text-white">{sticky.newCount}</span>
                )}
              </button>
            )}
          </div>

          {activeThread.kind === "direct" && chatPrefs.blocked.includes(activeOther.userId) ? (
            <div className="flex items-center justify-center gap-3 border-t border-hair px-4 py-3 text-sm text-neutralx-600">
              Je hebt {activeOther.name} geblokkeerd.
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
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onSend={send}
            onTyping={pingTyping}
            lastIncoming={[...messages].reverse().find((m) => m.from !== me?.userId && m.text)?.text ?? ""}
            {...(replyTo ? { replyName: replyTo.from === me?.userId ? "jezelf" : (dir[replyTo.from]?.name ?? (activeThread.kind === "support" ? "Support" : activeOther.name)) } : {})}
            onEditLast={() => {
              const last = [...messages].reverse().find((m) => canEdit(m, me?.userId));
              if (last) {
                setReplyTo(null);
                setEditing(last);
              }
            }}
            droppedFile={dropped}
            onDropHandled={clearDropped}
          />
          )}
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-[5] flex justify-center px-4">
          <p role={notice.error ? "alert" : "status"} className={`pointer-events-auto rounded-full px-4 py-2 text-sm font-medium shadow-lift ${notice.error ? "bg-crit text-white" : "bg-[#1F2C34] text-white"}`}>
            {notice.text}
          </p>
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
      {forwarding && (
        <Portal>
          <ForwardPicker
            items={threads.filter((t) => t.id !== active).map((t) => ({ id: t.id, label: otherOf(t).name }))}
            onPick={doForward}
            onClose={() => setForwarding(null)}
          />
        </Portal>
      )}
      {viewer && <ImageViewer src={viewer.src} filename={viewer.filename} onClose={() => setViewer(null)} />}
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
