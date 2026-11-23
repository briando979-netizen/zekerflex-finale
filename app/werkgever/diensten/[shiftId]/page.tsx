import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { getEmployerShift, type EmployerShiftView } from "@/lib/dashboard/employer-shift";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { PageHeader, Panel, EmptyState, StatusPill, money, moneyExact, dateTime } from "@/components/app/ui";
import { shiftCategory } from "@/lib/shifts/category";
import { ChatUserButton } from "@/components/app/ChatUserButton";
import { ReviewButton } from "@/components/app/ReviewButton";
import { EmployerShiftControls } from "@/components/app/EmployerShiftControls";
import { ClaimReviewPanel } from "@/components/app/ClaimReviewPanel";
import { FreelancerRelationButton } from "@/components/app/FreelancerRelationButton";
import { CandidateCardButton } from "@/components/app/CandidateCardButton";
import { PublishPoolShiftButton } from "@/components/app/PublishPoolShiftButton";
import { KlusWeerOpenKnop } from "@/components/app/KlusWeerOpenKnop";
import { RepeatTeamButton } from "@/components/app/RepeatTeamButton";
import { SpoedoproepPaneel } from "@/components/app/SpoedoproepPaneel";
import { ReservebankKnop, ReserveInplannenKnop } from "@/components/app/ReservebankKnoppen";
import { reservebankVoorPagina } from "@/lib/reservebank/store";
import { getDict, getLocale } from "@/lib/i18n/server";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { isTenantVerified } from "@/lib/company/verified";
import { freelancerRatings } from "@/lib/reviews/ratings";
import { explainMatch } from "@/lib/matching/explain";
import { annuleerTermijnLabel } from "@/lib/shifts/annuleertermijn";
import { ReactieLijst } from "@/components/werkgever/ReactieLijst";
import { LinkKopieren } from "@/components/werkgever/LinkKopieren";

export const dynamic = "force-dynamic";

