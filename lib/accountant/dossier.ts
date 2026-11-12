// ---------------------------------------------------------------------------
// Dossier voor een menselijk accountant: één zelfstandig HTML-bestand (printen of als PDF bewaren)
// met het jaarconcept, de cijfers voor Form 1120/5472, de open vragen, de structuurcheck, de komende
// termijnen en de bronnen. Puur (geen database): de route levert de gegevens. Alle tekst wordt
// ge-escaped; er gaan geen scripts of externe bestanden in.
// De XAF-export (auditfile) van de boekhouding komt er los bij zodra Boekhouding hem levert.
// ---------------------------------------------------------------------------

import type { Jaarconcept, Post } from "@/lib/accountant/jaar-kern";
import type { TermijnRij } from "@/lib/accountant/maandcontrole-kern";
import { KENNIS } from "@/lib/accountant/kennis";
import { STRUCTUUR, type StructuurToestand } from "@/lib/accountant/structuur";

export function esc(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function bedrag(cents: number, valuta: string): string {
  const teken = cents < 0 ? "-" : "";
  const n = (Math.abs(cents) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${teken}${valuta === "EUR" ? "€" : valuta === "USD" ? "$" : `${valuta} `} ${n}`;
}

const STATUS_NAAM: Record<string, string> = { open: "nog niet geregeld", bezig: "bezig", klaar: "klaar" };

function postTabel(titel: string, posten: readonly Post[], totaal: number, valuta: string, extra: [string, number][] = []): string {
  const rijen = posten.map((p) => `<tr><td>${esc(p.rekeningNummer)}</td><td>${esc(p.naam)}</td><td class="r">${esc(bedrag(p.cents, valuta))}</td></tr>`);
  for (const [naam, cents] of extra) rijen.push(`<tr><td></td><td>${esc(naam)}</td><td class="r">${esc(bedrag(cents, valuta))}</td></tr>`);
  return `<h3>${esc(titel)}</h3><table><thead><tr><th>Rekening</th><th>Naam</th><th class="r">Bedrag</th></tr></thead><tbody>${rijen.join("") || '<tr><td colspan="3">Geen.</td></tr>'}</tbody><tfoot><tr><td></td><td>Totaal</td><td class="r">${esc(bedrag(totaal, valuta))}</td></tr></tfoot></table>`;
}

export interface DossierInvoer {
  administratie: string;
  /** Amsterdamse dag waarop het dossier is gemaakt */
  gemaaktOp: string;
  concept: Jaarconcept | null;
  vragen: string[];
  structuur: StructuurToestand;
  termijnen: TermijnRij[];
}

export function dossierHtml(d: DossierInvoer): string {
  const c = d.concept;
  const delen: string[] = [];
  delen.push(
    `<h1>Dossier voor de accountant: zekerflex, Inc.</h1>`,
    `<p class="klein">Administratie: ${esc(d.administratie)}${c ? ` · boekjaar ${esc(c.van)} t/m ${esc(c.tot)}` : ""} · gemaakt op ${esc(d.gemaaktOp)}</p>`,
    `<p class="let">Dit is een CONCEPT, klaargezet door de AI-accountant van ZekerFlex. Dat is geen geregistreerd accountant of belastingadviseur: geen verklaring, geen handtekening, niets ingediend. De indeling en alle cijfers moeten door een mens worden gecontroleerd. De bestuurder blijft verantwoordelijk.</p>`,
  );

  if (c) {
    const extraCredit: [string, number][] = [];
    if (c.balans.resultaatJaar !== 0) extraCredit.push([`Resultaat boekjaar (${c.balans.resultaatJaar >= 0 ? "winst" : "verlies"})`, c.balans.resultaatJaar]);
    if (c.balans.resultaatEerder !== 0) extraCredit.push(["Resultaat eerdere jaren (nog niet verdeeld)", c.balans.resultaatEerder]);
    delen.push(
      `<h2>1. Conceptbalans per ${esc(c.tot)}</h2>`,
      `<p class="klein">Ingedeeld op debet- en creditsaldo; welke post bezitting, schuld of eigen vermogen is, bevestigt de accountant.${c.balans.sluit ? " De balans sluit." : ` <strong>De balans sluit niet: verschil ${esc(bedrag(c.balans.verschilCents, c.valuta))}.</strong>`}</p>`,
      postTabel("Debet (bezittingen)", c.balans.debet, c.balans.totaalDebet, c.valuta),
      postTabel("Credit (schulden en eigen vermogen)", c.balans.credit, c.balans.totaalCredit + c.balans.resultaatJaar + c.balans.resultaatEerder, c.valuta, extraCredit),
      `<h2>2. Concept winst-en-verliesrekening ${esc(c.van)} t/m ${esc(c.tot)}</h2>`,
      postTabel("Opbrengsten", c.wv.opbrengsten, c.wv.totaalOpbrengsten, c.valuta),
      postTabel("Kosten", c.wv.kosten, c.wv.totaalKosten, c.valuta),
      `<p><strong>Resultaat: ${esc(bedrag(c.wv.resultaat, c.valuta))}</strong></p>`,
      `<h2>3. Cijfers voor Form 1120 en Form 5472 (concept)</h2>`,
      `<table><tbody>`,
      `<tr><td>Gross receipts (regel 1a, concept)</td><td class="r">${esc(bedrag(c.us.grossReceiptsCents, c.valuta))}</td></tr>`,
      `<tr><td>Kosten (welke aftrekbaar zijn, beslist de preparer)</td><td class="r">${esc(bedrag(c.us.deductionsCents, c.valuta))}</td></tr>`,
      `<tr><td>Resultaat vóór fiscale correcties</td><td class="r">${esc(bedrag(c.us.resultaatCents, c.valuta))}</td></tr>`,
      `<tr><td>Schedule L total assets (ook de gross assets voor Delaware)</td><td class="r">${esc(bedrag(c.us.totalAssetsCents, c.valuta))}</td></tr>`,
      `</tbody></table>`,
      c.us.omrekenenNodig ? `<p class="klein">De bedragen staan in ${esc(c.valuta)}; voor de IRS en Delaware moeten ze naar dollars. De koers kiest de preparer.</p>` : "",
      `<p class="klein">Form 1120 is uiterlijk de 15e dag van de 4e maand na het boekjaar verschuldigd; Form 5472 gaat als bijlage mee. De IRS: "A penalty of $25,000 will be assessed on any reporting corporation that fails to file Form 5472 when due."</p>`,
    );
  } else {
    delen.push(`<h2>1–3. Jaarcijfers</h2><p>Er is nog geen echte administratie, dus nog geen jaarcijfers.</p>`);
  }

  delen.push(`<h2>4. Open vragen voor de accountant</h2><ol>${d.vragen.map((v) => `<li>${esc(v)}</li>`).join("")}</ol>`);

  delen.push(
    `<h2>5. Structuur van de onderneming</h2><table><thead><tr><th>Punt</th><th>Status</th><th>Volgende stap</th><th>Bron</th></tr></thead><tbody>`,
    ...STRUCTUUR.map((p) => {
      const bron = KENNIS.find((r) => r.id === p.bronId)?.bron;
      return `<tr><td>${esc(p.titel)}${p.uiterlijk ? `<br><span class="klein">uiterlijk ${esc(p.uiterlijk)}</span>` : ""}</td><td>${esc(STATUS_NAAM[d.structuur[p.id] ?? p.start] ?? "")}</td><td>${esc(p.volgende)}</td><td>${bron ? `${esc(bron.naam)}<br><span class="klein">${esc(bron.url)}</span>` : ""}</td></tr>`;
    }),
    `</tbody></table>`,
  );

  delen.push(
    `<h2>6. Komende termijnen</h2><table><thead><tr><th>Wat</th><th>Uiterlijk</th><th>Toelichting</th></tr></thead><tbody>`,
    ...d.termijnen.map((t) => `<tr><td>${esc(t.titel)}${t.klaar ? " (klaar)" : ""}</td><td>${esc(t.dag)}</td><td>${esc(t.wat)}${t.waarschuwing ? `<br><strong>${esc(t.waarschuwing)}</strong>` : ""}<br><span class="klein">${esc(t.bevestigDoor)}</span></td></tr>`),
    `</tbody></table>`,
  );

  delen.push(
    `<h2>7. Bronnen</h2><ul>${KENNIS.filter((r) => r.bron.url.startsWith("http"))
      .map((r) => `<li>${esc(r.title)}: ${esc(r.bron.naam)}, ${esc(r.bron.url)} (${esc(r.zekerheid === "gelezen" ? `gelezen op ${r.gelezen ?? "?"}` : "laten bevestigen")})</li>`)
      .join("")}</ul>`,
    `<p class="klein">De auditfile (XAF) van de boekhouding hoort bij dit dossier; die komt uit Beheer → Boekhouding zodra die export er is.</p>`,
  );

  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dossier zekerflex, Inc.${c ? ` ${c.jaar}` : ""}</title><style>
body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#111;background:#fff}
h1{font-size:22px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #ccc;padding-bottom:4px}h3{font-size:14px;margin:16px 0 4px}
table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border-bottom:1px solid #e5e5e5;padding:4px 6px;text-align:left;vertical-align:top}
.r{text-align:right;white-space:nowrap}tfoot td{font-weight:600;border-top:1px solid #999}.klein{font-size:12px;color:#555}
.let{border:1px solid #d97706;background:#fffbeb;padding:8px 10px}
</style></head><body>${delen.join("\n")}</body></html>`;
}
