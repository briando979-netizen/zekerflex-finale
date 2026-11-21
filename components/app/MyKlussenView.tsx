"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MyWorkItem } from "@/lib/dashboard/my-work";
import { ShiftCard } from "@/components/app/ShiftCard";
import { CompanyReviewInline } from "@/components/app/CompanyReviewInline";
import { CancellationClaimButton } from "@/components/app/CancellationClaimButton";
import { dismissWorkItemAction, dismissWorkItemsAction } from "@/app/dashboard/diensten/actions";
import { useFT } from "@/components/i18n/useFT";
import type { FreelancerDict } from "@/lib/i18n/freelancer";
import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";

// Mijn klussen in de opzet van de app van YoungOnes (21 nov 2026): een strakke tabbalk In afwachting · Uitgekozen ·
// Gearchiveerd met een turquoise streep onder de actieve tab, de kaarten eronder, en een lege staat als gewone zin.
// De kop "Mijn klussen" staat in de balk bovenaan (FreelancerShell), niet nog eens op de pagina.

type TabId = "pending" | "active" | "history";

const TABS: { id: TabId; key: "tabPending" | "tabActive" | "tabHistory" }[] = [
  { id: "pending", key: "tabPending" },
  { id: "active", key: "tabActive" },
  { id: "history", key: "tabHistory" },
];
type W = FreelancerDict["work"];
// Dutch days: rendered on the UTC server first, and shifts happen in Dutch time.
const dayKey = (d: Date) => amsterdamDayKey(d);

