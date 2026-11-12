import { euro } from "@/lib/payroll/format";
import { vulIn } from "@/lib/i18n/vul-in";
import type { PayslipRecord } from "@/lib/payroll/store";
import { LOONSTROOK_NL, type LoonstrookTeksten } from "@/lib/payroll/loonstrook-teksten";

// ---------------------------------------------------------------------------
// Loonstrook-uitleg in gewone taal: waarom is je loon precies dit? Puur
// afgeleid van de al berekende breakdown — geen AI, geen extra data.
// De zinnen komen uit LoonstrookTeksten (lib/payroll/loonstrook-teksten.ts): zonder teksten Nederlands, het werkersscherm
// geeft de taal van de werker mee. Bedragen en getallen volgen die taal (t.intl).
// ---------------------------------------------------------------------------

/** Het label bij het hoofdbedrag van een loonstrook ("netto (indicatief)", "uit te betalen"), in de taal van de werker. */
export function loonstrookKop(p: PayslipRecord, t: LoonstrookTeksten = LOONSTROOK_NL): string {
  const b = p.computed.breakdown;
  if (b.kind === "payroll") return t.headline.netto;
  return b.vatRate > 0 ? t.headline.inclBtw : t.headline.uitTeBetalen;
}

export function explainPayslip(p: PayslipRecord, t: LoonstrookTeksten = LOONSTROOK_NL): string[] {
  const x = t.uitleg;
  const eur = (cents: number) => euro(cents, t.intl);
  const getal = (n: number) => n.toLocaleString(t.intl);
  const b = p.computed.breakdown;
  const lines: string[] = [];
  const uren = getal(p.computed.totalHours);
  const clients = [...new Set(p.computed.lines.map((l) => l.clientName))];
  const bij = clients.length === 1 ? vulIn(x.bijEen, { naam: clients[0] ?? "" }) : vulIn(x.bijMeer, { n: clients.length });

  if (b.kind === "invoice") {
    lines.push(vulIn(x.werkte, { uren, bij }));
    lines.push(
      b.vatRate > 0
        ? vulIn(x.dienstMetBtw, { bedrag: eur(b.servicesCents), pct: Math.round(b.vatRate * 100), btw: eur(b.vatCents), totaal: eur(b.invoiceTotalCents) })
        : vulIn(x.dienstZonderBtw, { bedrag: eur(b.servicesCents) }),
    );
    lines.push(vulIn(x.platform, { bedrag: eur(b.platformFeeCents) }));
    lines.push(vulIn(x.ontvang, { bedrag: eur(b.payoutToWorkerCents) }));
    return lines;
  }

  // payroll
  lines.push(vulIn(x.werkteFase, { uren, bij, fase: b.phase, weken: p.weeksWorked }));

  if (b.cao) {
    if (b.cao.wmlFloorApplied) {
      lines.push(vulIn(x.wml, { bedrag: eur(b.cao.baseCents) }));
    } else {
      lines.push(vulIn(x.basis, { cao: b.cao.caoLabel, bedrag: eur(b.cao.baseCents) }));
    }
    if (b.cao.nachtCents > 0) lines.push(vulIn(x.nacht, { uren: getal(b.cao.nachtHours), bedrag: eur(b.cao.nachtCents) }));
    if (b.cao.weekendCents > 0) lines.push(vulIn(x.weekend, { uren: getal(b.cao.weekendHours), bedrag: eur(b.cao.weekendCents) }));
    if (b.cao.feestdagCents > 0) lines.push(vulIn(x.feestdag, { uren: getal(b.cao.feestdagHours), bedrag: eur(b.cao.feestdagCents) }));
    if (b.cao.overwerkCents > 0) lines.push(vulIn(x.overwerk, { bedrag: eur(b.cao.overwerkCents) }));
  }

  lines.push(vulIn(x.bruto, { bedrag: eur(b.grossCents) }));
  lines.push(vulIn(x.reserve, { vg: eur(b.holidayAllowanceCents), vu: eur(b.holidayHoursReserveCents), kv: eur(b.shortLeaveReserveCents) }));

  if (b.pensionRegeling === "geen") {
    lines.push(x.pensGeen);
  } else {
    lines.push(
      vulIn(x.pens, {
        regeling: x.regelingZin[b.pensionRegeling],
        werkgever: eur(b.pensionEmployerCents),
        deel: b.pensionEmployeeCents > 0 ? vulIn(x.pensDeelWerknemer, { bedrag: eur(b.pensionEmployeeCents) }) : x.pensDeelGeen,
      }),
    );
  }

  lines.push(vulIn(x.belasting, { belastbaar: eur(b.taxableCents), heffing: eur(b.wageTaxIndicativeCents), netto: eur(b.netIndicativeCents) }));
  lines.push(x.schatting);

  if (p.advance) {
    lines.push(
      vulIn(x.voorschot, {
        bedrag: eur(p.advance.grossCents),
        n: p.advance.count,
        kosten: p.advance.feeCents > 0 ? vulIn(x.voorschotKosten, { bedrag: eur(p.advance.feeCents) }) : "",
        rest: eur(p.toPayCents),
      }),
    );
  }

  return lines;
}
