import type { PayslipRecord } from "@/lib/payroll/store";
import type { SimplePdf } from "@/lib/pdf/simple";

// ---------------------------------------------------------------------------
// De inhoud van de loonstrook-pdf (/api/me/payroll/[isoWeek]/pdf), puur: welke regels erop staan. Nederlands, want dit
// is het document voor de Belastingdienst (het scherm is vijftalig, lib/payroll/loonstrook-teksten.ts).
//
// Sinds 12 nov 2026 (wens eigenaar: "echte gegevens, zoals het bedrijf met KvK, de uitzendkracht en de rest") staan
// erop wat art. 7:626 BW vraagt: werkgever en werknemer, de periode, het loon met elke inhouding en het netto, de
// arbeidsduur en de gewerkte uren, het geldende minimumloon, of de loonheffingskorting is toegepast, vakantiegeld en
// reserveringen; bij uitzenden ook per dienst de inlener en de functie, en de ABU-fase.
// Regels:
//  - de werkgever komt uit één bron (lib/platform/werkgever.ts); een leeg veld (KvK, loonheffingennummer, adres) blijft
//    weg, er wordt niets verzonnen;
//  - van het BSN alleen de laatste 4 cijfers (meer bewaren we niet);
//  - de bedragen komen ongewijzigd uit de bewaarde berekening (computed): een oude strook krijgt de nieuwe opmaak, maar
//    dezelfde bedragen (tests/loonstrook-pdf.test.ts vergelijkt ze met de opmaak van vóór 12 nov).
// ---------------------------------------------------------------------------

export interface WerkgeverGegevens {
  naam: string;
  adres: string | null;
  kvk: string | null;
  loonheffingennummer: string | null;
}

export interface WerknemerGegevens {
  naam: string;
  /** kort personeelsnummer, afgeleid van het account */
  nummer: string;
  /** alleen de laatste 4 cijfers; null = onbekend */
  bsnLaatste4: string | null;
  /** postcode van het woonadres (meer van het adres bewaren we niet) */
  postcode: string | null;
}

export interface LoonstrookExtra {
  loonheffingskorting: boolean;
  /** het wettelijk minimumloon per uur dat in deze week voor deze werknemer geldt (centen) */
  minimumloonPerUurCents: number | null;
}

export type PdfRegel =
  | { soort: "kop"; tekst: string; grootte: number }
  | { soort: "tekst"; tekst: string; grootte?: number; vet?: boolean; grijs?: boolean; accent?: boolean }
  | { soort: "rij"; label: string; waarde: string; vet?: boolean; grootte?: number }
  | { soort: "lijn" }
  | { soort: "ruimte"; hoogte: number };

/** Zoals vóór 12 nov: "EUR 12,34". */
export const euro = (c: number) => `EUR ${(c / 100).toFixed(2).replace(".", ",")}`;

const uren = (n: number) => n.toFixed(2).replace(".", ",");

/** "2026-11-03" → "03-11-2026" */
const datumNl = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
};

const WERKVORM: Record<string, string> = { uitzendkracht: "Uitzendkracht", flexwerker: "Flexwerker", zzp: "Zzp'er" };

/** Kort personeelsnummer: "ZF-" en de laatste 6 tekens van het account (geen naam of e-mail). */
export function werknemerNummer(userId: string): string {
  return `ZF-${userId.slice(-6).toUpperCase()}`;
}

/** "*****1234" — alleen de laatste 4 cijfers; iets anders dan 4 cijfers wordt niet getoond. */
export function bsnWeergave(laatste4: string | null): string | null {
  return laatste4 && /^\d{4}$/.test(laatste4) ? `*****${laatste4}` : null;
}

