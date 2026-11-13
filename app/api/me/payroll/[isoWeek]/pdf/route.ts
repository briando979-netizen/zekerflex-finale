import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getPayslip } from "@/lib/payroll/store";
import { getFiscal } from "@/lib/fiscal/store";
import { ageOn, minimumHourlyCents } from "@/lib/payroll/cao";
import { isoWeekRange, parseIsoWeekId } from "@/lib/payroll/week";
import { loonstrookRegels, tekenRegels, werknemerNummer } from "@/lib/payroll/loonstrook-pdf";
import { werkgeverVoorLoonstrook } from "@/lib/platform/werkgever";
import { SimplePdf } from "@/lib/pdf/simple";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/payroll/:isoWeek/pdf — your weekly loonstrook / factuuroverzicht as PDF.
// Alleen je EIGEN strook: alles wordt opgezocht met de userId van de ingelogde gebruiker; een week zonder eigen strook
// geeft 404 (ook als een ander er wel een heeft), nooit een 403 (CrowdSec). Het werkgeversblok is op elke strook gelijk
// (lib/platform/werkgever.ts); het werknemersblok komt alleen uit het eigen account en de eigen fiscale gegevens.
export async function GET(_req: Request, props: { params: Promise<{ isoWeek: string }> }): Promise<Response> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const slip = await getPayslip(p.userId, params.isoWeek);
    if (!slip) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Geen strook voor deze week" } }, { status: 404 });

    const [fiscal, profiel] = await Promise.all([
      getFiscal(p.userId),
      prisma.freelancerProfile.findUnique({ where: { userId: p.userId }, select: { homePostalCode: true } }),
    ]);
    // het minimumloon dat in deze week gold, voor de leeftijd van de werknemer op de maandag
    const week = parseIsoWeekId(slip.isoWeek);
    const op = week ? isoWeekRange(week).start : new Date(slip.generatedAt);
    const regels = loonstrookRegels(
      slip,
      werkgeverVoorLoonstrook(),
      { naam: slip.workerName, nummer: werknemerNummer(p.userId), bsnLaatste4: fiscal.bsnLast4, postcode: profiel?.homePostalCode || null },
      { loonheffingskorting: fiscal.loonheffingskorting, loonheffingskortingGekozen: fiscal.loonheffingskortingGekozen === true, minimumloonPerUurCents: minimumHourlyCents(ageOn(fiscal.birthDate, op), op) },
    );
    const pdf = tekenRegels(new SimplePdf(), regels);

    return new Response(new Uint8Array(pdf.toBuffer()), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="loonstrook-${slip.isoWeek}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
