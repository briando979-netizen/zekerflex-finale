import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { getEmployerShift } from "@/lib/dashboard/employer-shift";
import { PageHeader, Panel, EmptyState, StatusPill, money, moneyExact, dateTime } from "@/components/app/ui";
import { shiftCategory } from "@/lib/shifts/category";
import { OfferResponseButtons } from "@/components/app/OfferResponseButtons";
import { ChatUserButton } from "@/components/app/ChatUserButton";
import { ReviewButton } from "@/components/app/ReviewButton";
import { EmployerShiftControls } from "@/components/app/EmployerShiftControls";
import { ClaimReviewPanel } from "@/components/app/ClaimReviewPanel";

export const dynamic = "force-dynamic";

const QUEUE_LABEL: Record<string, string> = {
  SCORED: "In wachtrij",
  NOTIFIED: "Uitgenodigd",
  VIEWED: "Bekeken",
  DECLINED: "Afgewezen",
  EXPIRED: "Verlopen",
};

export default async function EmployerShiftPage({ params }: { params: { shiftId: string } }) {
  const principal = await requirePrincipal();
  const s = await getEmployerShift(principal, params.shiftId);
  if (!s) notFound();

  const cat = shiftCategory(s.title, s.skill);
  const seatsFree = s.positions - s.assigned.length;
  const pendingOffers = s.offers.filter((o) => o.status === "pending");
  const shiftEnded = new Date(s.endsAt).getTime() < Date.now();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/werkgever/diensten" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← Alle diensten
        </Link>
        <Link href="/werkgever/diensten/nieuw" className="btn-ghost text-sm">
          Nog een dienst
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
            {seatsFree === 0 ? "Volledig bezet" : `${seatsFree} van ${s.positions} open`}
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
        title="Beheer deze dienst"
        subtitle="Kandidaten, wachtrij, tegenbiedingen en kosten."
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
        <Kpi label="Uurtarief" value={`${moneyExact(s.hourlyRateCents)}`} sub="/uur bruto" />
        <Kpi label="Per plek" value={money(s.grossPerSeatCents)} sub={`${s.hours} u`} />
        <Kpi label="Platformkosten" value={money(s.platformFeeCents)} sub={`€ 3,50 per gewerkt uur · ${s.hours} u`} />
        <Kpi label="Bezetting" value={`${s.assigned.length}/${s.positions}`} sub={pendingOffers.length ? `${pendingOffers.length} tegenbod` : "matchen loopt"} />
      </div>

      {pendingOffers.length > 0 && (
        <div className="mt-6">
          <Panel title={`Tegenbiedingen (${pendingOffers.length})`} subtitle="Een kracht stelt een ander uurtarief voor.">
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
                    <ChatUserButton toUserId={o.userId} contextKey={`shift:${s.id}`} subject={s.title} label="Bericht" />
                    <OfferResponseButtons offerId={o.id} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title={`Aangenomen (${s.assigned.length}/${s.positions})`}>
          {s.assigned.length === 0 ? (
            <EmptyState title="Nog niemand aangenomen" body="ZekerFlex nodigt automatisch de beste kandidaten uit." />
          ) : (
            <ul className="divide-y divide-hair">
              {s.assigned.map((a) => (
                <li key={a.assignmentId} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{a.name}</p>
                    <p className="text-xs text-neutralx-500">
                      Betrouwbaarheid {Math.round(a.reliability * 100)} · {a.badge} · aangenomen {dateTime(a.acceptedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.replacementRequested && <StatusPill tone="crit">Vervanging</StatusPill>}
                    {a.timesheetStatus && (
                      <StatusPill tone={a.timesheetStatus === "PAID" ? "ok" : "neutral"}>{a.timesheetStatus}</StatusPill>
                    )}
                    <ChatUserButton toUserId={a.userId} contextKey={`shift:${s.id}`} subject={s.title} label="Bericht" />
                    {shiftEnded && (
                      <ReviewButton subjectType="freelancer" subjectId={a.userId} subjectName={a.name} shiftId={s.id} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Wachtrij (${s.queue.length})`} subtitle="Gematchte kandidaten die nog niet hebben aangenomen.">
          {s.queue.length === 0 ? (
            <EmptyState title="Geen wachtrij" body="Zodra de matching draait verschijnen kandidaten hier." />
          ) : (
            <ul className="divide-y divide-hair">
              {s.queue.slice(0, 10).map((q) => (
                <li key={q.freelancerId} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{q.name}</p>
                    <p className="text-xs text-neutralx-500">
                      {Math.round(q.score * 100)}% match · {q.travelMinutes} min reistijd
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={q.status === "DECLINED" ? "crit" : q.status === "NOTIFIED" ? "warn" : "neutral"}>
                      {QUEUE_LABEL[q.status] ?? q.status}
                    </StatusPill>
                    <ChatUserButton toUserId={q.userId} contextKey={`shift:${s.id}`} subject={s.title} label="Bericht" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {s.description && (
        <div className="mt-6">
          <Panel title="Omschrijving">
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
