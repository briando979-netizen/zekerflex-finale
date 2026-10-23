import type { PensioenAangifte } from "@/lib/pensioen/aangifte";

// Semicolon + BOM CSV with spreadsheet-formula-injection guard (same rules as
// lib/integrations/employer-links.ts). The file an accountant can upload to the
// StiPP/APG-portal when there is no automated leverkanaal.

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const euro = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function aangifteCsv(a: PensioenAangifte): string {
  const rows: unknown[][] = [
    [`StiPP-pensioenaangifte ${a.label}`, `aansluitnummer: ${a.aansluitnummer ?? "ONTBREEKT"}`, `status: ${a.status}`],
    [],
    ["Naam", "BSN (laatste 4)", "Geboortedatum", "Regeling", "Fase", "Weken", "Uren", "Pensioengevend loon", "Werknemerpremie", "Werkgeverpremie", "Totaal premie", "Compleet", "Ontbreekt"],
  ];
  for (const l of a.lines) {
    rows.push([
      l.naam,
      l.bsnOpDossier ? (l.bsnLaatste4 ?? "op dossier") : "ONTBREEKT",
      l.geboortedatum ?? "",
      l.regeling,
      l.fase,
      l.wekenGewerkt,
      euro(Math.round(l.uren * 100)),
      euro(l.pensioengevendLoonCents),
      euro(l.werknemerPremieCents),
      euro(l.werkgeverPremieCents),
      euro(l.totaalPremieCents),
      l.compleet ? "ja" : "nee",
      l.ontbreekt.join(", "),
    ]);
  }
  rows.push([]);
  rows.push([
    "TOTAAL",
    `${a.totals.werknemers} werknemers`,
    "",
    "",
    "",
    "",
    euro(Math.round(a.totals.uren * 100)),
    euro(a.totals.pensioengevendLoonCents),
    euro(a.totals.werknemerPremieCents),
    euro(a.totals.werkgeverPremieCents),
    euro(a.totals.totaalPremieCents),
    a.totals.incompleet === 0 ? "ja" : `${a.totals.incompleet} incompleet`,
    "",
  ]);
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
