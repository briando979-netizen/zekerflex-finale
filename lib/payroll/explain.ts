import { euro } from "@/lib/payroll/format";
import type { PayslipRecord } from "@/lib/payroll/store";

// ---------------------------------------------------------------------------
// Loonstrook-uitleg in gewone taal: waarom is je loon precies dit? Puur
// afgeleid van de al berekende breakdown — geen AI, geen extra data.
// ---------------------------------------------------------------------------

export function explainPayslip(p: PayslipRecord): string[] {
  const b = p.computed.breakdown;
  const lines: string[] = [];
  const hours = p.computed.totalHours.toLocaleString("nl-NL");
  const clients = [...new Set(p.computed.lines.map((l) => l.clientName))];
  const clientTxt = clients.length === 1 ? `bij ${clients[0]}` : `bij ${clients.length} opdrachtgevers`;

  if (b.kind === "invoice") {
    lines.push(`Je werkte deze week ${hours} uur ${clientTxt}.`);
    lines.push(
      `Je dienstbedrag is ${euro(b.servicesCents)}` +
        (b.vatRate > 0
          ? `, plus ${Math.round(b.vatRate * 100)}% btw (${euro(b.vatCents)}) — factuurtotaal ${euro(b.invoiceTotalCents)}.`
          : `. Btw is verlegd of vrijgesteld, dus die zie je niet op de factuur.`),
    );
    lines.push(
      `De platformkosten van € 3,50 per gewerkt uur (${euro(b.platformFeeCents)}) worden apart aan de opdrachtgever gefactureerd — die gaan níét van jouw bedrag af.`,
    );
    lines.push(`Je ontvangt ${euro(b.payoutToWorkerCents)}. Als zzp'er draag je zelf je inkomstenbelasting en eventueel btw af.`);
    return lines;
  }

  // payroll
  lines.push(`Je werkte deze week ${hours} uur ${clientTxt}. Je zit in fase ${b.phase} van het ABU-fasensysteem (${p.weeksWorked} gewerkte weken).`);

  if (b.cao) {
    if (b.cao.wmlFloorApplied) {
      lines.push(
        `Je afgesproken uurtarief lag onder het wettelijk minimumloon. Daarom is het automatisch opgehoogd — je basisloon is ${euro(b.cao.baseCents)}.`,
      );
    } else {
      lines.push(`Je basisloon (uren × tarief volgens ${b.cao.caoLabel}) is ${euro(b.cao.baseCents)}.`);
    }
    if (b.cao.nachtCents > 0) lines.push(`Voor ${b.cao.nachtHours.toLocaleString("nl-NL")} uur nachtwerk kreeg je ${euro(b.cao.nachtCents)} nachttoeslag bovenop je basisloon.`);
    if (b.cao.weekendCents > 0) lines.push(`Voor ${b.cao.weekendHours.toLocaleString("nl-NL")} uur in het weekend kreeg je ${euro(b.cao.weekendCents)} weekendtoeslag.`);
    if (b.cao.feestdagCents > 0) lines.push(`Voor ${b.cao.feestdagHours.toLocaleString("nl-NL")} uur op een feestdag kreeg je ${euro(b.cao.feestdagCents)} feestdagtoeslag.`);
    if (b.cao.overwerkCents > 0) lines.push(`Voor uren boven de daggrens/weekgrens kreeg je ${euro(b.cao.overwerkCents)} overwerktoeslag.`);
  }

  lines.push(`Je brutoloon (basis + toeslagen) is ${euro(b.grossCents)}.`);
  lines.push(
    `Daarover reserveren we 8,33% vakantiegeld (${euro(b.holidayAllowanceCents)}) en ongeveer 10,83% vakantie-uren (${euro(b.holidayHoursReserveCents)}), plus een kleine reservering voor kort verzuim (${euro(b.shortLeaveReserveCents)}). Die staan apart en keer je uit wanneer je wilt — ze verlagen je weekloon nu niet, ze zijn extra.`,
  );

  if (b.pensionRegeling === "geen") {
    lines.push(`Je bouwt nog geen pensioen op — dat begint automatisch vanaf je 9e gewerkte week (StiPP-basisregeling).`);
  } else {
    lines.push(
      `Je bouwt pensioen op via StiPP (${b.pensionRegeling}regeling). ZekerFlex legt ${euro(b.pensionEmployerCents)} in als werkgever` +
        (b.pensionEmployeeCents > 0 ? `; jouw deel van ${euro(b.pensionEmployeeCents)} gaat van je brutoloon af.` : ` — jij betaalt niets mee.`),
    );
  }

  lines.push(
    `Van je belastbaar loon (${euro(b.taxableCents)}) gaat ${euro(b.wageTaxIndicativeCents)} indicatieve loonheffing af` +
      `. Netto houd je deze week ongeveer ${euro(b.netIndicativeCents)} over.`,
  );
  lines.push(`De loonheffing is een schatting; de definitieve loonstrook uit de loonaangifte kan iets afwijken door heffingskortingen en toeslagen.`);

  if (p.advance) {
    lines.push(
      `Je kreeg al ${euro(p.advance.grossCents)} als voorschot uitbetaald (${p.advance.count}×${p.advance.feeCents > 0 ? `, minus ${euro(p.advance.feeCents)} kosten` : ""}). Dat is hiermee verrekend — er wordt nog ${euro(p.toPayCents)} overgemaakt.`,
    );
  }

  return lines;
}
