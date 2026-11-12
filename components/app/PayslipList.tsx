import type { PayslipRecord } from "@/lib/payroll/store";
import { euro } from "@/lib/payroll/format";
import { explainPayslip, loonstrookKop } from "@/lib/payroll/explain";
import { isoWeekLabelIn, parseIsoWeekId } from "@/lib/payroll/week";
import { LOONSTROOK_NL, type LoonstrookTeksten } from "@/lib/payroll/loonstrook-teksten";
import { vulIn } from "@/lib/i18n/vul-in";
import { StatusPill } from "@/components/app/ui";

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? "font-semibold text-ink" : "text-neutralx-600"}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

/**
 * De loonstroken per week. `t`: de teksten in de taal van de werker (zonder: Nederlands). Bedragen en getallen volgen die
 * taal; de pdf (voor de Belastingdienst) blijft Nederlands en staat achter de link onderaan.
 */
export function PayslipList({ payslips, t = LOONSTROOK_NL }: { payslips: PayslipRecord[]; t?: LoonstrookTeksten }) {
  const eur = (cents: number) => euro(cents, t.intl);
  const getal = (n: number) => n.toLocaleString(t.intl);

  if (payslips.length === 0) {
    return (
      <div className="rounded-xl border border-hair bg-paper-soft p-8 text-center">
        <p className="font-medium text-ink">{t.leegTitel}</p>
        <p className="mt-1 text-sm text-neutralx-500">{t.leegTekst}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {payslips.map((p) => {
        const b = p.computed.breakdown;
        const week = parseIsoWeekId(p.isoWeek);
        const weekLabel = week ? isoWeekLabelIn(week, t.weekLabel) : p.weekLabel;
        return (
          <details key={p.isoWeek} className="group rounded-xl border border-hair bg-paper">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-ink">{weekLabel}</p>
                <p className="text-xs text-neutralx-500">
                  {(t.kinds as Record<string, string>)[p.workerKind ?? ""] ?? t.kindOnbekend} ·{" "}
                  {getal(p.computed.totalHours)} {t.uur}
                  {b.kind === "payroll" ? ` · ${vulIn(t.fase, { fase: b.phase })}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {!p.fiscalComplete && <StatusPill tone="warn">{t.onvolledigBadge}</StatusPill>}
                <div className="text-right">
                  <p className="num font-semibold text-ink">{eur(p.computed.headlineCents)}</p>
                  <p className="text-[11px] text-neutralx-400">{loonstrookKop(p, t)}</p>
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
                      {getal(l.hours)} × {eur(l.hourlyRateCents)} = {eur(l.grossCents)}
                    </span>
                  </div>
                ))}
              </div>

              {b.kind === "payroll" ? (
                <div className="divide-y divide-hair">
                  {b.cao && (b.cao.toeslagCents > 0 || b.cao.wmlFloorApplied) && (
                    <>
                      <Row label={vulIn(t.basisloon, { cao: b.cao.caoLabel })} value={eur(b.cao.baseCents)} />
                      {b.cao.nachtCents > 0 && <Row label={vulIn(t.nacht, { uren: getal(b.cao.nachtHours) })} value={`+ ${eur(b.cao.nachtCents)}`} />}
                      {b.cao.weekendCents > 0 && <Row label={vulIn(t.weekend, { uren: getal(b.cao.weekendHours) })} value={`+ ${eur(b.cao.weekendCents)}`} />}
                      {b.cao.feestdagCents > 0 && <Row label={vulIn(t.feestdag, { uren: getal(b.cao.feestdagHours) })} value={`+ ${eur(b.cao.feestdagCents)}`} />}
                      {b.cao.overwerkCents > 0 && <Row label={vulIn(t.overwerk, { uren: getal(b.cao.overwerkHours) })} value={`+ ${eur(b.cao.overwerkCents)}`} />}
                      {b.cao.wmlFloorApplied && <p className="py-1.5 text-[11px] text-warn">{t.wml}</p>}
                    </>
                  )}
                  <Row label={t.brutoloon} value={eur(b.grossCents)} strong />
                  <Row label={t.vakantiegeld} value={eur(b.holidayAllowanceCents)} />
                  <Row label={t.vakantieUren} value={eur(b.holidayHoursReserveCents)} />
                  <Row label={t.kortVerzuim} value={eur(b.shortLeaveReserveCents)} />
                  <Row label={vulIn(t.pensioenWerkgever, { regeling: t.regeling[b.pensionRegeling] })} value={eur(b.pensionEmployerCents)} />
                  {b.pensionEmployeeCents > 0 && <Row label={t.pensioenWerknemer} value={`- ${eur(b.pensionEmployeeCents)}`} />}
                  <Row label={t.loonheffing} value={`- ${eur(b.wageTaxIndicativeCents)}`} />
                  <Row label={t.netto} value={eur(b.netIndicativeCents)} strong />
                  {p.advance && (
                    <>
                      <Row label={vulIn(t.voorschot, { n: p.advance.count })} value={`- ${eur(p.advance.grossCents)}`} />
                      <Row label={t.nogUitTeBetalen} value={eur(p.toPayCents)} strong />
                    </>
                  )}
                  <p className="pt-2 text-[11px] text-neutralx-400">{t.indicatief}</p>
                </div>
              ) : (
                <div className="divide-y divide-hair">
                  <Row label={t.dienstbedrag} value={eur(b.servicesCents)} strong />
                  <Row
                    label={b.vatRate > 0 ? vulIn(t.btwPct, { pct: Math.round(b.vatRate * 100) }) : t.btw}
                    value={b.vatRate > 0 ? eur(b.vatCents) : t.verlegd}
                  />
                  <Row label={t.factuurtotaal} value={eur(b.invoiceTotalCents)} strong />
                  <Row label={t.platformkosten} value={eur(b.platformFeeCents)} />
                  <Row label={t.uitbetaald} value={eur(b.payoutToWorkerCents)} strong />
                  <p className="pt-2 text-[11px] text-neutralx-400">{vulIn(t.factuurNoot, { mode: b.mode })}</p>
                </div>
              )}

              <details className="mt-3 rounded-lg border border-hair bg-paper-soft/50">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-ink">
                  {b.kind === "payroll" ? t.zoLoon : t.zoBedrag}
                </summary>
                <ul className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-neutralx-600">
                  {explainPayslip(p, t).map((sentence, k) => (
                    <li key={k} className="flex gap-2">
                      <span aria-hidden className="text-neutralx-300">•</span>
                      <span>{sentence}</span>
                    </li>
                  ))}
                </ul>
              </details>

              {/* de pdf is het document dat telt en blijft Nederlands */}
              <a
                href={`/api/me/payroll/${p.isoWeek}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline"
              >
                {b.kind === "payroll" ? t.pdfLoon : t.pdfWeek} ↓
              </a>
            </div>
          </details>
        );
      })}
    </div>
  );
}
