"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Dict = Record<
  | "title" | "subtitle" | "add" | "addTitle" | "fieldTitle" | "fieldDate" | "fieldStart" | "fieldEnd" | "fieldAllDay"
  | "fieldLocation" | "save" | "saving" | "cancel" | "empty" | "today" | "tomorrow" | "allDay" | "delete" | "deleteConfirm"
  | "sourceMail" | "sourceIcs" | "sourceChat" | "sourceWhatsapp" | "sourceManual" | "sourceShift" | "sources"
  | "sourceMailConnected" | "sourceMailConnect" | "sourceChatOn" | "sourceWhatsappImport" | "autoNote" | "loading" | "filled",
  string
>;

interface Item {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  source: "mail" | "ics" | "chat" | "whatsapp" | "manual";
  sourceLabel: string;
  phrase: string | null;
}
interface Shift {
  id: string;
  title: string;
  branch: string;
  start: string;
  end: string;
  positions: number;
  filled: number;
}
type Entry = { kind: "item"; at: string; item: Item } | { kind: "shift"; at: string; shift: Shift };

const TZ = "Europe/Amsterdam";
const DAY = 24 * 60 * 60_000;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const BADGE: Record<Item["source"] | "shift", string> = {
  mail: "bg-sky-100 text-sky-800",
  ics: "bg-violet-100 text-violet-800",
  chat: "bg-brand-50 text-brand-700",
  whatsapp: "bg-emerald-100 text-emerald-800",
  manual: "bg-paper-soft text-neutralx-600",
  shift: "bg-warn/10 text-warn",
};

