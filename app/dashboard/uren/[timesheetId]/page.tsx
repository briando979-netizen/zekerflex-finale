import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePrincipal } from "@/lib/auth";
import { TimesheetSubmitForm } from "@/components/app/TimesheetSubmitForm";
import { ShiftCard } from "@/components/app/ShiftCard";
import { getPayoutPrefs } from "@/lib/payouts/preferences";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { SHIFT_SELECT, toShift } from "@/lib/dashboard/my-work";
import { PageHeader, Panel, dateTime, moneyExact } from "@/components/app/ui";

export const dynamic = "force-dynamic";

export default async function TimesheetPage(props: { params: Promise<{ timesheetId: string }> }) {
  const params = await props.params;
  const principal = await requirePrincipal();
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
    },
  });
  if (!timesheet) notFound();
  const [payoutPrefs, fiscal] = await Promise.all([
    getPayoutPrefs(principal.userId),
    getFiscal(principal.userId),
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
        ← Terug naar mijn diensten
      </Link>
      <PageHeader
        eyebrow="Afronden"
        title="Uren invullen"
        subtitle={`${timesheet.branch.name} · ${dateTime(timesheet.scheduledStart)}`}
      />
      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {cardShift && (
            <ShiftCard shift={cardShift} href={`/dashboard/klussen/${cardShift.id}`} idReminder footerOverride={null} />
          )}
          <Panel title="Jouw registratie">
            <dl className="divide-y divide-hair text-sm">
              <Row
                label="Gepland"
                value={`${dateTime(timesheet.scheduledStart)} – ${dateTime(timesheet.scheduledEnd)}`}
              />
              <Row label="Uurtarief" value={`${moneyExact(timesheet.hourlyRateCents)} bruto`} />
              <Row
                label="GPS-uren"
                value={
                  timesheet.actualStart && timesheet.actualEnd
                    ? `${dateTime(timesheet.actualStart)} – ${dateTime(timesheet.actualEnd)}`
                    : "Nog niet geregistreerd"
                }
              />
              <Row
                label="Status"
                value={timesheet.status === "DRAFT" ? "Nog in te dienen" : timesheet.status}
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
