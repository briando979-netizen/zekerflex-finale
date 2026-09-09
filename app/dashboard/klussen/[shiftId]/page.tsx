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
import { SaveShiftHeart } from "@/components/app/SaveShiftHeart";
import { ShiftMenu } from "@/components/app/ShiftMenu";
import { MessageEmployerButton } from "@/components/app/MessageEmployerButton";
import { ShiftMap } from "@/components/app/ShiftMap";
import { ReageerButton } from "@/components/app/ReageerModal";
import { shiftCategory } from "@/lib/shifts/category";
import { MODE_ORDER, formatMinutes } from "@/lib/geo/travel-modes";
import { money, moneyExact } from "@/components/app/ui";
import { localStamp, type CalendarEvent } from "@/lib/calendar/links";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { listAdvances } from "@/lib/payouts/advances";
import { gearForShift } from "@/lib/shop/klus-gear";
import { certsRequiredForShift } from "@/lib/certificates/matching";
import { validCertTypes, CERT_TYPES } from "@/lib/certificates/store";

export const dynamic = "force-dynamic";

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const hhmm = (d: Date | string) => {
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
};
const MODE_EMOJI: Record<string, string> = { driving: "🚗", transit: "🚆", walking: "🚶", bicycling: "🚲" };

const INFO_CHIPS = [
  "✌️ ZZP bij de opdrachtgever",
  "🍃 Uitbetaling per klus",
  "📋 Belasting: zelf",
  "💰 Tegenbod mogelijk",
  "🏖️ Vakantiegeld: nee",
];

