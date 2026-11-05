import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { getEmployerShift } from "@/lib/dashboard/employer-shift";
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
import { RepeatTeamButton } from "@/components/app/RepeatTeamButton";
import { SpoedoproepPaneel } from "@/components/app/SpoedoproepPaneel";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";
import { isTenantVerified } from "@/lib/company/verified";
import { freelancerRatings } from "@/lib/reviews/ratings";
import { explainMatch } from "@/lib/matching/explain";

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
  const verified = scope.tenantIds[0] ? await isTenantVerified(scope.tenantIds[0]) : true;
  if (!verified) QUEUE_LABEL.VIEWED = "Heeft gereageerd";
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

      {!verified && (
        <div className="mb-6 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm text-neutralx-700">
          <p className="font-semibold text-ink">Dit is een testklus</p>
          <p className="mt-1">
            Freelancers kunnen reageren — je ziet ze hieronder bij &ldquo;Heeft gereageerd&rdquo; en kunt ze al een bericht sturen.
            Inplannen kan pas zodra je KVK is goedgekeurd; wie gereageerd heeft krijgt dan automatisch een melding om te bevestigen.
          </p>
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

      {pendingOffers.length > 0 && (
        <div className="mt-6">
          <Panel title={fmt(d.offersTitle, { n: pendingOffers.length })} subtitle={d.offersSubtitle}>
            <ul className="divide-y divide-hair">
              {pendingOffers.map((o) => (
                <li key={o.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <CandidateCardButton userId={o.userId} shiftId={s.id} name={o.freelancerName} beslissing={{ offerId: o.id, regel: reactieRegel(o) }}>
                      <Persoon url={o.avatarUrl} name={o.freelancerName}>
                        <span className="num font-semibold text-brand-600">{moneyExact(o.proposedRateCents)}/u</span>
                        {o.proposedRateCents !== o.listedRateCents && (
                          <span className="ml-1.5 text-neutralx-400 line-through">{moneyExact(o.listedRateCents)}/u</span>
                        )}
                        {o.reliability !== null && <span> · ✓ {Math.round(o.reliability * 100)}% opkomst</span>}
                        {o.reviewCount > 0 ? (
                          <span> · ★ {o.reviewAverage.toFixed(1).replace(".", ",")} ({o.reviewCount})</span>
                        ) : (
                          <span> · nog geen beoordelingen</span>
                        )}
                      </Persoon>
                    </CandidateCardButton>
                    {(o.note || o.busyElsewhere) && (
                      <div className="mt-1.5 space-y-1 pl-[3.25rem] text-xs text-neutralx-500">
                        {o.note && <p className="break-words">&ldquo;{o.note}&rdquo;</p>}
                        {o.busyElsewhere && (
                          <p>
                            <span className="font-semibold text-warn">⏰ {d.busyElsewhere}.</span> {d.busyElsewhereHint}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <Acties>
                    <CandidateCardButton userId={o.userId} shiftId={s.id} name={o.freelancerName} beslissing={{ offerId: o.id, regel: reactieRegel(o) }} />
                    <ChatUserButton toUserId={o.userId} contextKey={`shift:${s.id}`} subject={s.title} label={d.message} />
                    {/* Afwijzen / Accepteren open the same card: you always decide while seeing who it is */}
                    <CandidateCardButton userId={o.userId} shiftId={s.id} name={o.freelancerName} beslissing={{ offerId: o.id, regel: reactieRegel(o) }} knoppen="beslissen" />
                  </Acties>
                </li>
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

      {(s.description || s.dresscode || s.extraInfo) && (
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
              {s.extraInfo && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">ℹ️ Extra informatie</h3>
                  <p className="mt-1 whitespace-pre-line break-words text-ink-soft">{s.extraInfo}</p>
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
function reactieRegel(o: { proposedRateCents: number; listedRateCents: number; busyElsewhere: boolean }): string {
  const bod =
    o.proposedRateCents === o.listedRateCents
      ? `Reageert op je klus voor ${moneyExact(o.listedRateCents)}/u.`
      : `Tegenbod: ${moneyExact(o.proposedRateCents)}/u (jij bood ${moneyExact(o.listedRateCents)}/u).`;
  return o.busyElsewhere ? `${bod} Let op: op dat moment al elders ingepland, accepteren lukt dan niet.` : bod;
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
