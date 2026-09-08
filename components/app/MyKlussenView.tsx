"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MyWorkItem } from "@/lib/dashboard/my-work";
import { ShiftCard } from "@/components/app/ShiftCard";
import { CompanyReviewInline } from "@/components/app/CompanyReviewInline";

type TabId = "pending" | "active" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "pending", label: "In afwachting" },
  { id: "active", label: "Uitgekozen" },
  { id: "history", label: "Gearchiveerd" },
];

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function MyKlussenView({
  work,
}: {
  work: { pending: MyWorkItem[]; active: MyWorkItem[]; history: MyWorkItem[] };
}) {
  const [tab, setTab] = useState<TabId>(
    work.pending.length > 0
      ? "pending"
      : work.active.length > 0
        ? "active"
        : work.history.length > 0
          ? "history"
          : "pending",
  );
  const [panel, setPanel] = useState(false);
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [days, setDays] = useState<Set<string>>(new Set());

  const items = work[tab];

  const dayOptions = useMemo(() => {
    const seen = new Map<string, Date>();
    for (const it of items) {
      const d = new Date(it.shift.startsAt);
      if (!seen.has(dayKey(d))) seen.set(dayKey(d), d);
    }
    return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, 21);
  }, [items]);

  const shown = useMemo(() => {
    let out = days.size
      ? items.filter((it) => days.has(dayKey(new Date(it.shift.startsAt))))
      : [...items];
    out.sort((a, b) => {
      const d = new Date(a.shift.startsAt).getTime() - new Date(b.shift.startsAt).getTime();
      return order === "asc" ? d : -d;
    });
    return out;
  }, [items, days, order]);

  return (
    <div>
      {/* Tabs */}
      <div className="mb-4 flex gap-6 border-b border-hair">
        {TABS.map((t) => {
          const active = tab === t.id;
          const n = work[t.id].length;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setDays(new Set());
              }}
              className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition ${
                active
                  ? "border-brand-mint text-ink"
                  : "border-transparent text-neutralx-400 hover:text-neutralx-600"
              }`}
            >
              {t.label}
              {n > 0 && <span className="ml-1.5 text-xs text-neutralx-400">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* Filter row */}
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPanel((v) => !v)}
          aria-label="Filters"
          className={`grid h-9 w-9 place-items-center rounded-full border ${
            panel || days.size ? "border-brand-500 bg-brand-mint text-ink" : "border-hairstrong bg-white text-neutralx-600"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
          aria-label="Sorteervolgorde"
          className="grid h-9 w-9 place-items-center rounded-full border border-hairstrong bg-white text-neutralx-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d={order === "asc" ? "M7 4v16M7 20l-3-3M7 20l3-3M12 6h9M12 12h6M12 18h3" : "M7 20V4M7 4l-3 3M7 4l3 3M12 6h9M12 12h6M12 18h3"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {dayOptions.length > 0 && (
          <button
            type="button"
            onClick={() => setPanel((v) => !v)}
            className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              days.size ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong bg-white text-neutralx-600"
            }`}
          >
            Dagen{days.size ? ` (${days.size})` : ""}
            <span className="text-[9px]" aria-hidden>▼</span>
          </button>
        )}
      </div>

      {panel && (
        <div className="mb-5 rounded-xl border border-hair bg-white p-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOrder("asc")}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${order === "asc" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}
            >
              Datum oplopend
            </button>
            <button
              type="button"
              onClick={() => setOrder("desc")}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${order === "desc" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}
            >
              Datum aflopend
            </button>
          </div>
          {dayOptions.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold text-neutralx-500">Welke dagen</p>
              <div className="flex flex-wrap gap-1.5">
                {dayOptions.map(([k, d]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setDays((prev) => {
                        const n = new Set(prev);
                        n.has(k) ? n.delete(k) : n.add(k);
                        return n;
                      })
                    }
                    className={`rounded-lg border px-2 py-1 text-[11px] ${days.has(k) ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong text-neutralx-600"}`}
                  >
                    {WD[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                  </button>
                ))}
              </div>
              {days.size > 0 && (
                <button type="button" onClick={() => setDays(new Set())} className="mt-2 text-xs text-brand-600 hover:underline">
                  Wis dagen
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <Empty tab={tab} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((item) => (
            <ShiftCard
              key={(item.assignmentId ?? item.shift.id) + item.status}
              shift={item.shift}
              href={`/dashboard/klussen/${item.shift.id}`}
              idReminder={tab === "active"}
              dim={tab === "history" && item.status !== "done"}
              footerOverride={
                tab === "pending" ? null : tab === "active" ? (
                  <ActiveFooter item={item} />
                ) : (
                  <div className="space-y-3">
                    <HistoryFooter item={item} />
                    {item.status === "done" && item.clientTenantId && (
                      <CompanyReviewInline tenantId={item.clientTenantId} shiftId={item.shift.id} />
                    )}
                  </div>
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveFooter({ item }: { item: MyWorkItem }) {
  if (item.replacementRequested && item.replacementRequestId) {
    return (
      <Link
        href={`/dashboard/diensten/vervanging/${item.replacementRequestId}`}
        className="flex items-center justify-between text-sm font-semibold text-warn"
      >
        <span>
          Vervanging gevraagd
          {item.replacementResponseCount > 0 ? ` · ${item.replacementResponseCount} reacties` : ""}
        </span>
        <span aria-hidden>→</span>
      </Link>
    );
  }
  return (
    <Link
      href={`/dashboard/klussen/${item.shift.id}`}
      className="flex items-center justify-between text-sm font-semibold text-ink"
    >
      <span>Dit is jouw klus! 🎉</span>
      <span aria-hidden>→</span>
    </Link>
  );
}

function HistoryFooter({ item }: { item: MyWorkItem }) {
  if (item.status === "cancelled") {
    return <p className="text-sm font-semibold text-crit">Geannuleerd</p>;
  }
  if (item.status === "rejected") {
    return (
      <p className="text-sm font-semibold text-neutralx-500">
        {item.offerRateCents ? "Tegenbod afgewezen" : "Niet uitgekozen"}
      </p>
    );
  }
  switch (item.timesheetStatus) {
    case "PAID":
      return <p className="text-sm font-semibold text-ink">Je bent betaald 💸</p>;
    case "APPROVED":
      return (
        <div>
          <p className="text-sm font-semibold text-ink">Je uren zijn goedgekeurd 🕊️</p>
          <p className="mt-0.5 text-xs text-neutralx-500">Je krijgt betaald binnen 1 minuut.</p>
        </div>
      );
    case "SUBMITTED":
      return <p className="text-sm font-semibold text-ink">Je uren zijn ingediend ✅</p>;
    case "DISPUTED":
      return <p className="text-sm font-semibold text-warn">Je uren zijn in dispuut</p>;
    default:
      return (
        <Link
          href={item.timesheetId ? `/dashboard/uren/${item.timesheetId}` : "/dashboard/uren"}
          className="flex items-center justify-between text-sm font-semibold text-brand-600"
        >
          <span>Vul je uren in</span>
          <span aria-hidden>→</span>
        </Link>
      );
  }
}

function Empty({ tab }: { tab: TabId }) {
  const text =
    tab === "pending"
      ? "Geen openstaande aanmeldingen of tegenbiedingen."
      : tab === "active"
        ? "Nog geen bevestigde klussen. Neem er een aan bij Ontdekken."
        : "Nog geen historie.";
  return (
    <div className="rounded-2xl border border-dashed border-hairstrong bg-white/60 px-5 py-12 text-center text-sm text-neutralx-500">
      {text}
    </div>
  );
}
