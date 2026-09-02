import type { PayslipRecord } from "@/lib/payroll/store";
import { euro } from "@/lib/payroll/format";
import { StatusPill } from "@/components/app/ui";

const KIND_LABEL: Record<string, string> = {
  uitzendkracht: "Uitzendkracht",
  flexwerker: "Flexwerker",
  zzp: "Zzp",
};

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? "font-semibold text-ink" : "text-neutralx-600"}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

export function PayslipList({ payslips }: { payslips: PayslipRecord[] }) {
  if (payslips.length === 0) {
    return (
      <div className="rounded-xl border border-hair bg-paper-soft p-8 text-center">
        <p className="font-medium text-ink">Nog geen verloning</p>
        <p className="mt-1 text-sm text-neutralx-500">
          Zodra je eerste week met goedgekeurde uren is verwerkt, verschijnt hier je loonstrook of
          wekelijkse factuur — met alle inhoudingen en reserveringen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {payslips.map((p) => {
        const b = p.computed.breakdown;
        return (
          <details key={p.isoWeek} className="group rounded-xl border border-hair bg-paper">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-ink">{p.weekLabel}</p>
                <p className="text-xs text-neutralx-500">
                  {KIND_LABEL[p.workerKind ?? ""] ?? "Werkvorm onbekend"} ·{" "}
                  {p.computed.totalHours.toLocaleString("nl-NL")} uur
                  {b.kind === "payroll" ? ` · fase ${b.phase}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {!p.fiscalComplete && <StatusPill tone="warn">Gegevens onvolledig</StatusPill>}
                <div className="text-right">
                  <p className="num font-semibold text-ink">{euro(p.computed.headlineCents)}</p>
                  <p className="text-[11px] text-neutralx-400">{p.computed.headlineLabel}</p>
                </div>
                <span className="text-neutralx-400 transition-transform group-open:rotate-90">›</span>
              </div>
            </summary>

            <div className="border-t border-hair px-4 pb-4 pt-2">
              <div className="mb-3 space-y-0.5">
                {p.computed.lines.map((l) => (
                  <div key={l.shiftId + l.workedOn} className="flex justify-between text-xs text-neutralx-500">
                    <span>
                      {l.workedOn} · {l.shiftTitle} ({l.clientName})
                    </span>
                    <span className="num">
                      {l.hours.toLocaleString("nl-NL")} × {euro(l.hourlyRateCents)} = {euro(l.grossCents)}
                    </span>
                  </div>
                ))}
              </div>

              {b.kind === "payroll" ? (
                <div className="divide-y divide-hair">
                  <Row label="Brutoloon" value={euro(b.grossCents)} strong />
                  <Row label="Reservering vakantiegeld (8,33%)" value={euro(b.holidayAllowanceCents)} />
                  <Row label="Reservering vakantie-uren" value={euro(b.holidayHoursReserveCents)} />
                  <Row label="Reservering kort verzuim" value={euro(b.shortLeaveReserveCents)} />
                  <Row
                    label={`Pensioen StiPP (${b.pensionRegeling}) — werkgever`}
                    value={euro(b.pensionEmployerCents)}
                  />
                  {b.pensionEmployeeCents > 0 && (
                    <Row label="Pensioen StiPP — werknemer" value={`- ${euro(b.pensionEmployeeCents)}`} />
                  )}
                  <Row label="Loonheffing (indicatief)" value={`- ${euro(b.wageTaxIndicativeCents)}`} />
                  <Row label="Netto (indicatief)" value={euro(b.netIndicativeCents)} strong />
                  <p className="pt-2 text-[11px] text-neutralx-400">
                    De loonheffing is indicatief. De definitieve loonstrook volgt uit de loonaangifte
                    en kan afwijken door heffingskortingen en toeslagen.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-hair">
                  <Row label="Dienstbedrag" value={euro(b.servicesCents)} strong />
                  <Row
                    label={b.vatRate > 0 ? `Btw (${Math.round(b.vatRate * 100)}%)` : "Btw"}
                    value={b.vatRate > 0 ? euro(b.vatCents) : "verlegd / vrijgesteld"}
                  />
                  <Row label="Factuurtotaal" value={euro(b.invoiceTotalCents)} strong />
                  <Row label="Platformkosten (€ 3,50/uur, aan opdrachtgever)" value={euro(b.platformFeeCents)} />
                  <Row label="Aan jou uitbetaald" value={euro(b.payoutToWorkerCents)} strong />
                  <p className="pt-2 text-[11px] text-neutralx-400">
                    ZekerFlex maakt deze factuur automatisch aan ({b.mode}). De platformfee wordt apart
                    aan de opdrachtgever gefactureerd en niet op jouw bedrag ingehouden.
                  </p>
                </div>
              )}
              <a
                href={`/api/me/payroll/${p.isoWeek}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline"
              >
                {b.kind === "payroll" ? "Loonstrook (pdf)" : "Weekoverzicht (pdf)"} ↓
              </a>
            </div>
          </details>
        );
      })}
    </div>
  );
}
