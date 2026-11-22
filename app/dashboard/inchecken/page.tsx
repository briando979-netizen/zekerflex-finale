import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/ui";
import { BakenInchecken } from "@/components/app/BakenInchecken";
import { bakenInstellingen, bakenTokenGeldig } from "@/lib/checkin/baken";
import { getFreelancerDict } from "@/lib/i18n/server";
import { incheckenVereist } from "@/lib/checkin/vereist";

export const dynamic = "force-dynamic";

// De pagina achter de QR-code op de werkplek (lib/checkin/baken.ts):
// /dashboard/inchecken?b=<vestiging>&t=<token>. Zoekt het urenbriefje van de
// kracht bij die vestiging rond nu en checkt in (of uit) met de QR als bewijs.
export default async function IncheckenPage(props: { searchParams: Promise<{ b?: string; t?: string }> }) {
  const principal = await requirePrincipal();
  const ft = await getFreelancerDict();
  const { b, t } = await props.searchParams;
  const terug = (
    <p className="mt-4 text-sm">
      <Link href="/dashboard/klussen" className="text-brand-600 hover:underline">
        {ft.nav.myJobs}
      </Link>
    </p>
  );

  const profile = await prisma.freelancerProfile.findUnique({ where: { userId: principal.userId }, select: { id: true } });
  if (!profile || !b || !t) {
    // zonder code (rechtstreeks geopend, uit het menu): uitleg hoe inchecken gaat, geen foutmelding
    return (
      <>
        <PageHeader title={ft.checkin.title} />
        <p className="text-sm text-neutralx-600">{b && t ? ft.checkin.qrWrong : ft.checkin.qrNone}</p>
        {terug}
      </>
    );
  }

  const inst = await bakenInstellingen(b);
  const geldig = inst.qr && bakenTokenGeldig(b, inst.qrVersie, t);
  const now = Date.now();
  // Dit bedrijf vraagt geen inchecken (lib/checkin/vereist.ts): scannen is niet nodig, de werker dient na afloop zijn uren in.
  // Wie al was ingecheckt (een concept met begintijd) kan hier nog uitchecken, dus alleen zonder check-in hier stoppen.
  const vestiging = geldig ? await prisma.branch.findUnique({ where: { id: b }, select: { tenantId: true } }) : null;
  const geenInchecken = vestiging ? !(await incheckenVereist(vestiging.tenantId)) : false;
  // de klus van nu: vanaf een uur voor de start tot zes uur na het einde, net als de knop
  const ts = geldig
    ? await prisma.timesheet.findFirst({
        where: { freelancerId: profile.id, branchId: b, status: "DRAFT", scheduledStart: { lte: new Date(now + 60 * 60_000) }, scheduledEnd: { gte: new Date(now - 6 * 60 * 60_000) } },
        orderBy: { scheduledStart: "asc" },
        select: { id: true, actualStart: true, actualEnd: true, branch: { select: { name: true } }, assignment: { select: { shiftId: true } } },
      })
    : null;

  return (
    <>
      <PageHeader title={ft.checkin.title} />
      {!geldig ? (
        <p className="text-sm text-neutralx-600">{ft.checkin.qrWrong}</p>
      ) : geenInchecken && !ts?.actualStart ? (
        <p role="status" className="text-sm font-semibold text-ink">{ft.checkinPage.geenInchecken}</p>
      ) : !ts ? (
        <p className="text-sm text-neutralx-600">{ft.checkin.noShiftHere}</p>
      ) : ts.actualEnd ? (
        <p className="text-sm text-neutralx-600">{ft.checkin.doneToday}</p>
      ) : (
        <BakenInchecken timesheetId={ts.id} shiftId={ts.assignment.shiftId} token={t} ingecheckt={Boolean(ts.actualStart)} branchName={ts.branch.name} />
      )}
      {terug}
    </>
  );
}
