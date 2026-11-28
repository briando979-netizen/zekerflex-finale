import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { env } from "@/lib/env";
import { getEmployerShift, type EmployerShiftView } from "@/lib/dashboard/employer-shift";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { EmptyState, StatusPill, moneyExact, dateTime } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { Kaart } from "@/components/werkgever/Kaart";
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
import { controleStand, openKeuzes } from "@/lib/company/gecontroleerd";
import { getOrgProfileExtra, type OrgProfileExtra } from "@/lib/profile/store";
import { freelancerRatings } from "@/lib/reviews/ratings";
import { explainMatch } from "@/lib/matching/explain";
import { afzegDeadline, annuleerTermijnLabel } from "@/lib/shifts/annuleertermijn";
import { amsterdamClock, amsterdamDagLabel, amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import { FASE_TOON, klusFase, urenNogOpen, type KlusFase } from "@/lib/werkgever/klus-fase";
import { ReactieLijst } from "@/components/werkgever/ReactieLijst";
import { LinkKopieren } from "@/components/werkgever/LinkKopieren";
import { InfoBlok, KlusInformatie, KlusOmschrijving, type InfoBlokje } from "@/components/werkgever/KlusInformatie";
import { naamVoorMatch } from "@/lib/werkgever/naam";
import { BelgieKlusPaneel } from "@/components/werkgever/BelgieKlusPaneel";
import { isBelgischeKlus } from "@/lib/belgie/klus-kern";
import { dimonaNummers, leesBelgieKlusVoor } from "@/lib/belgie/klus";

export const dynamic = "force-dynamic";

// De kluspagina van een bedrijf, in de opzet van YoungOnes (23 nov 2026): de kop met "Terug naar het overzicht", een kaart met
// de titel, de status, datum, tijd en pauze, "Link kopiëren" en het menu Opties; de kaart met de reacties als tabel
// (components/werkgever/ReactieLijst.tsx); "Klus omschrijving" en "Klusinformatie". Wat de pagina al deed staat ertussen op een
// vaste plek: de meldingen (afzegging, weer openzetten, live, bewaard) direct onder de kop, de reservebank onder de reacties, dan
// de spoedoproep, de groep, "zelfde team" en de claims, en daaronder het team en de wachtrij.
// Privacy: wie alleen reageerde of in de wachtrij staat, staat hier met voornaam en eerste letter van de achternaam
// (lib/werkgever/naam.ts); telefoon, e-mail en adres van een werker komen niet in deze pagina.

type Toon = (typeof FASE_TOON)[KlusFase];
const PIL: Record<Toon, string> = {
  warn: "pill-warn",
  ok: "pill-ok",
  crit: "pill-crit",
  neutral: "pill-neutral",
  plan: "pill bg-plan-soft text-plan-ink",
  money: "pill bg-money-soft text-money-ink",
};
const FASE_LABEL = {
  concept: "faseConcept",
  openstaand: "faseOpenstaand",
  klaar: "faseKlaar",
  bezig: "faseBezig",
  uren: "faseUren",
  archief: "faseArchief",
  geannuleerd: "faseGeannuleerd",
} as const satisfies Record<KlusFase, keyof Dict["klusPagina"]>;
const FASE_UITLEG = {
  concept: "uitlegConcept",
  openstaand: "uitlegOpenstaand",
  klaar: "uitlegKlaar",
  bezig: "uitlegBezig",
  uren: "uitlegUren",
  archief: "uitlegArchief",
  geannuleerd: "uitlegGeannuleerd",
} as const satisfies Record<KlusFase, keyof Dict["klusPagina"]>;

export default async function EmployerShiftPage(props: { params: Promise<{ shiftId: string }> }) {
  const params = await props.params;
  const dict = await getDict();
  const locale = await getLocale();
  const d = dict.shiftDetail;
  const k = dict.klusPagina;
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
  // wat het bedrijf bij "Nog een paar laatste checks" invulde en koos (lib/company/gecontroleerd.ts)
  const orgExtra = scope.tenantIds[0] ? await getOrgProfileExtra(scope.tenantIds[0]).catch((): OrgProfileExtra => ({})) : ({} as OrgProfileExtra);
  const aanvraag = orgExtra.controle ?? null;
  const stand = controleStand({ gecontroleerd: verified, aanvraag });
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

  const nu = Date.now();
  const cat = shiftCategory(s.title, s.skill);
  const seatsFree = s.positions - s.assigned.length;
  const pendingOffers = s.offers.filter((o) => o.status === "pending");
  const shiftEnded = new Date(s.endsAt).getTime() < nu;

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
  // staat de klus live voor werkers? (open, nog niet voorbij, niet alleen voor een eigen pool)
  const klusLive = ["OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(s.status) && !shiftEnded && !s.invitedPool;

  // de status zoals de pil hem toont (lib/werkgever/klus-fase.ts) en de dag en tijden in Nederlandse tijd
  const fase = klusFase(
    { status: s.status, startsAt: s.startsAt, endsAt: s.endsAt, aangenomen: s.assigned.length, urenOpen: s.assigned.some((a) => urenNogOpen(a.timesheetStatus)) },
    nu,
  );
  const datumTaal = locale === "nl" ? "nl-NL" : "en-GB";
  const dagVoluit = (dag: Date) => `${amsterdamDagLabel(amsterdamDayKey(dag), datumTaal)} ${amsterdamParts(dag).year}`;
  const tijden = `${amsterdamClock(s.startsAt)} - ${amsterdamClock(s.endsAt)}`;
  const dagKort = s.startsAt.toLocaleDateString(datumTaal, { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });
  // Een klus in België (lib/belgie/klus-kern.ts): het bedrijf is de werkgever. Het paneel met de soort contract, de bevestiging,
  // de checklist, de sjablonen en de Dimona-nummers staat direct onder de klus, vóór de reacties.
  const belgie = isBelgischeKlus(s.postalCode)
    ? await (async () => {
        const klus = await leesBelgieKlusVoor(s.id);
        const dimona = await dimonaNummers(s.id, s.assigned.map((a) => a.userId));
        return {
          klus,
          bevestigdOp: klus.bevestiging ? `${dagVoluit(new Date(klus.bevestiging.op))}, ${amsterdamClock(klus.bevestiging.op)}` : null,
          werkers: s.assigned.map((a) => ({ userId: a.userId, naam: a.name, dimona: dimona.get(a.userId)?.nummer ?? null })),
        };
      })()
    : null;
  const deadline = afzegDeadline(s.startsAt, s.annuleerUren);
  const deadlineTekst = `${dagVoluit(deadline)} - ${amsterdamClock(deadline)}`;

  const blokDatum: InfoBlokje = { icoon: "datum", label: k.datum, regels: [dagVoluit(s.startsAt)] };
  const blokTijd: InfoBlokje = { icoon: "tijd", label: k.tijd, regels: [fmt(k.tijdWaarde, { van: amsterdamClock(s.startsAt), tot: amsterdamClock(s.endsAt) })] };
  const blokPauze: InfoBlokje = { icoon: "pauze", label: k.pauze, regels: [s.breakMinutes > 0 ? fmt(k.pauzeWaarde, { n: s.breakMinutes }) : k.geenPauze] };
  const infoEerst: InfoBlokje[] = [
    blokDatum,
    blokTijd,
    { icoon: "plaats", label: k.plaats, regels: [s.branch, [s.address, s.city].filter(Boolean).join(", ")].filter(Boolean) },
    { icoon: "aantal", label: k.aantal, regels: [String(s.positions), fmt(k.bezet, { n: s.assigned.length, total: s.positions })] },
  ];
  const infoMeer: InfoBlokje[] = [
    blokPauze,
    { icoon: "branche", label: k.branche, regels: [cat.label] },
    {
      icoon: "annuleren",
      label: k.annuleerKop,
      regels: [
        fmt(deadline.getTime() > nu ? k.annuleerTot : k.annuleerVoorbij, { wanneer: deadlineTekst }),
        fmt(d.annuleerTermijn, { label: annuleerTermijnLabel(s.annuleerUren, locale === "en" ? "en" : "nl") }),
      ],
    },
    {
      icoon: "tarief",
      label: k.uurtarief,
      regels: [
        fmt(k.uurtariefWaarde, { bedrag: moneyExact(s.hourlyRateCents) }),
        `${fmt(k.richtprijs, { bedrag: moneyExact(s.grossPerSeatCents + s.platformFeeCents) })} (${k.richtprijsUitleg})`,
        `${k.platformkosten}: ${fmt(s.platformFeeFree ? d.kpiFeeFreeSub : d.kpiFeeSub, { h: s.hours })}`,
      ],
    },
    ...(s.kostenplaats ? [{ icoon: "kostenplaats" as const, label: k.kostenplaats, regels: [s.kostenplaats] }] : []),
  ];

  return (
    <div>
      <PaginaKop
        title={dict.shifts.title}
        terug={{ href: "/werkgever/diensten", label: k.terug }}
        action={
          <Link href="/werkgever/diensten/nieuw" className="btn-ghost min-h-11 text-sm">
            {d.another}
          </Link>
        }
      />

      <div className="space-y-6">
        {/* kaart 1: de klus zelf — titel, status, datum, tijd en pauze, met "Link kopiëren" en het menu Opties */}
        <Kaart>
          <div className="flex items-start justify-between gap-x-4 gap-y-3">
            <h2 className="min-w-0 flex-1 break-words font-display text-xl font-bold leading-tight text-ink sm:text-2xl">{s.title}</h2>
            <div className="flex flex-shrink-0 items-center gap-2">
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
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-2">
            <span className={PIL[FASE_TOON[fase]]}>{k[FASE_LABEL[fase]]}</span>
            <span className="pill-neutral">{fmt(k.bezet, { n: s.assigned.length, total: s.positions })}</span>
            {s.autoAcceptFavorieten && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{d.autoAcceptAan}</span>}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutralx-600">
            {k[FASE_UITLEG[fase]]}
            {fase === "uren" && (
              <>
                {" "}
                <Link href="/werkgever/uren" className="font-semibold text-brand-600 hover:underline">
                  {k.naarUren}
                </Link>
              </>
            )}
          </p>
          <dl className="mt-6 grid gap-6 sm:grid-cols-3">
            <InfoBlok blokje={blokDatum} />
            <InfoBlok blokje={blokTijd} />
            <InfoBlok blokje={blokPauze} />
          </dl>
        </Kaart>

        {belgie && (
          <BelgieKlusPaneel shiftId={s.id} begin={belgie.klus} bevestigdOp={belgie.bevestigdOp} soortVast={s.assigned.length > 0} werkers={belgie.werkers} />
        )}

        {afzegBlok && (
          <section aria-labelledby="afzeg-reservebank" className="rounded-xl border border-warn/40 bg-warn/10 p-4">
            <div role="status">
              <h2 id="afzeg-reservebank" className="font-semibold text-ink">
                {d.afzegTitel}
              </h2>
              <p className="mt-1 text-sm text-neutralx-700">{d.afzegTekst}</p>
            </div>
            <ul className="mt-3 divide-y divide-hair overflow-hidden rounded-xl border border-hair bg-white">
              {reserves.map((o) => (
                <ReserveRij key={o.id} o={o} shiftId={s.id} shiftTitle={s.title} dict={dict} bewerkbaar={bankBewerkbaar} kanInplannen={kanInplannen} vol={seatsFree === 0} />
              ))}
            </ul>
          </section>
        )}

        {/* een volle klus waar iemand van afzegde en "Klussen automatisch heropenen" staat uit (Instellingen → Klus-instellingen): zelf weer openzetten */}
        {s.status === "FILLED" && seatsFree > 0 && verified && !shiftEnded && (
          <div>
            <KlusWeerOpenKnop shiftId={s.id} />
          </div>
        )}

        {/* Een bedrijf dat nog niet is gecontroleerd zet gewoon klussen live (23 nov 2026): geen waarschuwing. Wel zeggen dat de klus
            live staat, dat de keuzes bewaard zijn als het bedrijf zijn gegevens invulde, en (voor Beheer) dat een klus in concept staat. */}
        {s.status === "DRAFT" && (
          <div role="status" className="rounded-xl border border-hair bg-paper-soft p-4 text-sm text-neutralx-700">
            <p className="font-semibold text-ink">{d.conceptTitel}</p>
            <p className="mt-1">{d.conceptTekst}</p>
          </div>
        )}
        {!verified && klusLive && (
          <div role="status" className="rounded-xl border border-ok/30 bg-ok/10 p-4 text-sm text-neutralx-700">
            <p className="font-semibold text-ink">{d.liveTitel}</p>
            <p className="mt-1">{d.liveTekst}</p>
          </div>
        )}
        {!verified && stand === "aangevraagd" && (
          <div role="status" className="rounded-xl border border-hair bg-paper-soft p-4 text-sm text-neutralx-700">
            <p className="font-semibold text-ink">{d.bewaardTitel}</p>
            <p className="mt-1">{d.bewaardTekst}</p>
          </div>
        )}

        {/* kaart 2: de reacties als tabel, met filters, selectie en de knoppen Accepteren / reservebank / Weigeren */}
        {(openReacties.length > 0 || fase === "openstaand") && (
          <Kaart
            id="reacties"
            vulling={false}
            titel={openReacties.length === 1 ? k.reactiesKopEen : fmt(k.reactiesKop, { n: openReacties.length })}
            uitleg={openReacties.length > 0 ? k.reactiesUitleg : k.reactiesLeeg}
          >
            {openReacties.length > 0 ? (
              <div className="pt-5">
                <ReactieLijst
                  shiftId={s.id}
                  shiftTitle={s.title}
                  bankBewerkbaar={bankBewerkbaar}
                  plekkenVrij={Math.max(0, seatsFree)}
                  nu={nu}
                  klusPlek={Number.isFinite(s.latitude) && Number.isFinite(s.longitude) ? { lat: s.latitude, lng: s.longitude } : null}
                  dienst={{
                    chip: `${dagKort}, ${tijden}`,
                    tijden,
                    startsAt: s.startsAt.toISOString(),
                    uren: s.hours,
                    feePerUurCents: s.platformFeeFree ? 0 : env.PLATFORM_FEE_PER_HOUR_CENTS,
                  }}
                  gekozen={openKeuzes(aanvraag, new Set(openReacties.map((o) => o.id)))}
                  reacties={openReacties.map((o) => ({
                    id: o.id,
                    userId: o.userId,
                    naam: naamVoorMatch(o.freelancerName),
                    avatarUrl: o.avatarUrl,
                    proposedRateCents: o.proposedRateCents,
                    listedRateCents: o.listedRateCents,
                    note: o.note,
                    busyElsewhere: o.busyElsewhere,
                    attendancePct: o.cijfers.prestaties.compleetPct,
                    zelfPct: o.cijfers.prestaties.zelfPct,
                    shiftsCompleted: o.shiftsCompleted,
                    reviewAverage: o.reviewAverage,
                    reviewCount: o.reviewCount,
                    favoriet: favSet.has(o.userId),
                    gematcht: o.cijfers.prestaties.gematcht,
                    nietVoltooid: o.cijfers.prestaties.nietVoltooid,
                    vervanging: o.cijfers.prestaties.vervanging,
                    urenBijBedrijf: o.cijfers.urenBijBedrijf,
                    regios: o.cijfers.regios.map((r) => ({ naam: r.naam, lat: r.lat, lng: r.lng })),
                    kvk: o.cijfers.kvk,
                    zelfdeSector: o.cijfers.zelfdeSector,
                    zelfdeFunctie: o.cijfers.zelfdeFunctie,
                    gematchtDieDag: o.cijfers.gematchtDieDag,
                    regel: reactieRegel(dict.kandidaatKaart, o),
                  }))}
                />
              </div>
            ) : (
              <div className="pb-5" />
            )}
          </Kaart>
        )}

        {!afzegBlok && reserves.length > 0 && (
          <Kaart vulling={false} titel={fmt(d.reserveTitle, { n: reserves.length })} uitleg={d.reserveSubtitle}>
            {zoektVervanger && <p className="mt-4 border-t border-hair px-5 py-3 text-xs text-neutralx-600">{fmt(d.reserveVervanging, { naam: zoektVervanger.name })}</p>}
            <ul className="mt-4 divide-y divide-hair border-t border-hair">
              {reserves.map((o) => (
                <ReserveRij key={o.id} o={o} shiftId={s.id} shiftTitle={s.title} dict={dict} bewerkbaar={bankBewerkbaar} kanInplannen={kanInplannen} vol={seatsFree === 0} />
              ))}
            </ul>
          </Kaart>
        )}

        {/* hulpmiddelen bij deze klus: de eigen groep op de open markt zetten, de spoedoproep, hetzelfde team herhalen, claims */}
        {s.invitedPool && <PublishPoolShiftButton shiftId={s.id} poolName={s.invitedPool.name} />}

        {/* niet in België: een spoedoproep geeft de eerste die "1" antwoordt een plek, en daar kiest het bedrijf zelf */}
        {seatsFree > 0 && verified && !shiftEnded && s.status !== "CANCELLED" && s.status !== "DRAFT" && !belgie && <SpoedoproepPaneel shiftId={s.id} seatsFree={seatsFree} />}

        {s.status !== "CANCELLED" && verified && <RepeatTeamButton shiftId={s.id} teamSize={s.assigned.length} />}

        <ClaimReviewPanel shiftId={s.id} />

        <Kaart vulling={false} titel={fmt(d.assignedTitle, { n: s.assigned.length, total: s.positions })}>
          {s.assigned.length === 0 ? (
            <EmptyState title={d.assignedEmptyTitle} body={d.assignedEmptyBody} />
          ) : (
            <ul className="mt-4 divide-y divide-hair border-t border-hair">
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
        </Kaart>

        <Kaart vulling={false} titel={fmt(d.queueTitle, { n: s.queue.length })} uitleg={d.queueSubtitle}>
          {s.queue.length === 0 ? (
            <EmptyState title={d.queueEmptyTitle} body={d.queueEmptyBody} />
          ) : (
            <ul className="mt-4 divide-y divide-hair border-t border-hair">
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
        </Kaart>

        {/* kaart 3: de omschrijving zoals de werker hem leest, met de kledingvoorschriften */}
        <Kaart titel={k.omschrijvingKop}>
          {s.description ? <KlusOmschrijving tekst={s.description} leesMeer={k.leesMeer} leesMinder={k.leesMinder} /> : <p className="text-sm text-neutralx-600">{k.geenOmschrijving}</p>}
          {s.dresscode && (
            <div className="mt-5">
              <h3 className="text-sm font-bold text-ink">{k.kleding}</h3>
              <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-ink">{s.dresscode}</p>
            </div>
          )}
          {s.vaardigheden.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold text-ink">Vaardigheden</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {s.vaardigheden.map((v) => (
                  <span key={v} className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">{v}</span>
                ))}
              </div>
            </div>
          )}
        </Kaart>

        {/* kaart 4: alle gegevens van de klus als blokjes; de rest achter "Toon meer klusinformatie" */}
        <Kaart titel={k.infoKop}>
          <KlusInformatie eerst={infoEerst} meer={infoMeer} toonMeer={k.toonMeer} toonMinder={k.toonMinder} />
        </Kaart>
      </div>
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
