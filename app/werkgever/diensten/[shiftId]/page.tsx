import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { getEmployerShift } from "@/lib/dashboard/employer-shift";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { PageHeader, Panel, EmptyState, StatusPill, money, moneyExact, dateTime } from "@/components/app/ui";
import { shiftCategory } from "@/lib/shifts/category";
import { OfferResponseButtons } from "@/components/app/OfferResponseButtons";
import { ChatUserButton } from "@/components/app/ChatUserButton";
import { ReviewButton } from "@/components/app/ReviewButton";
import { EmployerShiftControls } from "@/components/app/EmployerShiftControls";
import { ClaimReviewPanel } from "@/components/app/ClaimReviewPanel";
import { FreelancerRelationButton } from "@/components/app/FreelancerRelationButton";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function EmployerShiftPage(props: { params: Promise<{ shiftId: string }> }) {
  const params = await props.params;
  const d = (await getDict()).shiftDetail;
  const QUEUE_LABEL: Record<string, string> = {
    SCORED: d.queueScored,
    NOTIFIED: d.queueNotified,
    VIEWED: d.queueViewed,
    DECLINED: d.queueDeclined,
    EXPIRED: d.queueExpired,
  };
  const principal = await requirePrincipal();
  const s = await getEmployerShift(principal, params.shiftId);
  if (!s) notFound();

  const scope = await resolveEmployerScope(principal);
  const rel = scope.tenantIds[0]
    ? await getEmployerRelations(scope.tenantIds[0])
    : { favorites: [], blocked: [] };
  const favSet = new Set(rel.favorites.map((f) => f.userId));
  const blockSet = new Set(rel.blocked.map((b) => b.userId));

  const cat = shiftCategory(s.title, s.skill);
  const seatsFree = s.positions - s.assigned.length;
  const pendingOffers = s.offers.filter((o) => o.status === "pending");
  const shiftEnded = new Date(s.endsAt).getTime() < Date.now();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/werkgever/diensten" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← {d.backAll}
        </Link>
        <Link href="/werkgever/diensten/nieuw" className="btn-ghost text-sm">
          {d.another}
        </Link>
      </div>

      <div className="relative mb-6 overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cat.photo} alt="" className="aspect-[21/9] w-full object-cover" />
        <span className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: `${cat.accent}dd` }}>
          {cat.label}
        </span>
        <span className="absolute right-4 top-4">
          <StatusPill tone={seatsFree === 0 ? "ok" : "warn"}>
            {seatsFree === 0 ? d.fullyStaffed : fmt(d.seatsOpen, { n: seatsFree, total: s.positions })}
          </StatusPill>
        </span>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <h1 className="font-display text-2xl font-bold drop-shadow md:text-3xl">{s.title}</h1>
          <p className="mt-1 text-sm text-white/85">
            {s.branch} · {s.city} · {dateTime(s.startsAt)} – {dateTime(s.endsAt)}
          </p>
        </div>
      </div>

      <PageHeader
        title={d.manageTitle}
        subtitle={d.manageSubtitle}
        action={
          <EmployerShiftControls
            shift={{
              id: s.id,
              title: s.title,
              description: s.description,
              startsAt: s.startsAt.toISOString(),
              endsAt: s.endsAt.toISOString(),
              breakMinutes: s.breakMinutes,
              hourlyRateCents: s.hourlyRateCents,
              positions: s.positions,
              status: s.status,
              assignedCount: s.assigned.length,
            }}
          />
        }
      />

      <ClaimReviewPanel shiftId={s.id} />

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label={d.kpiRate} value={`${moneyExact(s.hourlyRateCents)}`} sub={d.kpiRateSub} />
        <Kpi label={d.kpiPerSeat} value={money(s.grossPerSeatCents)} sub={`${s.hours} u`} />
        <Kpi label={d.kpiFee} value={money(s.platformFeeCents)} sub={fmt(d.kpiFeeSub, { h: s.hours })} />
        <Kpi
          label={d.kpiOccupancy}
          value={`${s.assigned.length}/${s.positions}`}
          sub={pendingOffers.length ? fmt(d.kpiOffers, { n: pendingOffers.length }) : d.kpiMatching}
        />
      </div>

      {pendingOffers.length > 0 && (
        <div className="mt-6">
          <Panel title={fmt(d.offersTitle, { n: pendingOffers.length })} subtitle={d.offersSubtitle}>
            <ul className="divide-y divide-hair">
              {pendingOffers.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {o.freelancerName} · <span className="num text-brand-600">{moneyExact(o.proposedRateCents)}/u</span>
                      <span className="ml-2 text-xs font-normal text-neutralx-400 line-through">{moneyExact(o.listedRateCents)}/u</span>
                    </p>
                    {o.note && <p className="mt-0.5 text-xs text-neutralx-500">{o.note}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <ChatUserButton toUserId={o.userId} contextKey={`shift:${s.id}`} subject={s.title} label={d.message} />
                    <OfferResponseButtons offerId={o.id} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title={fmt(d.assignedTitle, { n: s.assigned.length, total: s.positions })}>
          {s.assigned.length === 0 ? (
            <EmptyState title={d.assignedEmptyTitle} body={d.assignedEmptyBody} />
          ) : (
            <ul className="divide-y divide-hair">
              {s.assigned.map((a) => (
                <li key={a.assignmentId} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{a.name}</p>
                    <p className="text-xs text-neutralx-500">
                      {fmt(d.reliability, { n: Math.round(a.reliability * 100) })} · {a.badge} · {fmt(d.acceptedOn, { date: dateTime(a.acceptedAt) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.replacementRequested && <StatusPill tone="crit">{d.replacementPill}</StatusPill>}
                    {a.timesheetStatus && (
                      <StatusPill tone={a.timesheetStatus === "PAID" ? "ok" : "neutral"}>{a.timesheetStatus}</StatusPill>
                    )}
                    <ChatUserButton toUserId={a.userId} contextKey={`shift:${s.id}`} subject={s.title} label={d.message} />
                    <FreelancerRelationButton userId={a.userId} name={a.name} kind="favorite" active={favSet.has(a.userId)} />
                    {shiftEnded && (
                      <ReviewButton subjectType="freelancer" subjectId={a.userId} subjectName={a.name} shiftId={s.id} label={d.reviewWorker} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={fmt(d.queueTitle, { n: s.queue.length })} subtitle={d.queueSubtitle}>
          {s.queue.length === 0 ? (
            <EmptyState title={d.queueEmptyTitle} body={d.queueEmptyBody} />
          ) : (
            <ul className="divide-y divide-hair">
              {s.queue.slice(0, 10).map((q) => (
                <li key={q.freelancerId} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{q.name}</p>
                    <p className="text-xs text-neutralx-500">
                      {fmt(d.matchLine, { pct: Math.round(q.score * 100), min: q.travelMinutes })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={q.status === "DECLINED" ? "crit" : q.status === "NOTIFIED" ? "warn" : "neutral"}>
                      {QUEUE_LABEL[q.status] ?? q.status}
                    </StatusPill>
                    <ChatUserButton toUserId={q.userId} contextKey={`shift:${s.id}`} subject={s.title} label={d.message} />
                    <FreelancerRelationButton userId={q.userId} name={q.name} kind="favorite" active={favSet.has(q.userId)} />
                    <FreelancerRelationButton userId={q.userId} name={q.name} kind="block" active={blockSet.has(q.userId)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {s.description && (
        <div className="mt-6">
          <Panel title={d.descriptionPanel}>
            <p className="px-5 py-4 text-sm leading-relaxed text-ink-soft">{s.description}</p>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="surface p-4">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-neutralx-500">{label}</p>
      <p className="num mt-1 font-display text-xl font-bold text-ink">{value}</p>
      <p className="text-xs text-neutralx-400">{sub}</p>
    </div>
  );
}
