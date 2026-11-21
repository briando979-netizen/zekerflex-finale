import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/prefs/store";
import { getOpenRequestForShift } from "@/lib/replacements/store";
import { listCounterOffers } from "@/lib/offers/store";
import { getShiftDetail } from "@/lib/dashboard/marketplace";
import { reviewSummary } from "@/lib/reviews/store";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { ShiftActions } from "@/components/app/ShiftActions";
import { ReplacementTakeoverButton } from "@/components/app/ReplacementTakeoverButton";
import { ShiftMenu } from "@/components/app/ShiftMenu";
import { MessageEmployerButton } from "@/components/app/MessageEmployerButton";
import { ShiftMap } from "@/components/app/ShiftMap";
import { KlusRoute } from "@/components/app/KlusRoute";
import { ReageerButton } from "@/components/app/ReageerModal";
import { shiftCategory } from "@/lib/shifts/category";
import { MODE_ORDER, type TravelModeKey } from "@/lib/geo/travel-modes";
import type { RouteModus } from "@/lib/geo/route-core";
import { money, moneyExact } from "@/components/app/ui";
import { localStamp, type CalendarEvent } from "@/lib/calendar/links";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { listAdvances } from "@/lib/payouts/advances";
import { voorschottenVoorWerker } from "@/lib/payouts/voorschot-zicht";
import { certsRequiredForShift } from "@/lib/certificates/matching";
import { validCertTypes, CERT_TYPES } from "@/lib/certificates/store";
import { getFreelancerDict } from "@/lib/i18n/server";
import { translateBlockReason, type FreelancerDict } from "@/lib/i18n/freelancer";
import { inAndroidApp } from "@/lib/app-mode-server";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";
import { isFollowing } from "@/lib/worker/follows";
import { reageerStap } from "@/lib/onboarding/laat-weten";
import { FollowEmployerButton } from "@/components/app/FollowEmployerButton";
import { UurloonInfo } from "@/components/app/UurloonInfo";
import { uurloonOpbouw } from "@/lib/payroll/uurloon-opbouw";
import { amsterdamWeek, findOverlappingShift, MAX_WEEK_HOURS, restViolation, weekHoursWith } from "@/lib/shifts/worker-overlap";
import { afzegDeadline } from "@/lib/shifts/annuleertermijn";
import { KLUS_TYPE_EMOJI } from "@/lib/shifts/klus-type";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// De kluspagina van de werker, in de opzet van de app van YoungOnes (eigenaar, 21 nov 2026: "alles in de stijl van
// YoungOnes, alleen de chat bewaren"). Van boven naar beneden: foto · terug/hart/⋯ · bedrijf · titel · dag | tijd |
// plaats · chips (Invalklus, Freelance) + tarief · voorwaarden-chips · kaart + reistijden · adres, pauze, functie,
// "We zoeken n freelancers", kledingvoorschriften, "Je kunt annuleren tot" · omschrijving · kledingvoorschriften ·
// vaste balk met tarief, "Verdien ~" en "Reageer op deze klus" · "Er zijn n reacties". Wat ZekerFlex extra kan en
// echt werkt blijft: ID-herinnering, certificaten, Arbeidstijdenwet-waarschuwingen, modelovereenkomst, uren/uitbetaling
// na afloop, en altijd de chat met de opdrachtgever.
// ---------------------------------------------------------------------------

// Dutch wall-clock times — this page renders on the server, which runs in UTC.
const hhmm = (d: Date | string) => amsterdamClock(d);
const MODE_EMOJI: Record<string, string> = { driving: "🚗", transit: "🚆", walking: "🚶", bicycling: "🚲" };
// De routeplanner kent geen OV: is dat het snelst, dan begint de route met de auto.
const ROUTE_BEGIN: Record<TravelModeKey, RouteModus> = { driving: "auto", transit: "auto", bicycling: "fiets", walking: "lopen" };


