"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  at: string;
  urgent: boolean;
  action?: { type: string; id: string; label: string };
}

const SEEN_KEY = "zf-notif-seen";

const ICON: Record<string, string> = {
  chat: "💬",
  shift: "📅",
  offer: "💶",
  action: "⚡",
  verification: "🪪",
  info: "ℹ️",
};
const LABEL: Record<string, string> = {
  chat: "Chat",
  shift: "Klussen",
  offer: "Aanbod",
  action: "Acties",
  verification: "Verificatie",
  info: "Info",
};
// preferred chip order; only kinds actually present are shown
const KIND_ORDER = ["action", "offer", "shift", "chat", "verification", "info"];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "zojuist";
  if (m < 60) return `${m} min geleden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.floor(h / 24);
  return `${d} dag${d === 1 ? "" : "en"} geleden`;
}

/** Bell + dropdown. `dark` styles it for the admin surface. */
export function NotificationsBell({ dark = false }: { dark?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/me/notifications", { cache: "no-store" });
      if (r.ok) setItems((await r.json()).items ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      setSeenAt(Number(localStorage.getItem(SEEN_KEY) ?? 0));
    } catch {
      /* ignore */
    }
    void load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const visible = useMemo(() => items.filter((i) => !hidden.has(i.id)), [items, hidden]);
  const kinds = useMemo(() => {
    const present = new Set(visible.map((i) => i.kind));
    return KIND_ORDER.filter((k) => present.has(k));
  }, [visible]);
  const shown = useMemo(() => (filter === "all" ? visible : visible.filter((i) => i.kind === filter)), [visible, filter]);
  const countByKind = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of visible) m[i.kind] = (m[i.kind] ?? 0) + 1;
    return m;
  }, [visible]);

  const unseen = visible.filter((i) => new Date(i.at).getTime() > seenAt).length;

  const markSeen = () => {
    const now = Date.now();
    setSeenAt(now);
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      /* ignore */
    }
  };

  // Weggeklikte meldingen meteen verbergen (optimistisch) én server-side
  // "gelezen" markeren, zodat ze ook op andere apparaten weg blijven.
  const hide = (ids: string[]) => setHidden((prev) => new Set([...prev, ...ids]));
  const postDismiss = (list: { id: string; body: string }[]) => {
    if (list.length === 0) return;
    void fetch("/api/me/notifications/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: list.slice(0, 50) }),
    }).catch(() => undefined);
  };
  const dismiss = (it: Item) => {
    hide([it.id]);
    postDismiss([{ id: it.id, body: it.body }]);
  };
  const dismissAll = () => {
    hide(visible.map((i) => i.id));
    postDismiss(visible.map((i) => ({ id: i.id, body: i.body })));
  };
  const confirmShift = (it: Item) => {
    if (!it.action) return;
    hide([it.id]);
    void fetch("/api/me/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: it.action.id }),
    }).catch(() => undefined);
  };

  const panelStyle = dark
    ? { background: "var(--a-panel)", border: "1px solid var(--a-border-strong)", color: "var(--a-text)" }
    : {};
  const mute = dark ? { color: "var(--a-mute)" } : { color: "#8A93A0" };
  const borderCol = dark ? "var(--a-border)" : "#E6E7E1";
  const rowBorder = dark ? "1px solid var(--a-border)" : "1px solid #F0F0EC";
  const openBtnStyle = dark
    ? { background: "var(--a-elev)", border: "1px solid var(--a-border)", color: "var(--a-text)" }
    : { background: "#EAF7F1", color: "#0E5C4A" };
  const readBtnStyle = dark
    ? { background: "transparent", border: "1px solid var(--a-border)", color: "var(--a-mute)" }
    : { background: "transparent", border: "1px solid #E6E7E1", color: "#616B78" };

  const chip = (active: boolean) =>
    `flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? "bg-brand-600 text-white" : dark ? "" : "bg-black/[0.04] text-neutralx-600 hover:bg-black/[0.07]"
    }`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markSeen();
        }}
        className={
          dark
            ? "relative grid h-9 w-9 place-items-center rounded-xl"
            : "relative grid h-9 w-9 place-items-center rounded-lg border border-hairstrong text-neutralx-500 hover:text-ink"
        }
        style={dark ? { background: "var(--a-elev)", border: "1px solid var(--a-border)", color: "var(--a-text)" } : {}}
        aria-label="Meldingen"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 16V10a6 6 0 1 1 12 0v6l2 2H4l2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {unseen > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#f87171] px-1 text-[9px] font-bold text-white">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-[60] mt-2 flex max-h-[min(32rem,calc(100dvh-5rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl bg-white shadow-lift"
          style={panelStyle}
        >
          {/* header */}
          <div
            className="flex items-center justify-between border-b px-4 py-2.5 text-sm font-semibold"
            style={{ borderColor: borderCol }}
          >
            <span>Meldingen{visible.length > 0 ? <span className="ml-1 font-normal" style={mute}>({visible.length})</span> : null}</span>
            {visible.length > 0 && (
              <button type="button" onClick={dismissAll} className="text-xs font-medium hover:underline" style={{ color: dark ? "var(--a-text)" : "#0E5C4A" }}>
                Alles gelezen
              </button>
            )}
          </div>

          {/* scroll-selectie: categorie-chips */}
          {kinds.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2" style={{ borderColor: borderCol }}>
              <button type="button" onClick={() => setFilter("all")} className={chip(filter === "all")} style={dark && filter !== "all" ? { background: "var(--a-elev)", color: "var(--a-text)" } : {}}>
                Alles {visible.length}
              </button>
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={chip(filter === k)}
                  style={dark && filter !== k ? { background: "var(--a-elev)", color: "var(--a-text)" } : {}}
                >
                  {ICON[k] ?? "•"} {LABEL[k] ?? k} {countByKind[k] ?? 0}
                </button>
              ))}
            </div>
          )}

          {/* scrollbare lijst */}
          <div className="flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm" style={mute}>
                {visible.length === 0 ? "Niets nieuws — je bent bij." : "Geen meldingen in deze categorie."}
              </p>
            ) : (
              <ul>
                {shown.map((it) => (
                  <li key={it.id} className="px-4 py-3" style={{ borderBottom: rowBorder }}>
                    <div className="flex gap-3">
                      <span className="text-base leading-none">{ICON[it.kind] ?? "•"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium" style={dark ? { color: "var(--a-text)" } : { color: "#1A1F27" }}>
                            {it.title}
                          </span>
                          {it.urgent && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#f87171]" />}
                        </div>
                        <p className="mt-0.5 text-xs" style={dark ? { color: "var(--a-mute)" } : { color: "#616B78" }}>
                          {it.body}
                        </p>
                        <p className="mt-0.5 text-[11px]" style={mute}>
                          {timeAgo(it.at)}
                        </p>
                        {/* geschijden knopjes per melding */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {it.action?.type === "confirm" && (
                            <button
                              type="button"
                              onClick={() => confirmShift(it)}
                              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              {it.action.label}
                            </button>
                          )}
                          <Link
                            href={it.href}
                            onClick={() => {
                              markSeen();
                              setOpen(false);
                            }}
                            className="rounded-md px-3 py-1.5 text-xs font-semibold"
                            style={openBtnStyle}
                          >
                            Openen
                          </Link>
                          <button
                            type="button"
                            onClick={() => dismiss(it)}
                            className="rounded-md px-3 py-1.5 text-xs font-medium"
                            style={readBtnStyle}
                          >
                            Gelezen
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
