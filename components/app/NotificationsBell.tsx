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
  group?: string;
}

const SEEN_KEY = "zf-notif-seen";

// Thematische tabbladen (zoals de YoungOnes-meldingenweergave).
const GROUPS: { id: string; label: string }[] = [
  { id: "klussen", label: "Over je klussen" },
  { id: "geld", label: "Uren & uitbetaling" },
  { id: "berichten", label: "Berichten" },
  { id: "account", label: "Account" },
];
const GROUP_ORDER = GROUPS.map((g) => g.id);

const ICON: Record<string, string> = {
  chat: "💬",
  shift: "📅",
  offer: "💶",
  action: "⚡",
  verification: "🪪",
  info: "ℹ️",
};

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

type Section = "today" | "yesterday" | "earlier";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "today", label: "Vandaag" },
  { id: "yesterday", label: "Gisteren" },
  { id: "earlier", label: "Eerder" },
];
function sectionOf(iso: string, now = new Date()): Section {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (t >= startToday) return "today";
  if (t >= startToday - 86_400_000) return "yesterday";
  return "earlier";
}

/** Bell + meldingen-weergave. `dark` styles it for the admin surface. */
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
  const groups = useMemo(() => {
    const present = new Set(visible.map((i) => i.group ?? "klussen"));
    return GROUP_ORDER.filter((g) => present.has(g));
  }, [visible]);
  const shown = useMemo(() => {
    const list = filter === "all" ? visible : visible.filter((i) => (i.group ?? "klussen") === filter);
    return [...list].sort((a, b) => (a.at < b.at ? 1 : -1)); // nieuwste eerst, voor de datumgroepen
  }, [visible, filter]);
  const countByGroup = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of visible) m[i.group ?? "klussen"] = (m[i.group ?? "klussen"] ?? 0) + 1;
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
  const linkColor = dark ? "var(--a-text)" : "#0E5C4A";

  const tabClass = (active: boolean) =>
    `flex-shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2 pt-1 text-sm font-semibold transition ${
      active ? "border-brand-mint text-ink" : "border-transparent text-neutralx-400 hover:text-neutralx-600"
    }`;

  function ItemRow({ it }: { it: Item }) {
    return (
      <li className="py-3.5" style={{ borderBottom: rowBorder }}>
        <div className="flex items-start gap-2">
          <span className="text-base leading-none">{ICON[it.kind] ?? "•"}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold" style={dark ? { color: "var(--a-text)" } : { color: "#1A1F27" }}>
                <span className="min-w-0">{it.title}</span>
                {it.urgent && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#f87171]" />}
              </span>
              <span className="flex-shrink-0 text-xs" style={mute}>
                {dateLabel(it.at)}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed" style={dark ? { color: "var(--a-mute)" } : { color: "#616B78" }}>
              {it.body}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {it.action?.type === "confirm" && (
                <button
                  type="button"
                  onClick={() => confirmShift(it)}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
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
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={openBtnStyle}
              >
                Openen
              </Link>
              <button type="button" onClick={() => dismiss(it)} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={readBtnStyle}>
                Gelezen
              </button>
            </div>
          </div>
        </div>
      </li>
    );
  }

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
          className="absolute right-0 top-full z-[60] mt-2 flex max-h-[min(36rem,calc(100dvh-5rem))] w-[min(26rem,calc(100vw-1.25rem))] flex-col overflow-hidden rounded-xl bg-white shadow-lift"
          style={panelStyle}
        >
          {/* Koptekst */}
          <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: borderCol }}>
            <span className="text-base font-bold tracking-tight">Meldingen</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluiten"
              className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-neutralx-400 hover:text-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Tabbladen (horizontaal scrollbaar) */}
          <div className="flex gap-5 overflow-x-auto border-b px-4" style={{ borderColor: borderCol }}>
            <button type="button" onClick={() => setFilter("all")} className={tabClass(filter === "all")}>
              Alles{visible.length > 0 ? ` ${visible.length}` : ""}
            </button>
            {groups.map((g) => (
              <button key={g} type="button" onClick={() => setFilter(g)} className={tabClass(filter === g)}>
                {GROUPS.find((x) => x.id === g)?.label ?? g} {countByGroup[g] ?? 0}
              </button>
            ))}
          </div>

          {/* Alles als gelezen markeren */}
          {visible.length > 0 && (
            <div className="flex justify-end border-b px-4 py-2" style={{ borderColor: borderCol }}>
              <button type="button" onClick={dismissAll} className="text-xs font-semibold hover:underline" style={{ color: linkColor }}>
                Alles als gelezen markeren
              </button>
            </div>
          )}

          {/* Lijst, gegroepeerd per dag */}
          <div className="flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)]">
            {shown.length === 0 ? (
              <p className="px-1 py-12 text-center text-sm" style={mute}>
                {visible.length === 0 ? "Niets nieuws — je bent bij." : "Geen meldingen in dit tabblad."}
              </p>
            ) : (
              SECTIONS.map((sec) => {
                const its = shown.filter((i) => sectionOf(i.at) === sec.id);
                if (its.length === 0) return null;
                return (
                  <div key={sec.id}>
                    <p className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide" style={mute}>
                      {sec.label}
                    </p>
                    <ul>
                      {its.map((it) => (
                        <ItemRow key={it.id} it={it} />
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