export function AgendaView({
  t,
  withShifts,
  mailHref,
  whatsappHref,
  shiftHrefBase,
}: {
  t: Dict;
  withShifts: boolean;
  mailHref: string;
  whatsappHref: string;
  /** e.g. "/werkgever/diensten/" — the shift id is appended */
  shiftHrefBase?: string;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [mailConnected, setMailConnected] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const from = new Date(Date.now() - DAY).toISOString();
    const to = new Date(Date.now() + 90 * DAY).toISOString();
    const res = await fetch(`/api/me/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${withShifts ? "&shifts=1" : ""}`, {
      cache: "no-store",
    }).catch(() => null);
    if (!res?.ok) return setItems([]);
    const d = await res.json();
    setItems(d.items);
    setShifts(d.shifts ?? []);
  }, [withShifts]);

  useEffect(() => {
    void load();
    fetch("/api/me/mailbox", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { connected: false }))
      .then((d) => setMailConnected(Boolean(d.connected)))
      .catch(() => setMailConnected(false));
  }, [load]);

  async function remove(item: Item) {
    if (!window.confirm(fill(t.deleteConfirm, { title: item.title }))) return;
    await fetch(`/api/me/agenda/${item.id}`, { method: "DELETE" }).catch(() => undefined);
    setItems((cur) => (cur ?? []).filter((i) => i.id !== item.id));
  }

  const days = useMemo(() => {
    const todayStart = new Date(`${dayKey(new Date().toISOString())}T00:00:00`).getTime();
    const entries: Entry[] = [
      ...(items ?? []).map((item) => ({ kind: "item" as const, at: item.start, item })),
      ...shifts.map((shift) => ({ kind: "shift" as const, at: shift.start, shift })),
    ].filter((e) => new Date(e.kind === "item" ? (e.item.end ?? e.item.start) : e.shift.end).getTime() >= todayStart);
    entries.sort((a, b) => {
      const aAllDay = a.kind === "item" && a.item.allDay;
      const bAllDay = b.kind === "item" && b.item.allDay;
      return dayKey(a.at) === dayKey(b.at) && aAllDay !== bAllDay ? (aAllDay ? -1 : 1) : a.at < b.at ? -1 : 1;
    });
    const groups = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = dayKey(e.at);
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    return [...groups.entries()];
  }, [items, shifts]);

  const label = (key: string) => {
    const today = dayKey(new Date().toISOString());
    const tomorrow = dayKey(new Date(Date.now() + DAY).toISOString());
    if (key === today) return t.today;
    if (key === tomorrow) return t.tomorrow;
    return new Date(`${key}T12:00:00`).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  };
  const sourceName: Record<Item["source"], string> = {
    mail: t.sourceMail,
    ics: t.sourceIcs,
    chat: t.sourceChat,
    whatsapp: t.sourceWhatsapp,
    manual: t.sourceManual,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{t.title}</h1>
          <p className="mt-1 text-sm text-neutralx-600">{t.subtitle}</p>
        </div>
        <button type="button" onClick={() => setAdding((v) => !v)} className="btn-primary text-sm">
          {t.add}
        </button>
      </div>

      {adding && <AddForm t={t} onDone={() => { setAdding(false); void load(); }} onCancel={() => setAdding(false)} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="card overflow-hidden">
          {items === null ? (
            <p className="px-5 py-10 text-center text-sm text-neutralx-400">{t.loading}</p>
          ) : days.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-neutralx-500">{t.empty}</p>
          ) : (
            days.map(([key, entries]) => (
              <section key={key} className="border-b border-hair last:border-b-0">
                <h2 className="bg-paper-soft px-5 py-2 text-xs font-semibold uppercase tracking-wide text-neutralx-500">{label(key)}</h2>
                <ul className="divide-y divide-hair">
                  {entries.map((e) =>
                    e.kind === "shift" ? (
                      <li key={`s-${e.shift.id}`} className="flex items-start gap-4 px-5 py-3">
                        <span className="num w-24 flex-shrink-0 text-sm text-neutralx-600">
                          {clock(e.shift.start)}–{clock(e.shift.end)}
                        </span>
                        <span className="min-w-0 flex-1">
                          {shiftHrefBase ? (
                            <Link href={`${shiftHrefBase}${e.shift.id}`} className="block truncate text-sm font-semibold text-ink hover:underline">
                              {e.shift.title}
                            </Link>
                          ) : (
                            <span className="block truncate text-sm font-semibold text-ink">{e.shift.title}</span>
                          )}
                          <span className="block text-xs text-neutralx-500">
                            {e.shift.branch} · {fill(t.filled, { filled: e.shift.filled, positions: e.shift.positions })}
                          </span>
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE.shift}`}>{t.sourceShift}</span>
                      </li>
                    ) : (
                      <li key={e.item.id} className="group flex items-start gap-4 px-5 py-3">
                        <span className="num w-24 flex-shrink-0 text-sm text-neutralx-600">
                          {e.item.allDay ? t.allDay : `${clock(e.item.start)}${e.item.end ? `–${clock(e.item.end)}` : ""}`}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink">{e.item.title}</span>
                          {e.item.location && <span className="block text-xs text-neutralx-600">📍 {e.item.location}</span>}
                          <span className="block text-xs text-neutralx-400">
                            {e.item.sourceLabel}
                            {e.item.phrase ? ` · “${e.item.phrase.length > 90 ? `${e.item.phrase.slice(0, 90)}…` : e.item.phrase}”` : ""}
                          </span>
                        </span>
                        <span className="flex flex-shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[e.item.source]}`}>{sourceName[e.item.source]}</span>
                          <button
                            type="button"
                            onClick={() => void remove(e.item)}
                            className="text-[11px] text-neutralx-400 opacity-0 hover:text-crit group-hover:opacity-100 focus:opacity-100"
                          >
                            {t.delete}
                          </button>
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            ))
          )}
        </div>

        <aside className="card h-fit space-y-3 p-5 text-sm">
          <p className="font-semibold text-ink">{t.sources}</p>
          <ul className="space-y-2">
            <li className="flex items-center justify-between gap-2">
              <span>✉️ {t.sourceMail}</span>
              {mailConnected ? (
                <span className="text-xs font-semibold text-ok">{t.sourceMailConnected}</span>
              ) : (
                <Link href={mailHref} className="text-xs font-semibold text-brand-600 hover:underline">
                  {t.sourceMailConnect}
                </Link>
              )}
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>💬 {t.sourceChat}</span>
              <span className="text-xs text-ok">{t.sourceChatOn}</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>🟢 {t.sourceWhatsapp}</span>
              <Link href={whatsappHref} className="text-xs font-semibold text-brand-600 hover:underline">
                {t.sourceWhatsappImport}
              </Link>
            </li>
          </ul>
          <p className="text-xs leading-relaxed text-neutralx-500">{t.autoNote}</p>
        </aside>
      </div>
    </div>
  );
}

function AddForm({ t, onDone, onCancel }: { t: Dict; onDone: () => void; onCancel: () => void }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // the browser's local time, which is what the person typed
      const startAt = new Date(`${date}T${allDay ? "00:00" : start}:00`);
      const endAt = allDay ? null : new Date(`${date}T${end}:00`);
      const res = await fetch("/api/me/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          start: startAt.toISOString(),
          end: endAt && endAt > startAt ? endAt.toISOString() : null,
          allDay,
          location: location.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error?.message ?? "Opslaan mislukt.");
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
  return (
    <div className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto_auto_auto]">
      <p className="text-sm font-semibold text-ink sm:col-span-2 lg:col-span-5">{t.addTitle}</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.fieldTitle} className={field} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t.fieldDate} className={field} />
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={allDay} aria-label={t.fieldStart} className={field} />
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={allDay} aria-label={t.fieldEnd} className={field} />
      <label className="flex items-center gap-2 text-sm text-neutralx-600">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> {t.fieldAllDay}
      </label>
      <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t.fieldLocation} className={`${field} sm:col-span-2`} />
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
        <button type="button" onClick={save} disabled={busy || !title.trim() || !date} className="btn-primary text-sm disabled:opacity-50">
          {busy ? t.saving : t.save}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost text-sm">
          {t.cancel}
        </button>
        {error && <span role="alert" className="text-sm text-crit">{error}</span>}
      </div>
    </div>
  );
}
