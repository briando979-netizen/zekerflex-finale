import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getPayslip } from "@/lib/payroll/store";
import { SimplePdf } from "@/lib/pdf/simple";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const euro = (c: number) => `EUR ${(c / 100).toFixed(2).replace(".", ",")}`;

// GET /api/me/payroll/:isoWeek/pdf — your weekly loonstrook / factuuroverzicht as PDF.
export async function GET(
  _req: Request,
  { params }: { params: { isoWeek: string } },
): Promise<Response> {
  try {
    const p = await requirePrincipal();
    const slip = await getPayslip(p.userId, params.isoWeek);
    if (!slip) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Geen strook voor deze week" } }, { status: 404 });

    const b = slip.computed.breakdown;
    const pdf = new SimplePdf();
    pdf.heading(b.kind === "payroll" ? "Loonstrook" : "Weekoverzicht", 20);
    pdf.line(`${slip.weekLabel} · ${slip.workerName}`, 11, { color: [0.05, 0.36, 0.29] });
    pdf.gap(8);
    pdf.rule();

    pdf.row("Werkvorm", slip.workerKind ?? "—");
    pdf.row("Gewerkte uren", slip.computed.totalHours.toFixed(2).replace(".", ","));
    pdf.row("Gewerkte weken (cumulatief)", String(slip.weeksWorked));
    pdf.gap(6);
    pdf.rule();

    if (b.kind === "payroll") {
      pdf.row("Brutoloon", euro(b.grossCents));
      pdf.row("Vakantiegeld (8,33%)", euro(b.holidayAllowanceCents));
      pdf.row("Reservering vakantie-uren", euro(b.holidayHoursReserveCents));
      pdf.row("Reservering kort verzuim", euro(b.shortLeaveReserveCents));
      pdf.row(`Pensioen (StiPP ${b.pensionRegeling}) — jouw deel`, `- ${euro(b.pensionEmployeeCents)}`);
      pdf.row("Belastbaar loon", euro(b.taxableCents));
      pdf.row("Loonheffing (indicatief)", `- ${euro(b.wageTaxIndicativeCents)}`);
      pdf.gap(4);
      pdf.rule();
      pdf.row("Netto (indicatief)", euro(b.netIndicativeCents), { bold: true, size: 12 });
      pdf.gap(10);
      pdf.line(`ABU-fase: ${b.phase}. Werkgeversdeel pensioen: ${euro(b.pensionEmployerCents)} (niet ingehouden).`, 9);
    } else {
      pdf.row("Diensten", euro(b.servicesCents));
      pdf.row(b.vatRate > 0 ? `Btw (${Math.round(b.vatRate * 100)}%)` : "Btw", euro(b.vatCents));
      pdf.row("Factuurtotaal", euro(b.invoiceTotalCents));
      pdf.gap(4);
      pdf.rule();
      pdf.row("Uit te betalen aan jou", euro(b.payoutToWorkerCents), { bold: true, size: 12 });
      pdf.gap(10);
      pdf.line(
        `Platformkosten ${euro(b.platformFeeCents)} worden apart aan de opdrachtgever gefactureerd — niet ingehouden op jouw bedrag.`,
        9,
      );
    }

    pdf.gap(16);
    pdf.line("Automatisch opgesteld door ZekerFlex. Indicatief — geen vervanging voor je jaaropgave.", 8.5, {
      color: [0.4, 0.45, 0.42],
    });

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
