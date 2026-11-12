// ---------------------------------------------------------------------------
// Een printbare weergave (HTML met print-CSS) van de kolommenbalans en de winst-en-verliesrekening (puur). De gebruiker
// opent hem in een tabblad en kiest Afdrukken, dan "Opslaan als PDF". Geen scripts, geen externe bronnen, geen
// persoonsgegevens; alle tekst wordt ontsnapt.
// ---------------------------------------------------------------------------

import { formatCenten } from "../bedrag";
import { dagTekst } from "../scherm-kern";
import { soortTekst, type Kolommenbalans, type WinstVerlies } from "./kern";

export const AFDRUK_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export function htmlTekst(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const bedrag = (cents: number, valuta: string): string => formatCenten(cents, valuta);
/** Een lege kolom als streepje, zodat een nul niet als bedrag voorbijkomt. */
const bedragOfStreep = (cents: number, valuta: string): string => (cents === 0 ? "-" : bedrag(cents, valuta));

const STIJL = `
  :root { color-scheme: light; }
  body { font: 13px/1.4 system-ui, sans-serif; color: #111; background: #fff; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 6px; }
  p { margin: 2px 0; }
  .klein { color: #444; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #ccc; text-align: left; vertical-align: top; }
  th.n, td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tfoot td, tr.totaal td { font-weight: 700; border-top: 2px solid #111; }
  .let-op { border: 1px solid #b45309; background: #fffbeb; padding: 6px 8px; margin-top: 10px; }
  @media print { body { margin: 0; } .let-op { background: none; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
`;

function kop(titel: string, administratieNaam: string, van: string, tot: string, valuta: string): string {
  return `<h1>${htmlTekst(titel)}</h1>
<p>${htmlTekst(administratieNaam)} &middot; ${htmlTekst(dagTekst(van))} t/m ${htmlTekst(dagTekst(tot))} &middot; bedragen in ${htmlTekst(valuta)}</p>`;
}

export function kolommenbalansHtml(k: Kolommenbalans, administratieNaam: string): string {
  const v = k.valuta;
  const rijen = k.rijen
    .map(
      (r) => `<tr><td>${htmlTekst(r.rekeningNummer)}</td><td>${htmlTekst(r.naam)}<br><span class="klein">${htmlTekst(soortTekst(r.soort))}</span></td>` +
        `<td class="n">${bedragOfStreep(r.openingDebetCents, v)}</td><td class="n">${bedragOfStreep(r.openingCreditCents, v)}</td>` +
        `<td class="n">${bedragOfStreep(r.mutatieDebetCents, v)}</td><td class="n">${bedragOfStreep(r.mutatieCreditCents, v)}</td>` +
        `<td class="n">${bedragOfStreep(r.eindDebetCents, v)}</td><td class="n">${bedragOfStreep(r.eindCreditCents, v)}</td></tr>`,
    )
    .join("\n");
  const t = k.totalen;
  return `<section>
${kop("Kolommenbalans", administratieNaam, k.van, k.tot, v)}
<table>
<thead><tr><th rowspan="2">Rekening</th><th rowspan="2">Naam</th><th class="n" colspan="2">Opening</th><th class="n" colspan="2">Mutaties</th><th class="n" colspan="2">Eindsaldo</th></tr>
<tr><th class="n">Debet</th><th class="n">Credit</th><th class="n">Debet</th><th class="n">Credit</th><th class="n">Debet</th><th class="n">Credit</th></tr></thead>
<tbody>
${rijen || `<tr><td colspan="8">Er zijn in deze periode geen boekingen.</td></tr>`}
</tbody>
<tfoot><tr><td colspan="2">Totaal</td><td class="n">${bedrag(t.openingDebetCents, v)}</td><td class="n">${bedrag(t.openingCreditCents, v)}</td><td class="n">${bedrag(t.mutatieDebetCents, v)}</td><td class="n">${bedrag(t.mutatieCreditCents, v)}</td><td class="n">${bedrag(t.eindDebetCents, v)}</td><td class="n">${bedrag(t.eindCreditCents, v)}</td></tr></tfoot>
</table>
${k.inBalans ? `<p class="klein">Debet en credit zijn gelijk.</p>` : `<p class="let-op">Let op: debet en credit zijn niet gelijk. Laat dit nakijken voor je het doorgeeft.</p>`}
</section>`;
}

export function winstVerliesHtml(w: WinstVerlies, administratieNaam: string): string {
  const v = w.valuta;
  const blok = (titel: string, rijen: WinstVerlies["opbrengsten"], totaal: number, totaalTitel: string): string =>
    `<h2>${htmlTekst(titel)}</h2>
<table><tbody>
${rijen.map((r) => `<tr><td>${htmlTekst(r.rekeningNummer)}</td><td>${htmlTekst(r.naam)}</td><td class="n">${bedrag(r.bedragCents, v)}</td></tr>`).join("\n") || `<tr><td colspan="3">Geen.</td></tr>`}
<tr class="totaal"><td colspan="2">${htmlTekst(totaalTitel)}</td><td class="n">${bedrag(totaal, v)}</td></tr>
</tbody></table>`;
  return `<section>
${kop("Winst- en verliesrekening", administratieNaam, w.van, w.tot, v)}
${blok("Opbrengsten", w.opbrengsten, w.totaalOpbrengstenCents, "Totaal opbrengsten")}
${blok("Kosten", w.kosten, w.totaalKostenCents, "Totaal kosten")}
<h2>Resultaat</h2>
<table><tbody><tr class="totaal"><td>${w.resultaatCents >= 0 ? "Winst" : "Verlies"}</td><td class="n">${bedrag(w.resultaatCents, v)}</td></tr></tbody></table>
</section>`;
}

/** Eén HTML-pagina met één of beide overzichten. */
export function afdrukPagina(titel: string, delen: readonly string[]): string {
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${htmlTekst(titel)}</title><style>${STIJL}</style></head>
<body>
${delen.join("\n")}
<p class="klein" style="margin-top:24px">Gemaakt met ZekerFlex. Een concept voor je accountant; geen jaarrekening. Kies Afdrukken en dan Opslaan als PDF om er een PDF van te maken.</p>
</body></html>
`;
}