export default async function EmployerShiftPage(props: { params: Promise<{ shiftId: string }> }) {
  const params = await props.params;
  const dict = await getDict();
  const locale = await getLocale();
  const d = dict.shiftDetail;
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
  const verified = scope.tenantIds[0] ? await isTenantVerified(scope.tenantIds[0]) : true;
  if (!verified) QUEUE_LABEL.VIEWED = d.queueResponded;
  const ratings = await freelancerRatings([...s.assigned.map((a) => a.userId), ...s.queue.slice(0, 10).map((q) => q.userId)]);
  const stars = (userId: string) => {
    const r = ratings.get(userId);
    return r ? (
      <span className="ml-1.5 rounded-full bg-money-soft px-1.5 py-0.5 text-[11px] font-bold text-money-ink">
        ★ {r.average.toFixed(1).replace(".", ",")} ({r.count})
      </span>
    ) : null;
  };
  const favSet = new Set(rel.favorites.map((f) => f.userId));
  const blockSet = new Set(rel.blocked.map((b) => b.userId));

  const cat = shiftCategory(s.title, s.skill);
  const seatsFree = s.positions - s.assigned.length;
  const pendingOffers = s.offers.filter((o) => o.status === "pending");
  const shiftEnded = new Date(s.endsAt).getTime() < Date.now();

  // Reservebank (lib/reservebank): open reacties die het bedrijf achter de hand houdt. Alleen vóór de start;
  // daarna staan ze gewoon weer bij de reacties. Zegde iemand af, dan staan de reserves bovenaan om te kiezen.
  const bank = await reservebankVoorPagina(
    principal.grants,
    { id: s.id, tenantId: s.tenantId, branchId: s.branchId, startsAt: s.startsAt, status: s.status },
    s.offers.map((o) => ({ id: o.id, shiftId: s.id, status: o.status })),
  );
  const reserveSet = new Set(bank.reserveIds);
  const reserves = bank.reserveIds.flatMap((id) => pendingOffers.filter((o) => o.id === id));
  const openReacties = pendingOffers.filter((o) => !reserveSet.has(o.id));
  const bankBewerkbaar = bank.toegang === "schrijven" && bank.open;
  const kanInplannen = bankBewerkbaar && verified && seatsFree > 0;
  const afzegBlok = bank.afzegging && kanInplannen && reserves.length > 0;
  const zoektVervanger = s.assigned.find((a) => a.replacementRequested);

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
          <div className="flex flex-wrap items-center gap-2">
            <LinkKopieren shiftId={s.id} />
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
          </div>
        }
      />

      {afzegBlok && (
        <section aria-labelledby="afzeg-reservebank" className="mb-6 rounded-2xl border border-warn/40 bg-warn/10 p-4">
          <div role="status">
            <h2 id="afzeg-reservebank" className="font-semibold text-ink">
              {d.afzegTitel}
            </h2>
            <p className="mt-1 text-sm text-neutralx-700">{d.afzegTekst}</p>
          </div>
          <ul className="surface mt-3 divide-y divide-hair overflow-hidden">
            {reserves.map((o) => (
              <ReserveRij key={o.id} o={o} shiftId={s.id} shiftTitle={s.title} dict={dict} bewerkbaar={bankBewerkbaar} kanInplannen={kanInplannen} vol={seatsFree === 0} />
            ))}
          </ul>
        </section>
      )}

      {/* een volle klus waar iemand van afzegde en "Klussen automatisch heropenen" staat uit (Instellingen → Klus-instellingen): zelf weer openzetten */}
      {s.status === "FILLED" && seatsFree > 0 && verified && !shiftEnded && (
        <div className="mb-6">
          <KlusWeerOpenKnop shiftId={s.id} />
        </div>
      )}

      {!verified && (
        <div className="mb-6 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm text-neutralx-700">
          <p className="font-semibold text-ink">{d.controleTitel}</p>
          <p className="mt-1">{fmt(d.controleTekst, { label: d.queueResponded })}</p>
        </div>
      )}

      {s.invitedPool && (
        <div className="mb-6">
          <PublishPoolShiftButton shiftId={s.id} poolName={s.invitedPool.name} />
        </div>
      )}

      {s.status !== "CANCELLED" && verified && (
        <div className="mb-6">
          <RepeatTeamButton shiftId={s.id} teamSize={s.assigned.length} />
        </div>
      )}

      {seatsFree > 0 && verified && !shiftEnded && s.status !== "CANCELLED" && s.status !== "DRAFT" && (
        <div className="mb-6">
          <SpoedoproepPaneel shiftId={s.id} seatsFree={seatsFree} />
        </div>
      )}

      <ClaimReviewPanel shiftId={s.id} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label={d.kpiRate} value={`${moneyExact(s.hourlyRateCents)}`} sub={d.kpiRateSub} />
        <Kpi label={d.kpiPerSeat} value={money(s.grossPerSeatCents)} sub={`${s.hours} u`} />
        <Kpi label={d.kpiFee} value={money(s.platformFeeCents)} sub={fmt(s.platformFeeFree ? d.kpiFeeFreeSub : d.kpiFeeSub, { h: s.hours })} />
        <Kpi
          label={d.kpiOccupancy}
          value={`${s.assigned.length}/${s.positions}`}
          sub={pendingOffers.length ? fmt(d.kpiOffers, { n: pendingOffers.length }) : d.kpiMatching}
        />
      </div>
      <p className="mt-2 text-xs text-neutralx-500">
        {fmt(d.annuleerTermijn, { label: annuleerTermijnLabel(s.annuleerUren, locale === "en" ? "en" : "nl") })}
        {s.autoAcceptFavorieten && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{d.autoAcceptAan}</span>}
        {s.kostenplaats && <span className="ml-2 rounded-full bg-paper-soft px-2 py-0.5 text-[11px] font-semibold text-neutralx-700">{fmt(d.kostenplaats, { naam: s.kostenplaats })}</span>}
      </p>

      {openReacties.length > 0 && (
        <div className="mt-6">
          <Panel title={fmt(d.offersTitle, { n: openReacties.length })} subtitle={seatsFree === 0 && bankBewerkbaar ? d.reserveTip : d.offersSubtitle}>
            {/* rijen met filters (favoriet, opkomst, klussen, beoordeling, tarief) en bij de laatste plek de reserve-stap
                vóór het accepteren: components/werkgever/ReactieLijst.tsx */}
            <ReactieLijst
              shiftId={s.id}
              shiftTitle={s.title}
              bankBewerkbaar={bankBewerkbaar}
              laatstePlek={seatsFree === 1 && openReacties.length > 1}
              reacties={openReacties.map((o) => ({
                id: o.id,
                userId: o.userId,
                naam: o.freelancerName,
                avatarUrl: o.avatarUrl,
                proposedRateCents: o.proposedRateCents,
                listedRateCents: o.listedRateCents,
                note: o.note,
                busyElsewhere: o.busyElsewhere,
                attendancePct: o.attendancePct,
                shiftsCompleted: o.shiftsCompleted,
                cancellations: o.cancellations,
                reviewAverage: o.reviewAverage,
                reviewCount: o.reviewCount,
                favoriet: favSet.has(o.userId),
                regel: reactieRegel(dict.kandidaatKaart, o),
              }))}
            />
          </Panel>
        </div>
      )}

      {!afzegBlok && reserves.length > 0 && (
        <div className="mt-6">
          <Panel title={fmt(d.reserveTitle, { n: reserves.length })} subtitle={d.reserveSubtitle}>
            {zoektVervanger && (
              <p className="border-b border-hair px-5 py-3 text-xs text-neutralx-600">{fmt(d.reserveVervanging, { naam: zoektVervanger.name })}</p>
            )}
            <ul className="divide-y divide-hair">
              {reserves.map((o) => (
                <ReserveRij key={o.id} o={o} shiftId={s.id} shiftTitle={s.title} dict={dict} bewerkbaar={bankBewerkbaar} kanInplannen={kanInplannen} vol={seatsFree === 0} />
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <div className="mt-6 space-y-6">
        <Panel title={fmt(d.assignedTitle, { n: s.assigned.length, total: s.positions })}>
          {s.assigned.length === 0 ? (
            <EmptyState title={d.assignedEmptyTitle} body={d.assignedEmptyBody} />
          ) : (
            <ul className="divide-y divide-hair">
              {s.assigned.map((a) => (
                <li key={a.assignmentId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <CandidateCardButton userId={a.userId} shiftId={s.id} name={a.name}>
                      <Persoon url={a.avatarUrl} name={a.name} extra={stars(a.userId)}>
                        {fmt(d.reliability, { n: Math.round(a.reliability * 100) })} · {a.badge} · {fmt(d.acceptedOn, { date: dateTime(a.acceptedAt) })}
                      </Persoon>
                    </CandidateCardButton>
                  </div>
                  <Acties>
                    {a.replacementRequested && <StatusPill tone="crit">{d.replacementPill}</StatusPill>}
                    {a.timesheetStatus && <StatusPill tone={a.timesheetStatus === "PAID" ? "ok" : "neutral"}>{a.timesheetStatus}</StatusPill>}
                    <CandidateCardButton userId={a.userId} shiftId={s.id} name={a.name} />
                    <ChatUserButton toUserId={a.userId} contextKey={`shift:${s.id}`} subject={s.title} label={d.message} />
                    <FreelancerRelationButton userId={a.userId} name={a.name} kind="favorite" active={favSet.has(a.userId)} />
                    {shiftEnded && (
                      <ReviewButton subjectType="freelancer" subjectId={a.userId} subjectName={a.name} shiftId={s.id} label={d.reviewWorker} />
                    )}
                  </Acties>
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
              {s.queue.slice(0, 10).map((q) => {
                const ex = explainMatch(q);
                const matchLine = fmt(d.matchLine, { pct: Math.round(q.score * 100), min: q.travelMinutes });
                const rating = ratings.get(q.userId);
                // not reacted (yet): no full card (api/werkgever/kandidaat), but the photo and what this page already shows
                const preview = q.reacted
                  ? undefined
                  : {
                      avatarUrl: q.avatarUrl,
                      lines: [
                        matchLine,
                        ...(rating ? [`★ ${rating.average.toFixed(1).replace(".", ",")} uit ${rating.count} beoordelingen`] : []),
                        `Status: ${QUEUE_LABEL[q.status] ?? q.status}`,
                      ],
                    };
                return (
                  <li key={q.freelancerId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <CandidateCardButton userId={q.userId} shiftId={s.id} name={q.name} {...(preview ? { preview } : {})}>
                        <Persoon url={q.avatarUrl} name={q.name} extra={stars(q.userId)}>
                          {matchLine}
                        </Persoon>
                      </CandidateCardButton>
                      <details className="mt-1 pl-[3.25rem] text-xs">
                        <summary className="cursor-pointer text-brand-600 hover:underline">Waarom deze match? ({ex.verdict})</summary>
                        <ul className="mt-1 space-y-0.5">
                          {ex.reasons.map((r, i) => (
                            <li key={i} className="text-neutralx-600">
                              <span className={r.strength === "goed" ? "text-brand-600" : r.strength === "zwak" ? "text-crit" : "text-neutralx-400"} aria-hidden>
                                ●
                              </span>{" "}
                              <span className="font-medium text-ink">{r.label}:</span> {r.detail}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                    <Acties>
                      <StatusPill tone={q.status === "DECLINED" ? "crit" : q.status === "NOTIFIED" ? "warn" : "neutral"}>{QUEUE_LABEL[q.status] ?? q.status}</StatusPill>
                      <CandidateCardButton userId={q.userId} shiftId={s.id} name={q.name} {...(preview ? { preview } : {})} />
                      <ChatUserButton toUserId={q.userId} contextKey={`shift:${s.id}`} subject={s.title} label={d.message} />
                      <FreelancerRelationButton userId={q.userId} name={q.name} kind="favorite" active={favSet.has(q.userId)} />
                      <FreelancerRelationButton userId={q.userId} name={q.name} kind="block" active={blockSet.has(q.userId)} />
                    </Acties>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {(s.description || s.dresscode) && (
        <div className="mt-6">
          <Panel title="Over de klus">
            <div className="space-y-4 px-5 py-4 text-sm">
              {s.description && <p className="whitespace-pre-line leading-relaxed text-ink-soft">{s.description}</p>}
              {s.dresscode && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">👕 Kledingvoorschriften</h3>
                  <p className="mt-1 whitespace-pre-line text-ink-soft">{s.dresscode}</p>
                </div>
              )}
              {["DRAFT", "OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(s.status) && (
                <Link href={`/werkgever/diensten/${s.id}/bewerken`} className="inline-block text-sm font-semibold text-brand-600 hover:underline">
                  Klus bewerken →
                </Link>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
      {initials(name)}
    </span>
  );
}

/** The line above Afwijzen / Accepteren in the profile card of a reaction. */
function reactieRegel(k: Dict["kandidaatKaart"], o: { proposedRateCents: number; listedRateCents: number; busyElsewhere: boolean }): string {
  const bod =
    o.proposedRateCents === o.listedRateCents
      ? fmt(k.reactieMet, { prijs: moneyExact(o.listedRateCents) })
      : fmt(k.tegenbod, { bod: moneyExact(o.proposedRateCents), lijst: moneyExact(o.listedRateCents) });
  return o.busyElsewhere ? `${bod}${k.elders}` : bod;
}

/** One reserve: who, the rate, and (before the start, seat free) "Inplannen" in one click. */
function ReserveRij({
  o,
  shiftId,
  shiftTitle,
  dict,
  bewerkbaar,
  kanInplannen,
  vol,
}: {
  o: EmployerShiftView["offers"][number];
  shiftId: string;
  shiftTitle: string;
  dict: Dict;
  bewerkbaar: boolean;
  kanInplannen: boolean;
  vol: boolean;
}) {
  const d = dict.shiftDetail;
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <CandidateCardButton userId={o.userId} shiftId={shiftId} name={o.freelancerName} beslissing={{ offerId: o.id, regel: reactieRegel(dict.kandidaatKaart, o) }}>
          <Persoon url={o.avatarUrl} name={o.freelancerName}>
            <span className="num font-semibold text-brand-600">{moneyExact(o.proposedRateCents)}/u</span>
            {o.reliability !== null && <span> · {fmt(d.reliability, { n: Math.round(o.reliability * 100) })}</span>}
            {o.reviewCount > 0 && <span> · ★ {o.reviewAverage.toFixed(1).replace(".", ",")} ({o.reviewCount})</span>}
          </Persoon>
        </CandidateCardButton>
        {o.busyElsewhere && (
          <p className="mt-1.5 pl-[3.25rem] text-xs text-neutralx-500">
            <span className="font-semibold text-warn">⏰ {d.busyElsewhere}.</span> {d.busyElsewhereHint}
          </p>
        )}
      </div>
      <Acties>
        <ChatUserButton toUserId={o.userId} contextKey={`shift:${shiftId}`} subject={shiftTitle} label={d.message} />
        {bewerkbaar && <ReservebankKnop offerId={o.id} naam={o.freelancerName} op />}
        {kanInplannen ? <ReserveInplannenKnop offerId={o.id} naam={o.freelancerName} /> : vol ? <StatusPill tone="neutral">{d.reserveWacht}</StatusPill> : null}
      </Acties>
    </li>
  );
}

/** Photo + name + one line: the clickable part of a row (opens the profile card). */
function Persoon({ url, name, extra, children }: { url: string | null; name: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <>
      <Avatar url={url} name={name} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center text-sm font-semibold text-ink group-hover:underline">
          {name}
          {extra}
        </span>
        <span className="block text-xs text-neutralx-500">{children}</span>
      </span>
    </>
  );
}

/** The buttons of a row: under the person on a phone, on the right from sm. */
function Acties({ children }: { children: ReactNode }) {
  return <div className="flex flex-shrink-0 flex-wrap items-center gap-2 pl-[3.25rem] sm:justify-end sm:pl-0">{children}</div>;
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
