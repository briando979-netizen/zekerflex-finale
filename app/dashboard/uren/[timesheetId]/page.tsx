import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePrincipal } from "@/lib/auth";
import { TimesheetSubmitForm } from "@/components/app/TimesheetSubmitForm";
import { HoursCorrectionPrompt } from "@/components/app/HoursCorrectionPrompt";
import { CheckInPanel } from "@/components/app/CheckInPanel";
import { getPayoutDestination } from "@/lib/bank/earnings";
import { fastPayAvailable, getFastPay, hasAcceptedTerms } from "@/lib/payouts/fastpay";
import { ShiftCard } from "@/components/app/ShiftCard";
import { getPayoutPrefs } from "@/lib/payouts/preferences";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { SHIFT_SELECT, toShift } from "@/lib/dashboard/my-work";
import { PageHeader, Panel, dateTime, moneyExact } from "@/components/app/ui";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function TimesheetPage(props: { params: Promise<{ timesheetId: string }> }) {
  const params = await props.params;
  const principal = await requirePrincipal();
  const ft = await getFreelancerDict();
  const H = ft.hoursPage;
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: principal.userId },
    select: { id: true, homeLatitude: true, homeLongitude: true },
  });
  if (!profile) notFound();

  const timesheet = await prisma.timesheet.findFirst({
    where: { id: params.timesheetId, freelancerId: profile.id },
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualEnd: true,
      breakMinutes: true,
      billableMinutes: true,
      hourlyRateCents: true,
      assignment: { select: { shiftId: true, shift: { select: SHIFT_SELECT } } },
      branch: { select: { name: true, tenant: { select: { id: true, name: true } } } },
      dispute: { select: { id: true, status: true, raisedById: true, claimedMinutes: true, proposedMinutes: true, reason: true } },
    },
  });
  if (!timesheet) notFound();

  const correctionProposal =
    timesheet.dispute &&
    timesheet.dispute.status === "OPEN" &&
    timesheet.dispute.raisedById &&
    timesheet.dispute.proposedMinutes !== timesheet.dispute.claimedMinutes
      ? timesheet.dispute
      : null;
  const [payoutPrefs, fiscal, destination, fastPaySettings, termsAccepted] = await Promise.all([
    getPayoutPrefs(principal.userId),
    getFiscal(principal.userId),
    getPayoutDestination(principal.userId),
    getFastPay(timesheet.branch.tenant.id),
    hasAcceptedTerms(principal.userId),
  ]);
  const isPayroll = invoiceModeFor(fiscal) === "payroll";

  const home = Number.isFinite(profile.homeLatitude)
    ? { lat: profile.homeLatitude, lng: profile.homeLongitude }
    : null;
  const cardShift = timesheet.assignment?.shift ? toShift(timesheet.assignment.shift, home) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/diensten"
        className="text-sm font-medium text-neutralx-500 hover:text-brand-600"
      >
        {H.back}
      </Link>
      <PageHeader
        eyebrow={H.eyebrow}
        title={H.title}
        subtitle={`${timesheet.branch.name} · ${dateTime(timesheet.scheduledStart)}`}
      />
      {correctionProposal && (
        <div className="mb-6">
          <HoursCorrectionPrompt
            disputeId={correctionProposal.id}
            timesheetId={timesheet.id}
            claimedHours={correctionProposal.claimedMinutes / 60}
            proposedHours={correctionProposal.proposedMinutes / 60}
            reason={correctionProposal.reason}
          />
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {timesheet.status === "DRAFT" && (
            <CheckInPanel
              timesheetId={timesheet.id}
              scheduledStart={timesheet.scheduledStart.toISOString()}
              scheduledEnd={timesheet.scheduledEnd.toISOString()}
              actualStart={timesheet.actualStart?.toISOString() ?? null}
              actualEnd={timesheet.actualEnd?.toISOString() ?? null}
              branchName={timesheet.branch.name}
            />
          )}
          {cardShift && (
            <ShiftCard shift={cardShift} t={ft} href={`/dashboard/klussen/${cardShift.id}`} idReminder footerOverride={null} />
          )}
          <Panel title={H.registration}>
            <dl className="divide-y divide-hair text-sm">
              <Row
                label={H.planned}
                value={`${dateTime(timesheet.scheduledStart)} – ${dateTime(timesheet.scheduledEnd)}`}
              />
              <Row label={H.rate} value={`${moneyExact(timesheet.hourlyRateCents)} ${ft.ts.gross}`} />
              <Row
                label={H.gpsHours}
                value={
                  timesheet.actualStart && timesheet.actualEnd
                    ? `${dateTime(timesheet.actualStart)} – ${dateTime(timesheet.actualEnd)}`
                    : H.notYet
                }
              />
              <Row
                label={H.status}
                value={timesheet.status === "DRAFT" ? H.toSubmit : timesheet.status}
              />
            </dl>
          </Panel>
        </div>
        <TimesheetSubmitForm
          timesheetId={timesheet.id}
          scheduledStart={timesheet.actualStart ?? timesheet.scheduledStart}
          scheduledEnd={timesheet.actualEnd ?? timesheet.scheduledEnd}
          breakMinutes={timesheet.breakMinutes}
          status={timesheet.status}
          clientId={timesheet.branch.tenant.id}
          clientName={timesheet.branch.tenant.name}
          shiftId={timesheet.assignment?.shiftId}
          payoutSpeed={payoutPrefs.speed}
          payroll={isPayroll}
          hourlyRateCents={timesheet.hourlyRateCents}
          gpsBacked={Boolean(timesheet.actualStart && timesheet.actualEnd)}
          earningsToBank={destination === "bank"}
          fastPay={fastPayAvailable(fastPaySettings)}
          termsAccepted={termsAccepted}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3">
      <dt className="text-neutralx-500">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