export function loonstrookRegels(
  slip: Pick<PayslipRecord, "computed" | "weekLabel" | "workerKind" | "weeksWorked">,
  werkgever: WerkgeverGegevens,
  werknemer: WerknemerGegevens,
  extra: LoonstrookExtra,
): PdfRegel[] {
  const b = slip.computed.breakdown;
  const loon = b.kind === "payroll";
  const r: PdfRegel[] = [];
  const rij = (label: string, waarde: string | null | undefined, o: { vet?: boolean; grootte?: number } = {}) => {
    if (waarde) r.push({ soort: "rij", label, waarde, ...o });
  };

  r.push({ soort: "kop", tekst: loon ? "Loonstrook" : "Weekoverzicht", grootte: 20 });
  r.push({ soort: "tekst", tekst: `Periode: ${slip.weekLabel}`, grootte: 11, accent: true });
  r.push({ soort: "ruimte", hoogte: 8 }, { soort: "lijn" });

  // de partijen
  r.push({ soort: "tekst", tekst: loon ? "Werkgever" : "Opgesteld door", vet: true });
  rij("Naam", werkgever.naam);
  rij("Adres", werkgever.adres);
  rij("KvK-nummer", werkgever.kvk);
  if (loon) rij("Loonheffingennummer", werkgever.loonheffingennummer);
  r.push({ soort: "ruimte", hoogte: 6 });
  r.push({ soort: "tekst", tekst: loon ? "Werknemer" : "Opdrachtnemer", vet: true });
  rij("Naam", werknemer.naam);
  rij("Personeelsnummer", werknemer.nummer);
  if (loon) rij("BSN", bsnWeergave(werknemer.bsnLaatste4));
  rij("Postcode woonadres", werknemer.postcode);
  r.push({ soort: "ruimte", hoogte: 6 }, { soort: "lijn" });

  // het werk
  rij("Werkvorm", slip.workerKind ? (WERKVORM[slip.workerKind] ?? slip.workerKind) : "—");
  if (loon) rij("Arbeidsduur", "Geen vaste arbeidsduur (werk per dienst)");
  rij("Gewerkte uren", uren(slip.computed.totalHours));
  rij("Gewerkte weken (cumulatief)", String(slip.weeksWorked));
  if (loon) {
    rij("ABU-fase", b.phase);
    if (extra.minimumloonPerUurCents) rij("Wettelijk minimumloon per uur", euro(extra.minimumloonPerUurCents));
    rij("Loonheffingskorting toegepast", extra.loonheffingskorting ? "Ja" : "Nee");
  }
  if (slip.computed.lines.length > 0) {
    r.push({ soort: "ruimte", hoogte: 6 });
    r.push({ soort: "tekst", tekst: loon ? "Gewerkte diensten (inlener · functie)" : "Diensten (opdrachtgever · klus)", vet: true });
    for (const l of slip.computed.lines) {
      rij(`${datumNl(l.workedOn)}  ${l.clientName} · ${l.shiftTitle}`, `${uren(l.hours)} u à ${euro(l.hourlyRateCents)}`);
    }
  }
  r.push({ soort: "ruimte", hoogte: 6 }, { soort: "lijn" });

  // de bedragen: precies zoals vóór 12 nov (labels en volgorde), uit de bewaarde berekening
  if (b.kind === "payroll") {
    if (b.cao && (b.cao.toeslagCents > 0 || b.cao.wmlFloorApplied)) {
      rij(`Basisloon (${b.cao.caoLabel})`, euro(b.cao.baseCents));
      if (b.cao.nachtCents > 0) rij("Nachttoeslag", `+ ${euro(b.cao.nachtCents)}`);
      if (b.cao.weekendCents > 0) rij("Weekendtoeslag", `+ ${euro(b.cao.weekendCents)}`);
      if (b.cao.feestdagCents > 0) rij("Feestdagtoeslag", `+ ${euro(b.cao.feestdagCents)}`);
      if (b.cao.overwerkCents > 0) rij("Overwerktoeslag", `+ ${euro(b.cao.overwerkCents)}`);
      if (b.cao.wmlFloorApplied) r.push({ soort: "tekst", tekst: "Uurtarief automatisch opgehoogd naar het wettelijk minimumloon.", grootte: 9 });
    }
    rij("Brutoloon", euro(b.grossCents));
    rij("Vakantiegeld (8,33%)", euro(b.holidayAllowanceCents));
    rij("Reservering vakantie-uren", euro(b.holidayHoursReserveCents));
    rij("Reservering kort verzuim", euro(b.shortLeaveReserveCents));
    rij(`Pensioen (StiPP ${b.pensionRegeling}) — jouw deel`, `- ${euro(b.pensionEmployeeCents)}`);
    rij("Belastbaar loon", euro(b.taxableCents));
    rij("Loonheffing (indicatief)", `- ${euro(b.wageTaxIndicativeCents)}`);
    r.push({ soort: "ruimte", hoogte: 4 }, { soort: "lijn" });
    rij("Netto (indicatief)", euro(b.netIndicativeCents), { vet: true, grootte: 12 });
    r.push({ soort: "ruimte", hoogte: 10 });
    r.push({ soort: "tekst", tekst: `Werkgeversdeel pensioen: ${euro(b.pensionEmployerCents)} (niet ingehouden).`, grootte: 9 });
  } else {
    rij("Diensten", euro(b.servicesCents));
    rij(b.vatRate > 0 ? `Btw (${Math.round(b.vatRate * 100)}%)` : "Btw", euro(b.vatCents));
    rij("Factuurtotaal", euro(b.invoiceTotalCents));
    r.push({ soort: "ruimte", hoogte: 4 }, { soort: "lijn" });
    rij("Uit te betalen aan jou", euro(b.payoutToWorkerCents), { vet: true, grootte: 12 });
    r.push({ soort: "ruimte", hoogte: 10 });
    r.push({ soort: "tekst", tekst: `Platformkosten ${euro(b.platformFeeCents)} worden apart aan de opdrachtgever gefactureerd — niet ingehouden op jouw bedrag.`, grootte: 9 });
  }

  r.push({ soort: "ruimte", hoogte: 16 });
  r.push({ soort: "tekst", tekst: "Automatisch opgesteld door ZekerFlex. Indicatief — geen vervanging voor je jaaropgave.", grootte: 8.5, grijs: true });
  return r;
}

/** Zet de regels op een SimplePdf (de route en het voorbeeld in de test gebruiken hetzelfde). */
export function tekenRegels(pdf: SimplePdf, regels: readonly PdfRegel[]): SimplePdf {
  for (const r of regels) {
    if (r.soort === "kop") pdf.heading(r.tekst, r.grootte);
    else if (r.soort === "tekst") {
      const kleur: [number, number, number] | undefined = r.accent ? [0.05, 0.36, 0.29] : r.grijs ? [0.4, 0.45, 0.42] : undefined;
      pdf.line(r.tekst, r.grootte ?? 10.5, { ...(r.vet ? { bold: true } : {}), ...(kleur ? { color: kleur } : {}) });
    } else if (r.soort === "rij") pdf.row(r.label, r.waarde, { ...(r.vet ? { bold: true } : {}), ...(r.grootte ? { size: r.grootte } : {}) });
    else if (r.soort === "lijn") pdf.rule();
    else pdf.gap(r.hoogte);
  }
  return pdf;
}