export default async function ShiftDetailPage(props: { params: Promise<{ shiftId: string }> }) {
  const params = await props.params;
  const principal = await requirePrincipal();
  const ft = await getFreelancerDict();
  const D = ft.detail;
  // Android app: no fast payout (a web-only financial feature, lib/app-mode.ts)
  const inApp = await inAndroidApp();
  const WD = ft.date.wd;
  const MON = ft.date.mon;
  const s = await getShiftDetail(principal.userId, params.shiftId);
  if (!s) notFound();

  const start = new Date(s.startsAt);
  const upcoming = start.getTime() > Date.now();
  const shiftEnded = new Date(s.endsAt).getTime() < Date.now();
  const cat = shiftCategory(s.title, s.skill);

  const [offers, orgReviews, orgExtra, otherShifts, fiscal, followsClient] = await Promise.all([
    listCounterOffers(500),
    reviewSummary("company", s.clientTenantId),
    getOrgProfileExtra(s.clientTenantId),
    // andere komende klussen van dit bedrijf: in de reageer-sheet kun je er in één keer op meereageren
    prisma.shift.findMany({
      where: {
        branch: { tenantId: s.clientTenantId },
        status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
        startsAt: { gte: new Date() },
        id: { not: s.id },
      },
      select: { id: true, title: true, startsAt: true, hourlyRateCents: true },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
    getFiscal(principal.userId),
    isFollowing(principal.userId, s.clientTenantId),
  ]);
  const isPayroll = invoiceModeFor(fiscal) === "payroll";
  const reactionCount = offers.filter((o) => o.shiftId === s.id && o.status === "pending").length;

  // Certificaten die deze klus vraagt + wat de freelancer heeft.
  const certReqs = certsRequiredForShift(s.title, s.skill);
  const heldCerts = certReqs.length ? await validCertTypes(principal.userId) : new Set<string>();
  const certList = certReqs.map((c) => ({
    ...c,
    label: CERT_TYPES[c.type].label,
    have: heldCerts.has(c.type),
  }));
  const missingRequiredCert = certList.find((c) => c.required && !c.have) ?? null;
  const uitzendbureauBlocked = s.viaUitzendbureau && !isPayroll;
  // Uitzendvoorwaarden (loonstrook, vast loon) alleen als de klus via het uitzendbureau loopt;
  // het label volgt de klus, net als ShiftCard.
  // 10 nov (eigenaar): alleen bij een uitzendklus, niet bij elke klus van een uitzendkracht
  const agencyTerms = s.viaUitzendbureau;

  // Annuleringstermijn van deze klus (24/48/72/168 uur, gekozen door het bedrijf; lib/shifts/annuleertermijn.ts).
  const cancelDeadline = afzegDeadline(start, s.annuleerUren);
  const cancelPassed = cancelDeadline.getTime() < Date.now();
  const fmtDay = (d: Date) => {
    const p = amsterdamParts(d);
    return `${WD[p.weekday]} ${p.day} ${MON[p.month - 1]}. ${hhmm(d)}`;
  };

  // Does the freelancer already have a klus that overlaps this time window?
  // The server refuses a second booking (lib/shifts/worker-overlap.ts), so say why up front.
  const myProfile = await prisma.freelancerProfile.findUnique({
    where: { userId: principal.userId },
    select: { id: true },
  });
  const overlap = myProfile
    ? await findOverlappingShift(prisma, myProfile.id, { shiftId: s.id, startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) })
    : null;
  const conflict = Boolean(overlap);
  const whenOf = (o: { startsAt: Date; endsAt: Date }) => {
    const p = amsterdamParts(o.startsAt);
    return `${WD[p.weekday]} ${p.day} ${MON[p.month - 1]}. ${hhmm(o.startsAt)}–${hhmm(o.endsAt)}`;
  };
  // Together with your own work around it, no 11 hours' rest in some 24 hours (Arbeidstijdenwet): a heads-up, no block.
  const restWindow = 2 * 24 * 3_600_000;
  const nearby =
    myProfile && !overlap && upcoming
      ? await prisma.shiftAssignment.findMany({
          where: {
            freelancerId: myProfile.id,
            cancelledAt: null,
            shiftId: { not: s.id },
            shift: {
              startsAt: { lt: new Date(new Date(s.endsAt).getTime() + restWindow) },
              endsAt: { gt: new Date(start.getTime() - restWindow) },
            },
          },
          select: { shift: { select: { startsAt: true, endsAt: true } } },
          take: 20,
        })
      : [];
  const rest = restViolation(nearby.map((n) => n.shift), { startsAt: start, endsAt: new Date(s.endsAt) });
  // More than 60 hours in that Dutch week with this klus (Arbeidstijdenwet): also only a heads-up.
  const week = amsterdamWeek(start);
  const weekShifts =
    myProfile && !overlap && upcoming
      ? await prisma.shiftAssignment.findMany({
          where: { freelancerId: myProfile.id, cancelledAt: null, shiftId: { not: s.id }, shift: { startsAt: { gte: week.from, lt: week.to } } },
          select: { shift: { select: { startsAt: true, endsAt: true, breakMinutes: true } } },
          take: 30,
        })
      : [];
  const weekHours = weekShifts.length
    ? weekHoursWith(weekShifts.map((w) => w.shift), { startsAt: start, endsAt: new Date(s.endsAt), breakMinutes: s.breakMinutes })
    : 0;
  const applyDisabled = !s.canApply || Boolean(overlap) || Boolean(missingRequiredCert) || uitzendbureauBlocked;
  const applyBlockReasonText = !s.canApply && s.blockReason ? translateBlockReason(s.blockReason, ft) : null;
  const applyBlockReason = !s.canApply
    ? applyBlockReasonText
    : overlap
      ? D.blockOverlap(overlap.title, whenOf(overlap))
      : uitzendbureauBlocked
        ? D.blockAgencyOnly
        : missingRequiredCert
          ? D.blockCert(missingRequiredCert.label)
          : null;
  // Nog niet mogen reageren door de aanmelding (de server beslist, s.blockReason): de knop opent dan een uitleg-sheet
  // (zonder goedgekeurd ID: "Je moet jouw ID-check nog afronden" + Check ID, zoals bij YoungOnes)
  const applyBlokkade = !s.canApply && applyBlockReasonText ? { reden: applyBlockReasonText, stap: reageerStap(s.blockReason) } : null;
  let assigned: {
    assignmentId: string;
    confirmedAt: string | null;
    replacementRequestId: string | null;
    replacementResponseCount: number;
    replacementRequested: boolean;
  } | null = null;
  if (s.alreadyApplied && upcoming) {
    const row = myProfile
      ? await prisma.shiftAssignment.findFirst({
          where: { shiftId: s.id, freelancerId: myProfile.id, cancelledAt: null },
          select: { id: true },
        })
      : null;
    if (row) {
      const [prefs, openReq] = await Promise.all([getPrefs(principal.userId), getOpenRequestForShift(s.id)]);
      const mineReq = openReq && openReq.userId === principal.userId ? openReq : null;
      assigned = {
        assignmentId: row.id,
        confirmedAt: prefs.confirmations[row.id] ?? null,
        replacementRequestId: mineReq?.id ?? null,
        replacementResponseCount: mineReq?.responses.length ?? 0,
        replacementRequested: Boolean(mineReq),
      };
    }
  }

  // Selected for this klus, or it is over (archived): nothing to react to any
  // more — the bottom bar only offers a message to the client.
  const settled = Boolean(assigned) || s.alreadyApplied || s.myOffer?.status === "accepted" || !upcoming;

  // Modelovereenkomst-zichtbaarheid. Bij ontdekken (nog niet gereageerd op DEZE
  // klus) tonen we de overeenkomst niet — ook niet als er al een overeenkomst
  // met dezelfde opdrachtgever bestaat uit een eerdere klus. Pas na reageren
  // verschijnt een concept; de ECHTE overeenkomst mét de handtekening van de
  // opdrachtgever pas als je voor deze klus bent uitgekozen.
  const reactedThisShift = s.alreadyApplied || Boolean(s.myOffer && s.myOffer.status !== "withdrawn");
  // Uitgekozen = een lopende toewijzing, ook als de klus al begonnen of voorbij is
  // (`assigned` wordt alleen voor komende klussen gevuld; dan stond hier ten onrechte "concept").
  const selectedThisShift =
    Boolean(assigned) ||
    Boolean(
      myProfile &&
        s.alreadyApplied &&
        (await prisma.shiftAssignment.findFirst({
          where: { shiftId: s.id, freelancerId: myProfile.id, cancelledAt: null },
          select: { id: true },
        })),
    );
  const showAgreement = reactedThisShift || selectedThisShift;
  const showRealAgreement = selectedThisShift && Boolean(s.agreement);
  const agreementHref = showRealAgreement
    ? `/api/model-agreements/${s.agreement!.id}/pdf`
    : `/api/model-agreements/preview?shiftId=${s.id}`;

  // Worked / archived state: the timesheet + payout for this engagement.
  const worked =
    myProfile && s.alreadyApplied
      ? await prisma.shiftAssignment.findFirst({
          where: { shiftId: s.id, freelancerId: myProfile.id },
          select: {
            cancelledAt: true,
            timesheet: {
              select: {
                id: true,
                status: true,
                billableMinutes: true,
                hourlyRateCents: true,
                submittedAt: true,
                approvedAt: true,
                invoices: {
                  select: {
                    subtotalCents: true,
                    payment: { select: { settledAt: true } },
                  },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        })
      : null;
  const ts = worked?.timesheet ?? null;
  const tsGrossCents = ts
    ? ts.invoices[0]?.subtotalCents ?? Math.round((ts.billableMinutes / 60) * ts.hourlyRateCents)
    : 0;
  const paidAt = ts?.invoices[0]?.payment?.settledAt ?? null;
  // How long it actually took from handing in your hours to the money landing.
  const payoutDays =
    ts?.submittedAt && paidAt
      ? Math.max(0, Math.round((paidAt.getTime() - ts.submittedAt.getTime()) / 86_400_000))
      : null;
  const payrollAdvance =
    isPayroll && ts
      ? voorschottenVoorWerker(await listAdvances(principal.userId)).find(
          (a) => a.kind === "payroll" && a.timesheetId === ts.id,
        ) ?? null
      : null;
  const showWorkStatus = Boolean(ts && !worked?.cancelledAt && (shiftEnded || ts.status !== "DRAFT"));
  const showWorkedFigures = Boolean(
    ts && ["SUBMITTED", "APPROVED", "PAID", "DISPUTED"].includes(ts.status),
  );

  const sp = amsterdamParts(start);
  const dateLabel = `${WD[sp.weekday]} ${sp.day} ${MON[sp.month - 1]}.`;
  const timeLabel = `${hhmm(s.startsAt)} - ${hhmm(s.endsAt)}`;
  const dresscode = s.dresscode?.trim() || null;

  const calendarEvent: CalendarEvent = {
    title: `${s.title} — ${s.company}`,
    startLocal: localStamp(s.startsAt),
    endLocal: localStamp(s.endsAt),
    location: [s.branch, s.address, `${s.postalCode ?? ""} ${s.city}`.trim()].filter(Boolean).join(", "),
    description:
      `Je klus via ZekerFlex bij ${s.company}.\n` +
      `Uurtarief ${moneyExact(s.hourlyRateCents)}.\n` +
      (s.skill ? `Functie: ${s.skill}\n` : "") +
      (s.breakMinutes > 0 ? `Pauze: ${s.breakMinutes} minuten\n` : "Geen pauze\n") +
      `Adres: ${s.address}, ${s.postalCode ?? ""} ${s.city}\n\n` +
      `Bevestig je komst in de app en check op tijd in op locatie.`,
  };

  return (
    <div className="pb-40">
      {/* Foto, met eronder de rij terug · hartje · ⋯ (zoals in de app van YoungOnes) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cat.photo} alt="" className="h-52 w-full object-cover sm:h-64" />
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2">
        <Link
          href="/dashboard/klussen"
          aria-label={D.back}
          className="grid h-10 w-10 place-items-center rounded-full text-xl text-ink"
        >
          ←
        </Link>
        <div className="flex items-center gap-2">
          {/* het hartje = opdrachtgever als favoriet (melding bij elke nieuwe dienst), met een bevestiging */}
          <FollowEmployerButton variant="hart" tenantId={s.clientTenantId} name={s.clientName || s.branch} initialFollowing={followsClient} />
          <ShiftMenu employerName={s.branch} shiftTitle={s.title} />
        </div>
      </div>

      {assigned && (
        <div className="mx-auto max-w-2xl border-b border-hair px-4 py-5">
          {!assigned.replacementRequested && (
            <>
              <h2 className="font-display text-xl font-bold text-ink">{D.yourJob}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">
                {cancelPassed ? D.cancelPassedBody : D.yourJobBody(s.company, fmtDay(cancelDeadline))}
              </p>
              <p className="mt-3 text-sm font-semibold text-ink">{D.bringId}</p>
            </>
          )}
          <div className={assigned.replacementRequested ? "" : "mt-4"}>
            <ShiftActions
              assignmentId={assigned.assignmentId}
              shiftId={s.id}
              shiftTitle={s.title}
              startsAtISO={start.toISOString()}
              noticeHours={s.annuleerUren}
              confirmedAt={assigned.confirmedAt}
              replacementRequested={assigned.replacementRequested}
              replacementRequestId={assigned.replacementRequestId}
              replacementResponseCount={assigned.replacementResponseCount}
              heroPhoto={cat.photo}
              calendar={calendarEvent}
              variant="detail"
            />
          </div>
          {!assigned.replacementRequested && (
            <a
              href={agreementHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink underline"
            >
              📄 {s.agreement ? D.viewAgreement : D.viewDraftAgreement}
            </a>
          )}
        </div>
      )}

      {!assigned && showWorkStatus && ts && (
        <div className="mx-auto max-w-2xl border-b border-hair px-4 py-5">
          <WorkStatusHeader
            status={ts.status}
            timesheetId={ts.id}
            payroll={isPayroll}
            advanceNetCents={payrollAdvance?.netCents ?? null}
            D={D}
            W={ft.work}
          />
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 py-5">
        {s.testklus && (
          <p className="mb-4 rounded-xl border border-hairstrong bg-paper-soft px-3.5 py-3 text-sm text-neutralx-700">
            <strong className="block text-ink">{ft.card.testklus}</strong>
            {ft.card.testklusUitleg}
          </p>
        )}
        {/* de bedrijfsnaam, niet de vestiging ("Eenmalige locatie — adres"); het adres staat bij de kaart hieronder */}
        <p className="text-sm font-semibold text-brand-600">{s.company}</p>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink">{s.title}</h1>

        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-neutralx-500">
          <span>{dateLabel}</span>
          <span className="text-hairstrong">|</span>
          <span>{timeLabel}</span>
          <span className="text-hairstrong">|</span>
          <span>{s.city}</span>
        </p>
        {rest && (
          <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
            ⏳ {D.shortRest(`${fmtDay(rest.startsAt)} – ${fmtDay(rest.endsAt)}`)}
          </p>
        )}
        {weekHours > MAX_WEEK_HOURS && (
          <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
            📅 {D.longWeek(Math.round(weekHours))}
          </p>
        )}

        {/* chips links (Invalklus, Freelance of Via uitzendbureau), het tarief groot rechts */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="flex flex-wrap items-center gap-1.5">
            {s.isReplacement && upcoming && (
              <span className="rounded border border-warn/40 px-2 py-0.5 text-xs font-semibold text-warn">{ft.card.invalklus}</span>
            )}
            {s.viaUitzendbureau ? (
              <span className="rounded border border-amber-500/40 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {ft.card.viaAgency}
              </span>
            ) : (
              <span className="rounded border border-brand-500/40 px-2 py-0.5 text-xs font-semibold text-brand-600">
                {ft.card.freelance}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <span className="num font-display text-xl font-bold text-ink">{moneyExact(s.hourlyRateCents)}</span>
            {agencyTerms && (
              <UurloonInfo opbouw={uurloonOpbouw({ hourlyRateCents: s.hourlyRateCents, birthDate: fiscal.birthDate, op: start })} />
            )}
          </span>
        </div>

        {/* de voorwaarden als chips met een pictogram, in de volgorde van de kluspagina van YoungOnes:
            ✌️ ZZP bij de opdrachtgever · 💸 Uitbetaling per klus · 📋 Belasting: zelf · 💰 Tegenbod mogelijk · ⛱️ Vakantiegeld: nee;
            bij een uitzendklus de uitzendvoorwaarden (zelfde teksten als het vergelijkblok op Ontdekken) */}
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={ft.market.typeTitle}>
          {(agencyTerms ? ft.market.typeUitzend.map((tekst, i) => `${KLUS_TYPE_EMOJI.uitzenden[i] ?? "•"} ${tekst}`) : D.chips).map((c) => (
            <li key={c} className="rounded-lg border border-hair bg-paper-soft px-2.5 py-1.5 text-xs font-medium text-neutralx-700">
              {c}
            </li>
          ))}
        </ul>

        {/* Snelle uitbetaling — alleen als de opdrachtgever het aanbiedt (en niet in de Android-app) */}
        {s.fastPay && !inApp && !agencyTerms && (
          <p className="mt-3 rounded-xl border border-brand-500/30 bg-brand-50 px-3 py-2.5 text-xs text-brand-700">
            <span className="font-semibold">{D.fastPayTitle}</span>{D.fastPayBody}
          </p>
        )}

        {/* Kaart — met een thuisbasis ook de echte route ernaartoe (onze eigen routeplanner, achteraf geladen;
            zonder routeplanner blijft de schatting staan). De thuisbasis gaat niet mee naar de browser. */}
        <div className="mt-5">
          {s.travel ? (
            <KlusRoute
              klusId={s.id}
              lat={s.branchLat}
              lng={s.branchLng}
              label={`${s.address}, ${s.city}`}
              schatting={{
                auto: { minutes: s.travel.byMode.driving.minutes, km: s.travel.byMode.driving.distanceKm },
                fiets: { minutes: s.travel.byMode.bicycling.minutes, km: s.travel.byMode.bicycling.distanceKm },
                lopen: { minutes: s.travel.byMode.walking.minutes, km: s.travel.byMode.walking.distanceKm },
              }}
              begin={ROUTE_BEGIN[s.travel.fastest.mode]}
            />
          ) : (
            <ShiftMap lat={s.branchLat} lng={s.branchLng} height={180} label={`${s.address}, ${s.city}`} />
          )}
        </div>

        {/* Reistijden vragen een thuisbasis (de postcode van de aanmelding); zeg waarom hier anders niets staat. */}
        {!s.travel && (
          <p className="mt-3 rounded-xl border border-dashed border-hair bg-paper-soft px-4 py-3 text-sm text-neutralx-500">
            {D.homeBefore}{" "}
            <Link href="/dashboard/verificatie" className="font-medium text-brand-600 hover:underline">
              {D.verification}
            </Link>{" "}
            {D.homeAfter}
          </p>
        )}
        {s.travel && (
          <details className="mt-3 rounded-xl border border-hair bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <span className="flex items-center gap-3 text-lg">
                {MODE_ORDER.map((m) => (
                  <span key={m} className={m === s.travel!.fastest.mode ? "" : "opacity-40"} title={D.modes[m] ?? s.travel!.byMode[m].label}>
                    {MODE_EMOJI[m]}
                  </span>
                ))}
              </span>
              <span className="text-sm font-semibold text-ink underline decoration-crit/50 decoration-2 underline-offset-4">
                {D.travelTimes}
              </span>
            </summary>
            <ul className="divide-y divide-hair border-t border-hair">
              {MODE_ORDER.map((m) => {
                const e = s.travel!.byMode[m];
                const fast = m === s.travel!.fastest.mode;
                return (
                  <li key={m} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className={fast ? "font-semibold text-brand-700" : "text-neutralx-600"}>{D.modes[m] ?? e.label}</span>
                    <span className="num text-neutralx-500">
                      {D.minutes(e.minutes)} · {e.distanceKm} km
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {/* Rijen met een pictogram: adres · pauze · functie · we zoeken n · kledingvoorschriften · annuleren tot */}
        <dl className="mt-5 space-y-3.5">
          <InfoRow icon="◎">
            {s.address}
            <br />
            {s.postalCode} {s.city}
          </InfoRow>
          <InfoRow icon="☕">
            {s.breakMinutes > 0 ? D.breakMin(s.breakMinutes) : D.noBreak}
          </InfoRow>
          <InfoRow icon="🏷️">{s.skill ?? ft.cat[cat.key]}</InfoRow>
          <InfoRow icon="👤">
            {s.viaUitzendbureau ? D.lookingForAgency(s.positions) : D.lookingFor(s.positions)}
          </InfoRow>
          {dresscode && <InfoRow icon="👕">{D.dresscodeApply}</InfoRow>}
          <InfoRow icon="⊘">
            {cancelPassed ? D.cancelPassed(fmtDay(cancelDeadline)) : D.cancelUntil(fmtDay(cancelDeadline))}
          </InfoRow>
          {showAgreement && !assigned && (
            <div className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border border-hairstrong text-xs text-neutralx-400">
                📄
              </span>
              <div>
                <a
                  href={agreementHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink underline"
                >
                  {showRealAgreement ? D.yourAgreement : D.viewDraftAgreement}
                </a>
                {!showRealAgreement && (
                  <p className="mt-0.5 text-xs text-neutralx-500">
                    {D.draftNote}
                  </p>
                )}
              </div>
            </div>
          )}
        </dl>

        {showWorkedFigures && ts && (
          <div className="mt-5 divide-y divide-hair overflow-hidden rounded-xl border border-hair">
            <SummaryRow label={D.workedHours} value={D.worked(Math.floor(ts.billableMinutes / 60), ts.billableMinutes % 60)} />
            <SummaryRow label={D.payment} hint={D.exclVat} value={moneyExact(tsGrossCents)} />
            <SummaryRow
              label={isPayroll ? D.payroll : D.paymentTerm}
              value={
                isPayroll
                  ? D.viaPayslip
                  : ts.status === "PAID"
                    ? payoutDays === null
                      ? D.paidOut
                      : payoutDays === 0
                        ? D.sameDay
                        : D.nDays(payoutDays)
                    : ts.status === "APPROVED"
                      ? D.payingNow
                      : D.afterApproval
              }
            />
          </div>
        )}

        {s.description && (
          <div className="mt-6 whitespace-pre-line text-sm leading-relaxed text-neutralx-700">{s.description}</div>
        )}

        {/* "Extra informatie" staat nergens meer in de werker-app (10 nov, eigenaar) */}

        {dresscode && (
          <section className="mt-6">
            <h2 className="font-display text-base font-bold text-ink">{D.dresscodeTitle}</h2>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-neutralx-700">{dresscode}</p>
          </section>
        )}

        {/* Certificaten die de klus vraagt (een verplicht certificaat dat je mist, blokkeert het reageren) */}
        {certList.length > 0 && (
          <section className="mt-8 border-t border-hair pt-5">
            <h2 className="font-display text-base font-bold text-ink">{D.needTitle}</h2>
            <div className="mt-3 space-y-2">
              {certList.map((c) => (
                <div
                  key={c.type}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                    c.have
                      ? "border-ok/30 bg-ok/5"
                      : c.required
                        ? "border-crit/30 bg-crit/5"
                        : "border-hair bg-paper-soft"
                  }`}
                >
                  <span className="mt-0.5">{c.have ? "✅" : c.required ? "⛔" : "📄"}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {c.label}
                      {c.required ? D.required : D.recommended}
                    </p>
                    <p className="text-xs text-neutralx-500">
                      {c.have ? D.haveCert : c.reason}
                    </p>
                    {!c.have && (
                      <p className="mt-1 text-xs font-semibold">
                        <Link href="/dashboard/certificaten" className="text-brand-600 underline">
                          {D.addCert}
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Over de opdrachtgever: alleen wat er echt is (beoordelingen, eigen tekst, website) en al zijn klussen */}
        {(orgReviews.count > 0 || orgExtra.about || orgExtra.websiteUrl) && (
          <section className="mt-8 border-t border-hair pt-5">
            <h2 className="font-display text-base font-bold text-ink">{D.about(s.company)}</h2>
            {orgReviews.count > 0 && (
              <p className="mt-1.5 flex items-center gap-2 text-sm">
                <span className="text-amber-500">
                  {"★★★★★".slice(0, Math.round(orgReviews.average))}
                  <span className="text-neutralx-300">{"★★★★★".slice(Math.round(orgReviews.average))}</span>
                </span>
                <span className="text-neutralx-500">
                  {D.reviews(orgReviews.count)}
                </span>
              </p>
            )}
            {orgExtra.about && (
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{orgExtra.about}</p>
            )}
            {orgExtra.websiteUrl && (
              <a
                href={orgExtra.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 underline"
              >
                {D.website(s.company)}
              </a>
            )}
          </section>
        )}

        <Link
          href={`/dashboard/klussen?employer=${encodeURIComponent(s.company)}`}
          className="mt-6 block rounded-xl border border-hairstrong px-4 py-3 text-center text-sm font-semibold text-ink hover:bg-paper-soft"
        >
          {D.allJobsOf(s.company)}
        </Link>

        {/* de chat met de opdrachtgever blijft altijd (eigenaar, 20 nov) */}
        {!settled && (
          <div className="mt-3">
            <MessageEmployerButton shiftId={s.id} label={D.messageEmployer} />
          </div>
        )}
      </div>

      {/* Vaste balk onderaan: tarief + "Verdien ~" links, "Reageer op deze klus" rechts, eronder het aantal reacties */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-white/95 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-4 py-3">
          {settled ? (
            <div>
              <p className="text-center text-xs text-neutralx-500">{D.forQuestions}</p>
              <div className="mt-2">
                <MessageEmployerButton shiftId={s.id} label={D.messageEmployer} className="btn-primary w-full py-2.5 text-sm" />
              </div>
            </div>
          ) : s.myOffer && s.myOffer.status !== "withdrawn" ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="num font-display text-lg font-bold text-ink">{moneyExact(s.hourlyRateCents)}</p>
                <p className="text-[11px] text-neutralx-400">{ft.card.earn(money(s.grossCents))}</p>
              </div>
              {s.myOffer.reserve ? (
                // op de reservebank van het bedrijf (lib/reservebank): neutraal, nog niet ingepland
                <div className="max-w-[15rem] text-right">
                  <span className="pill-neutral">{ft.card.reserveStatus}</span>
                  <p className="mt-1 text-[11px] text-neutralx-500">{ft.card.reserveUitleg}</p>
                </div>
              ) : (
                <span className={s.myOffer.status === "expired" || s.myOffer.status === "declined" ? "pill-neutral" : "pill-warn"}>
                  {D.responseSent} ·{" "}
                  {ft.card.offer[s.myOffer.status === "accepted" || s.myOffer.status === "declined" || s.myOffer.status === "expired" ? s.myOffer.status : "pending"]}
                </span>
              )}
            </div>
          ) : s.isReplacement && upcoming ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="num font-display text-lg font-bold text-ink">{moneyExact(s.hourlyRateCents)}</p>
                <p className="text-[11px] text-neutralx-400">{ft.card.earn(money(s.grossCents))}</p>
              </div>
              <ReplacementTakeoverButton
                shiftId={s.id}
                disabled={applyDisabled}
                notReadyReason={applyBlockReason}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex-shrink-0">
                <p className="num font-display text-lg font-bold text-ink">{moneyExact(s.hourlyRateCents)}</p>
                <p className="text-[11px] text-neutralx-400">{ft.card.earn(money(s.grossCents))}</p>
              </div>
              <ReageerButton
                shiftId={s.id}
                listedRateCents={s.hourlyRateCents}
                clientName={s.clientName || s.branch}
                startTime={hhmm(s.startsAt)}
                endTime={hhmm(s.endsAt)}
                conflict={conflict}
                agreementHref={agreementHref}
                dresscode={dresscode}
                otherShifts={otherShifts.map((o) => ({
                  id: o.id,
                  title: o.title,
                  startsAt: o.startsAt.toISOString(),
                  hourlyRateCents: o.hourlyRateCents,
                }))}
                disabled={applyDisabled}
                notReadyReason={applyBlockReason}
                blokkade={applyBlokkade}
                full
                fixedRate={agencyTerms}
              />
            </div>
          )}
          {!settled && (
            <p className="mt-2 text-center text-xs text-neutralx-400">
              {D.reactions(reactionCount)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border border-hairstrong text-xs text-neutralx-400">
        {icon}
      </span>
      <span className="text-neutralx-700">{children}</span>
    </div>
  );
}

function SummaryRow({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
      <span className="text-neutralx-500">
        {label}
        {hint ? <span className="ml-1 text-xs text-neutralx-400">{hint}</span> : null}
      </span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

function WorkStatusHeader({
  status,
  timesheetId,
  payroll = false,
  advanceNetCents = null,
  D,
  W,
}: {
  status: string;
  timesheetId: string;
  payroll?: boolean;
  advanceNetCents?: number | null;
  D: FreelancerDict["detail"];
  W: FreelancerDict["work"];
}) {
  const advLine =
    payroll && advanceNetCents && advanceNetCents > 0
      ? D.advanceLine(moneyExact(advanceNetCents))
      : payroll
        ? D.payrollLine
        : null;

  if (status === "PAID") {
    return (
      <>
        <h2 className="font-display text-xl font-bold text-ink">
          {payroll ? D.paidPayroll : W.paid}
        </h2>
        {payroll && advLine && (
          <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{advLine}</p>
        )}
      </>
    );
  }
  if (status === "APPROVED") {
    return (
      <>
        <h2 className="font-display text-xl font-bold text-ink">{W.approved}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">
          {payroll ? advLine : D.approvedFreelance}
        </p>
      </>
    );
  }
  if (status === "SUBMITTED") {
    return (
      <>
        <h2 className="font-display text-xl font-bold text-ink">{W.submitted}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">
          {payroll ? D.submittedPayroll : D.submittedFreelance}
        </p>
      </>
    );
  }
  if (status === "DISPUTED") {
    return (
      <>
        <h2 className="font-display text-xl font-bold text-warn">{W.disputed}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{D.disputedBody}</p>
      </>
    );
  }
  return (
    <>
      <h2 className="font-display text-xl font-bold text-ink">{D.fillTitle}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{D.fillBody}</p>
      <Link
        href={`/dashboard/uren/${timesheetId}`}
        className="btn-primary mt-3 inline-flex px-4 py-2 text-sm"
      >
        {D.fillButton}
      </Link>
    </>
  );
}
