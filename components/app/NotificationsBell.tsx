"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  at: string;
  urgent: boolean;
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

/** Bell + dropdown. `dark` styles it for the admin surface. */
export function NotificationsBell({ dark = false }: { dark?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
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

  const unseen = items.filter((i) => new Date(i.at).getTime() > seenAt).length;

  const markSeen = () => {
    const now = Date.now();
    setSeenAt(now);
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      /* ignore */
    }
  };

  const panelStyle = dark
    ? { background: "var(--a-panel)", border: "1px solid var(--a-border-strong)", color: "var(--a-text)" }
    : {};

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
          className="absolute right-0 top-full z-[60] mt-2 max-h-[28rem] w-[22rem] overflow-hidden rounded-xl bg-white shadow-lift"
          style={panelStyle}
        >
          <div
            className="flex items-center justify-between border-b px-4 py-2.5 text-sm font-semibold"
            style={dark ? { borderColor: "var(--a-border)" } : { borderColor: "#E6E7E1" }}
          >
            <span>Meldingen</span>
            {items.length > 0 && (
              <span className="text-xs font-normal" style={dark ? { color: "var(--a-mute)" } : { color: "#8A93A0" }}>
                {items.length}
              </span>
            )}
          </div>
          <div className="max-h-[24rem] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm" style={dark ? { color: "var(--a-mute)" } : { color: "#8A93A0" }}>
                Niets nieuws — je bent bij.
              </p>
            ) : (
              <ul>
                {items.map((it) => (
                  <li key={it.id}>
                    <Link
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 text-sm transition hover:bg-black/[0.03]"
                      style={dark ? { borderBottom: "1px solid var(--a-border)" } : { borderBottom: "1px solid #F0F0EC" }}
                    >
                      <span className="text-base leading-none">{ICON[it.kind] ?? "•"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium" style={dark ? { color: "var(--a-text)" } : { color: "#1A1F27" }}>
                            {it.title}
                          </span>
                          {it.urgent && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#f87171]" />}
                        </span>
                        <span className="mt-0.5 block text-xs" style={dark ? { color: "var(--a-mute)" } : { color: "#616B78" }}>
                          {it.body}
                        </span>
                      </span>
                    </Link>
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