export function MyKlussenView({
  work,
}: {
  /** notChosen: klussen you were not chosen for — shown under "Gearchiveerd", apart from the real archive */
  work: { pending: MyWorkItem[]; active: MyWorkItem[]; history: MyWorkItem[]; notChosen?: MyWorkItem[] };
}) {
  const ft = useFT();
  const w = ft.work;
  // Open op Uitgekozen zodra er iets is uitgekozen; anders op wat er wel is; leeg → Uitgekozen (zoals YoungOnes).
  const [tab, setTab] = useState<TabId>(
    work.active.length > 0
      ? "active"
      : work.pending.length > 0
        ? "pending"
        : work.history.length > 0 || (work.notChosen?.length ?? 0) > 0
          ? "history"
          : "active",
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
  const notChosen = (work.notChosen ?? [])
    .filter((it) => !hidden.has(it.workKey))
    .sort((a, b) => new Date(b.shift.startsAt).getTime() - new Date(a.shift.startsAt).getTime());

  // "Alles verbergen": every klus you were not chosen for at once, instead of one by one
  function hideAll() {
    const keys = notChosen.map((it) => it.workKey);
    setHidden((prev) => new Set([...prev, ...keys]));
    void dismissWorkItemsAction(keys);
  }

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

  // niets te tonen op dit tabblad (Gearchiveerd met alleen niet-uitgekozen klussen toont die lijst, geen lege zin)
  const toonLeeg = shown.length === 0 && !(tab === "history" && notChosen.length > 0);

  return (
    <div>
      {/* Tabs: drie even brede knoppen, turquoise streep onder de actieve (de tabbalk van YoungOnes) */}
      <div role="tablist" className="mb-4 grid grid-cols-3 border-b border-hair">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(t.id);
                setDays(new Set());
              }}
              className={`-mb-px min-h-[44px] border-b-2 px-1 pb-2.5 pt-1 text-center text-sm transition ${
                active ? "border-[#14D9C9] font-bold text-ink" : "border-transparent font-medium text-neutralx-400 hover:text-neutralx-600"
              }`}
            >
              {w[t.key]}
            </button>
          );
        })}
      </div>

      {/* Filter row — alleen als er iets te filteren valt; een lege lijst krijgt een knop naar het zoeken */}
      {items.length > 0 && (
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
      )}

      {items.length > 0 && panel && (
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
                {dayOptions.map(([k, d]) => {
                  const p = amsterdamParts(d);
                  return (
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
                      {ft.date.wd[p.weekday]} {p.day}/{p.month}
                    </button>
                  );
                })}
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
        toonLeeg ? <Empty tab={tab} w={w} zoek={items.length === 0} /> : null
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
              {...(tab === "active" && item.shift.busy ? { ribbon: { label: w.doubleBooked, tone: "crit" as const } } : {})}
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

      {/* niet uitgekozen: onder Gearchiveerd, apart van de echte historie (afgerond/geannuleerd) */}
      {tab === "history" && notChosen.length > 0 && (
        <section className={shown.length > 0 ? "mt-8" : ""} aria-labelledby="niet-gekozen-kop">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="niet-gekozen-kop" className="font-display text-base font-bold text-ink">
                {w.notChosenTitle(notChosen.length)}
              </h2>
              <p className="mt-0.5 text-xs text-neutralx-500">{w.notChosenBody}</p>
            </div>
            <button type="button" onClick={hideAll} className="btn-ghost flex-shrink-0 text-sm">
              {w.hideAll}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {notChosen.map((item) => (
              <ShiftCard
                key={item.workKey}
                shift={item.shift}
                t={ft}
                href={`/dashboard/klussen/${item.shift.id}`}
                dim
                footerOverride={<HistoryFooter item={item} onHide={hideItem} w={w} />}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** De regel onder een uitgekozen klus: "Dit is jouw klus! 🎉" met een pijl, zoals bij YoungOnes; ervoor eventueel
 *  "De opdrachtgever heeft aanvullende informatie voor je achtergelaten" (de tekst zelf staat op de kluspagina). */
function ActiveFooter({ item, w }: { item: MyWorkItem; w: W }) {
  return (
    <div className="space-y-2">
      {item.shift.extraInfo && <p className="text-xs text-neutralx-500">{w.extraInfoLeft}</p>}
      <ActiveAction item={item} w={w} />
    </div>
  );
}

function ActiveAction({ item, w }: { item: MyWorkItem; w: W }) {
  const startMs = new Date(item.shift.startsAt).getTime();
  const endMs = new Date(item.shift.endsAt).getTime();

  // Vervanging gevraagd → naar de vervangingspagina.
  if (item.replacementRequested && item.replacementRequestId) {
    return (
      <Link
        href={`/dashboard/diensten/vervanging/${item.replacementRequestId}`}
        className="flex items-center justify-between text-sm font-semibold text-warn"
      >
        <span>
          {w.replacementAsked}
          {item.replacementResponseCount > 0 ? ` · ${w.responses(item.replacementResponseCount)}` : ""}
        </span>
        <span aria-hidden>→</span>
      </Link>
    );
  }

  // Op de dag van de klus: inchecken/uitchecken heeft voorrang (eigen pagina; uren pas na afloop).
  if (item.timesheetId && Date.now() >= startMs - 60 * 60_000 && Date.now() <= endMs) {
    return (
      <Link href={`/dashboard/inchecken/${item.timesheetId}`} className="btn-primary flex w-full items-center justify-between">
        <span>{w.checkInOut}</span>
        <span aria-hidden>→</span>
      </Link>
    );
  }

  // Geaccepteerde reactie zonder toewijzing (bedrijf nog niet geverifieerd):
  // eerlijke status, de kaart opent gewoon de klus.
  if (!item.assignmentId) {
    return (
      <Link href={`/dashboard/klussen/${item.shift.id}`} className="flex items-center justify-between text-sm font-semibold text-neutralx-600">
        <span>{w.acceptedView}</span>
        <span aria-hidden>→</span>
      </Link>
    );
  }

  // Toewijzing: de kaart opent de klus. De acties (bevestigen, agenda,
  // vervanging, afzeggen, annuleringstermijn, extra info) staan op de
  // detailpagina — je ziet ze dus zodra je de klus aanklikt.
  return (
    <Link href={`/dashboard/klussen/${item.shift.id}`} className="flex items-center justify-between font-display text-base font-bold text-ink">
      <span>{w.yourJob}</span>
      <span aria-hidden>→</span>
    </Link>
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
    // niet uitgekozen of verlopen: meteen een alternatief aanbieden, en de kaart kunnen wegklikken
    return (
      <div className="space-y-2">
        <div>
          <p className="text-sm font-semibold text-neutralx-500">{item.rejectedKind === "counter" ? w.counterDeclined : w.notChosen}</p>
          {item.rejectedKind === "expired" && <p className="mt-0.5 text-xs text-neutralx-500">{w.notChosenExpired}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/dashboard/klussen" className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
            {w.findOther} <span aria-hidden>→</span>
          </Link>
          <button
            type="button"
            onClick={() => onHide(item.workKey)}
            className="flex-shrink-0 text-xs font-medium text-neutralx-500 underline-offset-2 hover:text-neutralx-700 hover:underline"
          >
            {w.hide}
          </button>
        </div>
      </div>
    );
  }
  // Archief-item uit een reactie (geaccepteerde reactie die voorbij is, of een
  // bedrijf dat niet inplande) — er is geen urenbriefje om in te vullen.
  if (!item.assignmentId) {
    return <p className="text-sm font-semibold text-neutralx-500">{w.over}</p>;
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

// De lege staat van YoungOnes: één gewone zin, gecentreerd, veel lucht. zoek: de lijst van dit tabblad is echt leeg
// (niet weggefilterd op dag) → ook een knop naar het zoeken van klussen.
function Empty({ tab, w, zoek }: { tab: TabId; w: W; zoek: boolean }) {
  const text = tab === "pending" ? w.emptyPending : tab === "active" ? w.emptyActive : w.emptyHistory;
  return (
    <div className="px-6 py-16 text-center">
      <p className="mx-auto max-w-sm text-base leading-relaxed text-neutralx-500">{text}</p>
      {zoek && (
        <Link href="/dashboard/klussen" className="btn-primary mt-6">
          {w.emptyCta}
        </Link>
      )}
    </div>
  );
}
