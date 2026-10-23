"use client";

import { ColorLegend } from "@/components/app/ColorLegend";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { MyWorkItem } from "@/lib/dashboard/my-work";
import { ShiftCard } from "@/components/app/ShiftCard";
import { ShiftActions } from "@/components/app/ShiftActions";
import { CompanyReviewInline } from "@/components/app/CompanyReviewInline";
import { CancellationClaimButton } from "@/components/app/CancellationClaimButton";
import { dismissWorkItemAction } from "@/app/dashboard/diensten/actions";
import { useFT } from "@/components/i18n/I18nProvider";
import type { FreelancerDict } from "@/lib/i18n/freelancer";

type TabId = "pending" | "active" | "history";

const TABS: { id: TabId; key: "tabPending" | "tabActive" | "tabHistory" }[] = [
  { id: "pending", key: "tabPending" },
  { id: "active", key: "tabActive" },
  { id: "history", key: "tabHistory" },
];
type W = FreelancerDict["work"];
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function MyKlussenView({
  work,
}: {
  work: { pending: MyWorkItem[]; active: MyWorkItem[]; history: MyWorkItem[] };
}) {
  const ft = useFT();
  const w = ft.work;
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
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function hideItem(workKey: string) {
    setHidden((prev) => new Set(prev).add(workKey));
    void dismissWorkItemAction(workKey);
  }

  const items = work[tab].filter((it) => !hidden.has(it.workKey));

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
              {w[t.key]}
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
          aria-label={w.filters}
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
          aria-label={w.sortOrder}
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
            {w.days}{days.size ? ` (${days.size})` : ""}
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
              {w.dateAsc}
            </button>
            <button
              type="button"
              onClick={() => setOrder("desc")}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${order === "desc" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}
            >
              {w.dateDesc}
            </button>
          </div>
          {dayOptions.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold text-neutralx-500">{w.whichDays}</p>
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
                    {ft.date.wd[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                  </button>
                ))}
              </div>
              {days.size > 0 && (
                <button type="button" onClick={() => setDays(new Set())} className="mt-2 text-xs text-brand-600 hover:underline">
                  {w.clearDays}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <Empty tab={tab} w={w} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((item) => (
            <ShiftCard
              key={item.workKey}
              shift={item.shift}
              t={ft}
              href={`/dashboard/klussen/${item.shift.id}`}
              idReminder={tab === "active"}
              dim={tab === "history" && item.status !== "done"}
              footerOverride={
                tab === "pending" ? null : tab === "active" ? (
                  <ActiveFooter item={item} w={w} />
                ) : (
                  <div className="space-y-3">
                    <HistoryFooter item={item} onHide={hideItem} w={w} />
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
      <ColorLegend className="mt-6" />
    </div>
  );
}

function ActiveFooter({ item, w }: { item: MyWorkItem; w: W }) {
  const startMs = new Date(item.shift.startsAt).getTime();
  const endMs = new Date(item.shift.endsAt).getTime();

  // Op de dag van de klus: inchecken/uitchecken heeft voorrang boven de rest.
  if (item.timesheetId && Date.now() >= startMs - 60 * 60_000 && Date.now() <= endMs) {
    return (
      <Link href={`/dashboard/uren/${item.timesheetId}`} className="flex items-center justify-between rounded-xl bg-brand-500 px-3 py-2.5 text-sm font-semibold text-white">
        <span>{w.checkInOut}</span>
        <span aria-hidden>→</span>
      </Link>
    );
  }

  // Geaccepteerde reactie zónder echte toewijzing: dit gebeurt wanneer het
  // bedrijf nog niet geverifieerd is (reactie wordt bewaard, maar niemand wordt
  // ingepland). De actieknoppen horen bij een toewijzing, dus die tonen we hier
  // niet — wel een eerlijke status i.p.v. "Dit is jouw klus!".
  if (!item.assignmentId) {
    const over = endMs < Date.now();
    return (
      <div className="rounded-xl border border-hair bg-paper-soft px-4 py-3">
        <p className="text-sm font-semibold text-ink">Je reactie is geaccepteerd 🎉</p>
        <p className="mt-1 text-xs leading-relaxed text-neutralx-600">
          {over
            ? "Deze klus is inmiddels voorbij."
            : "Je wordt ingepland zodra alles rond is (o.a. verificatie van de opdrachtgever). Daarna kun je hier je komst bevestigen, de klus in je agenda zetten of een vervanger regelen."}
        </p>
        <Link
          href={`/dashboard/klussen/${item.shift.id}`}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
        >
          Bekijk klus <span aria-hidden>›</span>
        </Link>
      </div>
    );
  }

  // Alle acties direct op de kaart: bevestigen, in je agenda zetten, vervanging
  // regelen, afzeggen — plus de annuleertermijn en extra info. ShiftActions
  // regelt ook de "je zoekt vervanging"-staat zelf.
  return (
    <div className="space-y-3">
      <ShiftActions
        assignmentId={item.assignmentId}
        shiftId={item.shift.id}
        shiftTitle={item.shift.title}
        startsAtISO={new Date(item.shift.startsAt).toISOString()}
        confirmedAt={item.confirmedAt}
        replacementRequested={item.replacementRequested}
        replacementRequestId={item.replacementRequestId}
        replacementResponseCount={item.replacementResponseCount}
        variant="card"
      />
      <Link
        href={`/dashboard/klussen/${item.shift.id}`}
        className="block text-center text-xs font-medium text-neutralx-400 hover:text-brand-700"
      >
        {w.yourJob} ›
      </Link>
    </div>
  );
}

function HistoryFooter({ item, onHide, w }: { item: MyWorkItem; onHide: (workKey: string) => void; w: W }) {
  if (item.status === "cancelled") {
    if (item.cancelledByEmployer) {
      return (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-crit">{w.cancelledByClient}</p>
          <CancellationClaimButton shiftId={item.shift.id} shiftTitle={item.shift.title} />
        </div>
      );
    }
    return <p className="text-sm font-semibold text-crit">{w.cancelled}</p>;
  }
  if (item.status === "rejected") {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutralx-500">
          {item.offerRateCents ? w.counterDeclined : w.notChosen}
        </p>
        <button
          type="button"
          onClick={() => onHide(item.workKey)}
          className="flex-shrink-0 text-xs font-medium text-neutralx-400 underline-offset-2 hover:text-neutralx-600 hover:underline"
        >
          {w.hide}
        </button>
      </div>
    );
  }
  switch (item.timesheetStatus) {
    case "PAID":
      return <p className="text-sm font-semibold text-money">{w.paid}</p>;
    case "APPROVED":
      return (
        <div>
          <p className="text-sm font-semibold text-money">{w.approved}</p>
          <p className="mt-0.5 text-xs text-neutralx-500">{w.approvedBody}</p>
        </div>
      );
    case "SUBMITTED":
      return <p className="text-sm font-semibold text-plan-ink">{w.submitted}</p>;
    case "DISPUTED":
      return <p className="text-sm font-semibold text-warn">{w.disputed}</p>;
    default:
      return (
        <Link
          href={item.timesheetId ? `/dashboard/uren/${item.timesheetId}` : "/dashboard/uren"}
          className="flex items-center justify-between rounded-xl bg-warn/10 px-3 py-2.5 text-sm font-semibold text-warn"
        >
          <span>{w.fillHours}</span>
          <span aria-hidden>→</span>
        </Link>
      );
  }
}

function Empty({ tab, w }: { tab: TabId; w: W }) {
  const text = tab === "pending" ? w.emptyPending : tab === "active" ? w.emptyActive : w.emptyHistory;
  return (
    <div className="rounded-2xl border border-dashed border-hairstrong bg-white/60 px-5 py-12 text-center text-sm text-neutralx-500">
      {text}
    </div>
  );
}