export default async function ShiftDetailPage(props: { params: Promise<{ shiftId: string }> }) {
  const params = await props.params;
  const principal = await requirePrincipal();
  const s = await getShiftDetail(principal.userId, params.shiftId);
  if (!s) notFound();

  const start = new Date(s.startsAt);
  const upcoming = start.getTime() > Date.now();
  const shiftEnded = new Date(s.endsAt).getTime() < Date.now();
  const cat = shiftCategory(s.title, s.skill);

  const [offers, orgReviews, orgExtra, otherShifts, fiscal] = await Promise.all([
    listCounterOffers(500),
    reviewSummary("company", s.clientTenantId),
    getOrgProfileExtra(s.clientTenantId),
    prisma.shift.findMany({
      where: {
        branch: { tenantId: s.clientTenantId },
        status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
        startsAt: { gte: new Date() },
        id: { not: s.id },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        hourlyRateCents: true,
        breakMinutes: true,
        requiredSkill: { select: { name: true } },
        branch: { select: { name: true, city: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
    getFiscal(principal.userId),
  ]);
  const isPayroll = invoiceModeFor(fiscal) === "payroll";
  const reactionCount = offers.filter((o) => o.shiftId === s.id && o.status === "pending").length;

  // "Dit heb je nodig voor deze klus" — werkgear uit de webshop, op werktype.
  const gearHints = gearForShift(s.title, s.skill);
  const gearProducts = gearHints.length
    ? await prisma.shopProduct.findMany({
        where: { slug: { in: gearHints.map((g) => g.slug) }, active: true },
        select: { id: true, slug: true, name: true, priceCents: true, imageUrl: true },
      })
    : [];
  const gear = gearHints
    .map((h) => {
      const product = gearProducts.find((p) => p.slug === h.slug);
      return product ? { product, reason: h.reason, required: h.required ?? false } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Certificaten die deze klus vraagt + wat de freelancer heeft.
  const certReqs = certsRequiredForShift(s.title, s.skill);
  const heldCerts = certReqs.length ? await validCertTypes(principal.userId) : new Set<string>();
  const certList = certReqs.map((c) => ({
    ...c,
    label: CERT_TYPES[c.type].label,
    shopSlug: CERT_TYPES[c.type].shopSlug ?? null,
    have: heldCerts.has(c.type),
  }));
  const missingRequiredCert = certList.find((c) => c.required && !c.have) ?? null;
  const applyDisabled = !s.canApply || Boolean(missingRequiredCert);
  const applyBlockReason = !s.canApply
    ? s.blockReason
    : missingRequiredCert
      ? `Voor deze klus is een geldig ${missingRequiredCert.label} nodig. Voeg het toe bij Certificaten.`
      : null;

  // Cancellation deadline: 24h before the shift starts.
  const cancelDeadline = new Date(start.getTime() - 24 * 3_600_000);
  const cancelPassed = cancelDeadline.getTime() < Date.now();
  const fmtDay = (d: Date) => `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}. ${hhmm(d)}`;

  // Does the freelancer already have a klus that overlaps this time window?
  const myProfile = await prisma.freelancerProfile.findUnique({
    where: { userId: principal.userId },
    select: { id: true },
  });
  const conflict = myProfile
    ? (await prisma.shiftAssignment.count({
        where: {
          freelancerId: myProfile.id,
          cancelledAt: null,
          shiftId: { not: s.id },
          shift: { startsAt: { lt: s.endsAt }, endsAt: { gt: s.startsAt } },
        },
      })) > 0
    : false;
  const agreementHref = s.agreement ? `/api/model-agreements/${s.agreement.id}/pdf` : null;

  let assigned: {
    assignmentId: string;
    confirmedAt: string | null;
    replacementRequestId: string | null;
    replacementResponseCount: number;
    replacementRequested: boolean;
  } | null = null;
  if (s.alreadyApplied && upcoming) {
    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    const row = profile
      ? await prisma.shiftAssignment.findFirst({
          where: { shiftId: s.id, freelancerId: profile.id, cancelledAt: null },
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
      ? (await listAdvances(principal.userId)).find(
          (a) => a.kind === "payroll" && a.timesheetId === ts.id,
        ) ?? null
      : null;
  const showWorkStatus = Boolean(ts && !worked?.cancelledAt && (shiftEnded || ts.status !== "DRAFT"));
  const showWorkedFigures = Boolean(
    ts && ["SUBMITTED", "APPROVED", "PAID", "DISPUTED"].includes(ts.status),
  );

  const dateLabel = `${WD[start.getDay()]} ${start.getDate()} ${MON[start.getMonth()]}.`;
  const timeLabel = `${hhmm(s.startsAt)} - ${hhmm(s.endsAt)}`;

  const calendarEvent: CalendarEvent = {
    title: `${s.title} — ${s.branch}`,
    startLocal: localStamp(s.startsAt),
    endLocal: localStamp(s.endsAt),
    location: [s.branch, s.address, `${s.postalCode ?? ""} ${s.city}`.trim()].filter(Boolean).join(", "),
    description:
      `Je klus via ZekerFlex bij ${s.branch}.\n` +
      `Uurtarief ${moneyExact(s.hourlyRateCents)}.\n` +
      (s.skill ? `Functie: ${s.skill}\n` : "") +
      (s.breakMinutes > 0 ? `Pauze: ${s.breakMinutes} minuten\n` : "Geen pauze\n") +
      `Adres: ${s.address}, ${s.postalCode ?? ""} ${s.city}\n\n` +
      `Bevestig je komst in de app en check op tijd in op locatie.`,
  };

  return (
    <div className="pb-40">
      {/* Hero */}
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cat.photo} alt="" className="h-52 w-full object-cover sm:h-64" />
        <span className="absolute inset-0 bg-gradient-to-b from-ink/40 to-transparent" />
        <Link
          href="/dashboard/klussen"
          aria-label="Terug"
          className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur"
        >
          ←
        </Link>
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <SaveShiftHeart shiftId={s.id} />
          <ShiftMenu employerName={s.branch} shiftTitle={s.title} />
        </div>
      </div>

      {assigned && (
        <div className="mx-auto max-w-2xl border-b border-hair px-4 py-5">
          {!assigned.replacementRequested && (
            <>
              <h2 className="font-display text-xl font-bold text-ink">Dit is jouw klus! 🎉</h2>
              {cancelPassed ? (
                <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">
                  Let op: de annuleringstermijn van deze klus is verlopen — je kunt de klus niet meer annuleren zonder
                  consequenties.
                </p>
              ) : (
                <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">
                  Je kunt kosteloos annuleren tot {fmtDay(cancelDeadline)}.
                </p>
              )}
              <p className="mt-3 text-sm font-semibold text-ink">Vergeet niet je ID-kaart mee te nemen naar de klus!</p>
            </>
          )}
          <div className={assigned.replacementRequested ? "" : "mt-4"}>
            <ShiftActions
              assignmentId={assigned.assignmentId}
              shiftId={s.id}
              shiftTitle={s.title}
              startsAtISO={start.toISOString()}
              confirmedAt={assigned.confirmedAt}
              replacementRequested={assigned.replacementRequested}
              replacementRequestId={assigned.replacementRequestId}
              replacementResponseCount={assigned.replacementResponseCount}
              heroPhoto={cat.photo}
              calendar={calendarEvent}
              variant="detail"
            />
          </div>
        </div>
      )}

      {!assigned && showWorkStatus && ts && (
        <div className="mx-auto max-w-2xl border-b border-hair px-4 py-5">
          <WorkStatusHeader
            status={ts.status}
            timesheetId={ts.id}
            payroll={isPayroll}
            advanceNetCents={payrollAdvance?.netCents ?? null}
          />
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 py-5">
        <p className="text-sm font-semibold text-brand-600">{s.branch}</p>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink">{s.title}</h1>

        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-neutralx-500">
          <span>{dateLabel}</span>
          <span className="text-hairstrong">|</span>
          <span>{timeLabel}</span>
          <span className="text-hairstrong">|</span>
          <span>{s.city}</span>
        </p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="rounded border border-brand-500/40 px-2 py-0.5 text-xs font-semibold text-brand-600">
            Freelance
          </span>
          <span className="num font-display text-xl font-bold text-ink">{moneyExact(s.hourlyRateCents)}</span>
        </div>

        {/* Info chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {INFO_CHIPS.map((c) => (
            <span key={c} className="rounded-lg border border-hair bg-white px-2.5 py-1.5 text-xs text-neutralx-600">
              {c}
            </span>
          ))}
        </div>

        {/* Map */}
        <div className="mt-5">
          <ShiftMap lat={s.branchLat} lng={s.branchLng} height={180} label={`${s.address}, ${s.city}`} />
        </div>

        {/* Travel */}
        {s.travel && (
          <details className="mt-3 rounded-xl border border-hair bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <span className="flex items-center gap-3 text-lg">
                {MODE_ORDER.map((m) => (
                  <span key={m} className={m === s.travel!.fastest.mode ? "" : "opacity-40"} title={s.travel!.byMode[m].label}>
                    {MODE_EMOJI[m]}
                  </span>
                ))}
              </span>
              <span className="text-sm font-semibold text-ink underline decoration-crit/50 decoration-2 underline-offset-4">
                Bekijk reistijden ▾
              </span>
            </summary>
            <ul className="divide-y divide-hair border-t border-hair">
              {MODE_ORDER.map((m) => {
                const e = s.travel!.byMode[m];
                const fast = m === s.travel!.fastest.mode;
                return (
                  <li key={m} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className={fast ? "font-semibold text-brand-700" : "text-neutralx-600"}>{e.label}</span>
                    <span className="num text-neutralx-500">
                      {formatMinutes(e.minutes)} · {e.distanceKm} km
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {/* Detail rows */}
        <dl className="mt-4 space-y-3.5">
          <InfoRow icon="◎">
            {s.address}
            <br />
            {s.postalCode} {s.city}
          </InfoRow>
          <InfoRow icon="☕">
            {s.breakMinutes > 0 ? `${s.breakMinutes} minuten pauze` : "Je krijgt geen pauze"}
          </InfoRow>
          {s.skill && <InfoRow icon="🏷️">{s.skill}</InfoRow>}
          <InfoRow icon="👤">
            We zoeken {s.positions} freelancer{s.positions === 1 ? "" : "s"}
          </InfoRow>
          <InfoRow icon="👕">Er zijn kledingvoorschriften van toepassing</InfoRow>
          <InfoRow icon="⊘">
            {cancelPassed
              ? `De annuleringstermijn is verstreken op: ${fmtDay(cancelDeadline)}`
              : `Je kunt annuleren tot: ${fmtDay(cancelDeadline)}`}
          </InfoRow>
          {(s.agreement || s.alreadyApplied) && (
            <div className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border border-hairstrong text-xs text-neutralx-400">
                📄
              </span>
              {s.agreement ? (
                <a
                  href={`/api/model-agreements/${s.agreement.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink underline"
                >
                  Je modelovereenkomst
                </a>
              ) : (
                <span className="text-neutralx-600">
                  Zodra je wordt uitgekozen krijg je automatisch je modelovereenkomst
                </span>
              )}
            </div>
          )}
        </dl>

        {showWorkedFigures && ts && (
          <div className="mt-5 divide-y divide-hair overflow-hidden rounded-xl border border-hair">
            <SummaryRow label="Gewerkte uren" value={fmtWorked(ts.billableMinutes)} />
            <SummaryRow label="Betaling" hint="(excl. btw)" value={moneyExact(tsGrossCents)} />
            <SummaryRow
              label={isPayroll ? "Verloning" : "Betalingstermijn"}
              value={
                isPayroll
                  ? "Via loonstrook (payroll)"
                  : ts.status === "PAID"
                    ? payoutDays === null
                      ? "Uitbetaald"
                      : payoutDays === 0
                        ? "Zelfde dag betaald"
                        : `${payoutDays} ${payoutDays === 1 ? "dag" : "dagen"}`
                    : ts.status === "APPROVED"
                      ? "Wordt nu uitbetaald"
                      : "Na goedkeuring van je uren"
              }
            />
          </div>
        )}

        <p className="mt-5 text-sm font-semibold text-ink">
          💼 Functie: <span className="font-normal text-neutralx-600">{s.skill ?? cat.label}</span>
        </p>

        {s.description && (
          <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-neutralx-700">{s.description}</div>
        )}

        {(gear.length > 0 || certList.length > 0) && (
          <section className="mt-8 border-t border-hair pt-5">
            <h2 className="font-display text-base font-bold text-ink">Dit heb je nodig voor deze klus</h2>
            <p className="mt-1 text-xs text-neutralx-500">
              Automatisch bepaald op basis van het type klus. Certificaten voeg je toe bij je account;
              werkkleding bestel je klein in de shop.
            </p>

            {certList.length > 0 && (
              <div className="mt-4 space-y-2">
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
                        {c.required ? " — verplicht" : " — aanbevolen"}
                      </p>
                      <p className="text-xs text-neutralx-500">
                        {c.have ? "Je hebt dit certificaat — komt goed." : c.reason}
                      </p>
                      {!c.have && (
                        <p className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
                          <Link href="/dashboard/certificaten" className="text-brand-600 underline">
                            Certificaat toevoegen
                          </Link>
                          {c.shopSlug && (
                            <Link href={`/shop#${c.shopSlug}`} className="text-brand-600 underline">
                              Lesboek in de shop
                            </Link>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {gear.length > 0 && (
            <div className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
              {gear.map((g) => (
                <Link
                  key={g.product.id}
                  href={`/shop#${g.product.slug}`}
                  className="w-56 flex-shrink-0 snap-start overflow-hidden rounded-2xl border border-hair bg-white shadow-card"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.product.imageUrl ?? cat.photo} alt="" className="h-24 w-full object-cover" />
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{g.product.name}</p>
                      {g.required && (
                        <span className="flex-shrink-0 rounded border border-crit/30 px-1 py-0.5 text-[10px] font-semibold text-crit">
                          Verplicht
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-neutralx-500">{g.reason}</p>
                    <p className="mt-1.5 text-sm font-bold text-ink">{moneyExact(g.product.priceCents)}</p>
                  </div>
                </Link>
              ))}
            </div>
            )}
          </section>
        )}

        {/* Over de opdrachtgever */}
        <section className="mt-8 border-t border-hair pt-5">
          <h2 className="font-display text-base font-bold text-ink">Over {s.branch}</h2>
          {orgReviews.count > 0 && (
            <p className="mt-1.5 flex items-center gap-2 text-sm">
              <span className="text-amber-500">
                {"★★★★★".slice(0, Math.round(orgReviews.average))}
                <span className="text-neutralx-300">{"★★★★★".slice(Math.round(orgReviews.average))}</span>
              </span>
              <span className="text-neutralx-500">
                {orgReviews.count} beoordeling{orgReviews.count === 1 ? "" : "en"}
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
              🌐 Bekijk de website van {s.branch}
            </a>
          )}

          <div className="mt-4 divide-y divide-hair rounded-xl bg-paper-soft">
            <StatRow icon="🕐">Reageert of kiest doorgaans binnen enkele dagen.</StatRow>
            <StatRow icon="🙂">Kiest uit alle reacties de kracht die het beste past.</StatRow>
            <StatRow icon="🐖">Betaalt na goedkeuring van je uren — jij kiest je uitbetaalsnelheid.</StatRow>
          </div>

          <Link
            href={`/dashboard/klussen?employer=${encodeURIComponent(s.branch)}`}
            className="mt-4 block rounded-xl border border-hairstrong px-4 py-3 text-center text-sm font-semibold text-ink hover:bg-paper-soft"
          >
            Alle klussen van {s.branch}
          </Link>
        </section>

        {otherShifts.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-display text-base font-bold text-ink">
              Misschien zijn deze klussen ook iets voor jou
            </h2>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
              {otherShifts.map((o) => {
                const oc = shiftCategory(o.title, o.requiredSkill?.name ?? null);
                const od = new Date(o.startsAt);
                const oh =
                  Math.round(
                    ((new Date(o.endsAt).getTime() - od.getTime()) / 3_600_000 - o.breakMinutes / 60) * 10,
                  ) / 10;
                return (
                  <Link
                    key={o.id}
                    href={`/dashboard/klussen/${o.id}`}
                    className="w-64 flex-shrink-0 snap-start overflow-hidden rounded-2xl border border-hair bg-white shadow-card"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={oc.photo} alt="" className="h-28 w-full object-cover" />
                    <div className="p-3">
                      <p className="text-xs font-semibold text-brand-600">{o.branch.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-ink">{o.title}</p>
                      <p className="mt-1 text-[11px] text-neutralx-400">
                        {WD[od.getDay()]} {od.getDate()} {MON[od.getMonth()]}. · {hhmm(o.startsAt)} · {o.branch.city}
                      </p>
                      <p className="mt-1.5 text-sm font-bold text-ink">
                        {moneyExact(o.hourlyRateCents)} <span className="text-[11px] font-normal text-neutralx-400">· {oh} u</span>
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-6 rounded-xl bg-paper-soft p-4 text-xs leading-relaxed text-neutralx-500">
          Zodra je wordt uitgekozen maakt ZekerFlex automatisch een Wet DBA-proof modelovereenkomst aan. Na
          goedkeuring van je uren kies je zelf hoe snel je wordt uitbetaald. Kun je onverhoopt niet? Regel op tijd
          een vervanger via Mijn klussen — last-minute afzeggen telt mee in je betrouwbaarheidsscore.
        </div>

        <div className="mt-4">
          <MessageEmployerButton shiftId={s.id} />
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-white/95 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-4 py-3">
          {assigned || s.alreadyApplied ? (
            <div>
              <p className="text-xs font-semibold text-brand-600">{s.branch}</p>
              <p className="line-clamp-1 text-sm font-bold text-ink">{s.title}</p>
              <div className="mt-2">
                <MessageEmployerButton shiftId={s.id} />
              </div>
              <p className="mt-1.5 text-center text-xs text-neutralx-400">Voor vragen over deze klus</p>
            </div>
          ) : s.myOffer && s.myOffer.status !== "withdrawn" ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="num font-display text-lg font-bold text-ink">{moneyExact(s.hourlyRateCents)}</p>
                <p className="text-[11px] text-neutralx-400">Verdien ~ {money(s.grossCents)}</p>
              </div>
              <span className="pill-warn">
                Reactie verstuurd ·{" "}
                {s.myOffer.status === "accepted" ? "geaccepteerd" : s.myOffer.status === "declined" ? "afgewezen" : "in afwachting"}
              </span>
            </div>
          ) : s.isReplacement && upcoming ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="num font-display text-lg font-bold text-ink">{moneyExact(s.hourlyRateCents)}</p>
                <p className="text-[11px] text-neutralx-400">Verdien ~ {money(s.grossCents)}</p>
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
                <p className="text-[11px] text-neutralx-400">Verdien ~ {money(s.grossCents)}</p>
              </div>
              <ReageerButton
                shiftId={s.id}
                listedRateCents={s.hourlyRateCents}
                clientName={s.clientName || s.branch}
                startTime={hhmm(s.startsAt)}
                endTime={hhmm(s.endsAt)}
                conflict={conflict}
                agreementHref={agreementHref}
                disabled={applyDisabled}
                notReadyReason={applyBlockReason}
                full
              />
            </div>
          )}
          <p className="mt-2 text-center text-xs text-neutralx-400">
            Er {reactionCount === 1 ? "is" : "zijn"} {reactionCount} reactie{reactionCount === 1 ? "" : "s"} op deze klus
          </p>
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

function StatRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 text-sm text-neutralx-600">
      <span className="text-base leading-none">{icon}</span>
      <span>{children}</span>
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

/** minutes → "1 min" / "6 uur" / "7 uur 30 min" */
function fmtWorked(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} uur`;
  return `${h} uur ${m} min`;
}

function WorkStatusHeader({
  status,
  timesheetId,
  payroll = false,
  advanceNetCents = null,
}: {
  status: string;
  timesheetId: string;
  payroll?: boolean;
  advanceNetCents?: number | null;
}) {
  const advLine =
    payroll && advanceNetCents && advanceNetCents > 0
      ? `Je voorschot van ${moneyExact(advanceNetCents)} staat op je rekening. De rest volgt op je loonstrook.`
      : payroll
        ? "Ze worden verloond via de payroll en komen op je eerstvolgende loonstrook."
        : null;

  if (status === "PAID") {
    return (
      <>
        <h2 className="font-display text-xl font-bold text-ink">
          {payroll ? "Je uren zijn verloond 💸" : "Je bent betaald 💸"}
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
        <h2 className="font-display text-xl font-bold text-ink">Je uren zijn goedgekeurd 🕊️</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">
          {payroll ? advLine : "Je krijgt betaald binnen 1 minuut."}
        </p>
      </>
    );
  }
  if (status === "SUBMITTED") {
    return (
      <>
        <h2 className="font-display text-xl font-bold text-ink">Je uren zijn ingediend ✅</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">
          {payroll
            ? "De opdrachtgever controleert je uren. Daarna worden ze verloond via de payroll."
            : "De opdrachtgever controleert je uren. Zodra ze zijn goedgekeurd word je uitbetaald."}
        </p>
      </>
    );
  }
  if (status === "DISPUTED") {
    return (
      <>
        <h2 className="font-display text-xl font-bold text-warn">Je uren zijn in dispuut</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">
          Er loopt een controle op je ingevulde uren. Je hoort snel meer.
        </p>
      </>
    );
  }
  return (
    <>
      <h2 className="font-display text-xl font-bold text-ink">Vul je gewerkte uren in</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">
        Deze klus is afgelopen. Vul je uren in zodat de opdrachtgever ze kan goedkeuren.
      </p>
      <Link
        href={`/dashboard/uren/${timesheetId}`}
        className="btn-primary mt-3 inline-flex px-4 py-2 text-sm"
      >
        Uren invullen
      </Link>
    </>
  );
}

