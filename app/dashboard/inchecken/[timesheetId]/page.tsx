import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePrincipal } from "@/lib/auth";
import { CheckInPanel } from "@/components/app/CheckInPanel";
import { ShiftMap } from "@/components/app/ShiftMap";
import { MessageEmployerButton } from "@/components/app/MessageEmployerButton";
import { PageHeader } from "@/components/app/ui";
import { getFreelancerDict } from "@/lib/i18n/server";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { INCHECK_VOOR_MS, UITCHECK_NA_MS } from "@/lib/timesheets/offline";
import { urenIndienenOpen } from "@/lib/timesheets/indienen";
import { plekVoorWerker } from "@/lib/shifts/place-label";

export const dynamic = "force-dynamic";

// Inchecken op de dag van de klus, een eigen pagina (12 nov, eigenaar): bovenaan de knop, daaronder kort
// waar en wat (adres, tijden, pauze, kleding, functie, opdrachtgever). Uren indienen komt hier pas na
// afloop (lib/timesheets/indienen.ts); tot dan stuurt /dashboard/uren/<id> door naar deze pagina.
// Los van /dashboard/inchecken?b=&t= (de QR-code op de werkplek).
export default async function IncheckKlusPage(props: { params: Promise<{ timesheetId: string }> }) {
  const { timesheetId } = await props.params;
  const principal = await requirePrincipal();
  const ft = await getFreelancerDict();
  const P = ft.checkinPage;
  const profile = await prisma.freelancerProfile.findUnique({ where: { userId: principal.userId }, select: { id: true } });
  if (!profile) notFound();

  const ts = await prisma.timesheet.findFirst({
    where: { id: timesheetId, freelancerId: profile.id },
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualEnd: true,
      branch: { select: { name: true, addressLine: true, postalCode: true, city: true, latitude: true, longitude: true, tenant: { select: { name: true } } } },
      assignment: { select: { shiftId: true, shift: { select: { title: true, breakMinutes: true, dresscode: true, requiredSkill: { select: { name: true } } } } } },
    },
  });
  if (!ts) notFound();

  const nu = Date.now();
  const start = ts.scheduledStart.getTime();
  const end = ts.scheduledEnd.getTime();
  const concept = ts.status === "DRAFT";
  const voorVenster = nu < start - INCHECK_VOOR_MS;
  const naVenster = nu > end + UITCHECK_NA_MS;
  const urenOpen = urenIndienenOpen(ts, nu);
  const shift = ts.assignment.shift;
  const plek = plekVoorWerker(ts.branch.name, ts.branch.tenant.name);
  const dag = new Intl.DateTimeFormat(ft.intl, { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(ts.scheduledStart);
  const tijden = `${amsterdamClock(ts.scheduledStart)} – ${amsterdamClock(ts.scheduledEnd)}`;

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/dashboard/diensten" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        {P.back}
      </Link>
      <PageHeader eyebrow={P.eyebrow} title={P.title} subtitle={`${plek} · ${dag}`} />

      <div className="space-y-4">
        {concept && voorVenster && (
          <p className="card p-5 text-sm text-plan-ink">{P.opensAt(amsterdamClock(start - INCHECK_VOOR_MS))}</p>
        )}
        {concept && naVenster && !ts.actualStart && <p className="card p-5 text-sm text-neutralx-600">{P.closed}</p>}
        {concept && !voorVenster && (
          <CheckInPanel
            userId={principal.userId}
            timesheetId={ts.id}
            scheduledStart={ts.scheduledStart.toISOString()}
            scheduledEnd={ts.scheduledEnd.toISOString()}
            actualStart={ts.actualStart?.toISOString() ?? null}
            actualEnd={ts.actualEnd?.toISOString() ?? null}
            branchName={ts.branch.name}
          />
        )}

        {/* Uren indienen pas na afloop: daarvóór alleen wanneer het kan */}
        {!concept ? (
          <Link href={`/dashboard/uren/${ts.id}`} className="card flex items-center justify-between p-5 text-sm font-semibold text-ok">
            <span>{P.handedIn}</span>
            <span aria-hidden>→</span>
          </Link>
        ) : urenOpen ? (
          <div className="card space-y-3 p-5">
            <p className="text-sm font-semibold text-warn">{P.hoursNow}</p>
            <Link href={`/dashboard/uren/${ts.id}`} className="btn-primary block w-full py-3 text-center text-base">
              {P.hoursBtn}
            </Link>
          </div>
        ) : (
          <p className="px-1 text-xs text-neutralx-500">{P.hoursLater(amsterdamClock(ts.scheduledEnd))}</p>
        )}

        {/* Kort: waar en wat. De rest (route, reistijd, omschrijving) staat op de kluspagina. */}
        <section className="card overflow-hidden">
          <ShiftMap lat={ts.branch.latitude} lng={ts.branch.longitude} height={140} label={`${ts.branch.addressLine}, ${ts.branch.city}`} />
          <dl className="divide-y divide-hair text-sm">
            <Rij label={P.where}>
              <span className="block font-semibold">{plek}</span>
              <span className="block">{ts.branch.addressLine}</span>
              <span className="block">
                {ts.branch.postalCode} {ts.branch.city}
              </span>
            </Rij>
            <Rij label={P.when}>
              <span className="block first-letter:uppercase">{dag}</span>
              <span className="num block">{tijden}</span>
            </Rij>
            <Rij label={P.breakLabel}>{shift.breakMinutes > 0 ? P.breakMin(shift.breakMinutes) : P.noBreak}</Rij>
            <Rij label={P.dress}>{shift.dresscode?.trim() || P.noDress}</Rij>
            <Rij label={P.role}>{shift.requiredSkill?.name ?? shift.title}</Rij>
            <Rij label={P.client}>{ts.branch.tenant.name}</Rij>
          </dl>
          <div className="space-y-2 border-t border-hair p-4">
            <MessageEmployerButton shiftId={ts.assignment.shiftId} label={P.message} />
            <Link href={`/dashboard/klussen/${ts.assignment.shiftId}`} className="block text-center text-sm font-medium text-brand-600 hover:underline">
              {P.details} →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Rij({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3">
      <dt className="flex-shrink-0 text-neutralx-500">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  );
}
