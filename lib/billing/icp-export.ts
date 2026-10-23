import type { IcpOpgave } from "@/lib/billing/icp";

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const euro = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function icpCsv(o: IcpOpgave): string {
  const rows: unknown[][] = [
    [`ICP-opgave ${o.label}`, `status: ${o.status}`],
    [],
    ["Afnemer", "Btw-id", "Land", "Netto (verlegd)", "Facturen", "Compleet"],
    ...o.lines.map((l) => [l.afnemer, l.vatId ?? "ONTBREEKT", l.land, euro(l.nettoCents), l.facturen, l.compleet ? "ja" : "nee"]),
    [],
    ["TOTAAL", `${o.totals.afnemers} afnemers`, "", euro(o.totals.nettoCents), o.totals.facturen, o.totals.incompleet === 0 ? "ja" : `${o.totals.incompleet} incompleet`],
  ];
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
