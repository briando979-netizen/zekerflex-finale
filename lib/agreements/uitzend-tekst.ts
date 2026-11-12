import type { UitzendContract } from "@/lib/agreements/uitzend-contract";

// ---------------------------------------------------------------------------
// De tekst van de uitzendovereenkomst als blokken: de ENIGE bron voor zowel de pdf (lib/pdf/documents.ts) als het scherm
// waarop een werker de overeenkomst leest vóór het tekenen en daarna terug (components/app/UitzendContractCard.tsx).
// Puur en zonder database. De juridische tekst is Nederlands en bindend; de knoppen en uitleg eromheen zijn vijftalig.
// Met opties.voorbeeld zegt de ondertekeningsparagraaf dat er nog niets is ondertekend.
// ---------------------------------------------------------------------------

export type ContractBlok =
  | { soort: "kop"; tekst: string }
  | { soort: "alinea"; tekst: string }
  | { soort: "punt"; nr: string; tekst: string }
  /** kleine grijze slottekst */
  | { soort: "klein"; tekst: string }
  /** een kleine tussenruimte (alleen in de pdf) */
  | { soort: "ruimte" };

/** Wat het scherm krijgt (GET /api/me/uitzend/contract/tekst). */
export interface ContractTekst {
  voorbeeld: boolean;
  referentie: string;
  titel: string;
  /** de gegevens voor de belangrijkste punten bovenaan */
  gegevens: { fase: "A" | "B" | "C"; weken: number; van: string; tot: string; ondertekend: string | null };
  blokken: ContractBlok[];
}

export const CONTRACT_MONTHS_LABEL = "3 kalendermaanden";

// Alle datums en tijden in Nederlandse tijd (de server draait in UTC).
const TZ = "Europe/Amsterdam";
const nlDate = (d: Date | string) => new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric", timeZone: TZ });
const nlLong = (d: Date | string) => new Date(d).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const nlTime = (d: Date | string) => new Date(d).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const nlLongTime = (d: Date | string) => `${nlLong(d)} om ${nlTime(d)}`;

export function uitzendContractBlokken(c: UitzendContract, opties: { voorbeeld?: boolean } = {}): ContractBlok[] {
  const kop = (tekst: string): ContractBlok => ({ soort: "kop", tekst });
  const alinea = (tekst: string): ContractBlok => ({ soort: "alinea", tekst });
  const punt = (nr: string, tekst: string): ContractBlok => ({ soort: "punt", nr, tekst });

  const uit: ContractBlok[] = [];

  uit.push(kop("DE ONDERGETEKENDEN:"));
  uit.push(
    alinea(
      `${c.employerName}, kantoorhoudende te Amsterdam${c.employerKvk ? ` (KVK ${c.employerKvk})` : ""}, ` +
        `als uitzendonderneming en formeel werkgever, hierna "ZekerFlex";`,
    ),
  );
  uit.push(alinea("en"));
  uit.push(alinea(`${c.workerName}${c.workerBsnLast4 ? `, BSN eindigend op ${c.workerBsnLast4}` : ""}, ` + `hierna "de Uitzendkracht";`));
  uit.push(alinea('Hierna gezamenlijk "Partijen".'));

  uit.push(kop("IN AANMERKING NEMENDE DAT:"));
  [
    "ZekerFlex een uitzendonderneming is die uitzendkrachten ter beschikking stelt aan opdrachtgevers om onder leiding en toezicht van die opdrachtgever werkzaamheden te verrichten;",
    "de Uitzendkracht zich via het platform van ZekerFlex beschikbaar stelt voor uitzendklussen en wenst te werken op basis van een uitzendovereenkomst;",
    "Partijen de ABU-cao voor Uitzendkrachten van toepassing verklaren op deze overeenkomst;",
    "deze overeenkomst een uitzendovereenkomst is in de zin van artikel 7:690 BW.",
  ].forEach((t, i) => uit.push(punt(`${i + 1}.`, t)));

  uit.push(kop("Artikel 1 - Aard van de overeenkomst"));
  uit.push(punt("1.", "De Uitzendkracht treedt in dienst van ZekerFlex en wordt door ZekerFlex ter beschikking gesteld aan opdrachtgevers om onder hun leiding en toezicht werkzaamheden te verrichten."));
  uit.push(punt("2.", "Er ontstaat pas een dienstverband voor de duur van een klus zodra de Uitzendkracht via het platform een klus accepteert en de opdrachtgever de Uitzendkracht selecteert. Buiten die klussen om bestaat geen loondoorbetalingsverplichting."));
  uit.push(punt("3.", "Op deze overeenkomst is het uitzendbeding van toepassing (fase A): de terbeschikkingstelling en daarmee het dienstverband eindigen van rechtswege wanneer de opdrachtgever de klus beeindigt of de klus is voltooid."));

  uit.push(kop("Artikel 2 - Duur"));
  uit.push(punt("1.", `Deze overeenkomst gaat in op ${nlDate(c.validFrom)} en is geldig tot en met ${nlDate(c.validUntil)} (${CONTRACT_MONTHS_LABEL}).`));
  uit.push(punt("2.", "Binnen deze periode kan de Uitzendkracht klussen doen voor alle opdrachtgevers op het platform. Om na afloop door te werken, ondertekent de Uitzendkracht een nieuwe uitzendovereenkomst."));
  uit.push(punt("3.", `De Uitzendkracht bevindt zich bij ondertekening in fase ${c.phase} van het ABU-fasensysteem (${c.weeksWorked} gewerkte weken). De rechten en zekerheid groeien mee met het aantal gewerkte weken.`));

  uit.push(kop("Artikel 3 - Arbeidsvoorwaarden en cao"));
  uit.push(punt("1.", "De inlenersbeloning van de opdrachtgever is van toepassing: de Uitzendkracht ontvangt hetzelfde loon, dezelfde toeslagen en dezelfde kostenvergoedingen als een werknemer in gelijke functie bij de opdrachtgever."));
  uit.push(punt("2.", "Voor het overige geldt de ABU-cao voor Uitzendkrachten."));

  uit.push(kop("Artikel 4 - Loon en reserveringen"));
  uit.push(punt("1.", "Het loon wordt per kalenderweek berekend en uitbetaald nadat de opdrachtgever de gewerkte uren heeft goedgekeurd. De Uitzendkracht ontvangt elke week een digitale loonstrook."));
  uit.push(punt("2.", "Over het loon worden loonheffing en premies ingehouden en afgedragen door ZekerFlex."));
  uit.push(punt("3.", "De Uitzendkracht bouwt 8,33% vakantiegeld en circa 10,83% vakantie-uren op; deze reserveringen staan apart op de loonstrook en worden op verzoek uitgekeerd."));
  uit.push(punt("4.", "ZekerFlex kan direct na goedkeuring een voorschot op het nettoloon uitbetalen; dit wordt automatisch verrekend met de wekelijkse loonbetaling."));

  uit.push(kop("Artikel 5 - Pensioen (StiPP)"));
  uit.push(punt("1.", "Vanaf de negende gewerkte week neemt de Uitzendkracht deel aan de StiPP-basisregeling; na 78 gewerkte weken aan de StiPP-plusregeling. ZekerFlex draagt het werkgeversdeel af."));

  uit.push(kop("Artikel 6 - Ziekte"));
  uit.push(punt("1.", "Bij ziekte tijdens een klus meldt de Uitzendkracht zich direct ziek bij ZekerFlex en de opdrachtgever. De Uitzendkracht hoeft zelf geen vervanging te regelen; loondoorbetaling bij ziekte verloopt volgens de cao en de Ziektewet via ZekerFlex."));

  uit.push(kop("Artikel 7 - Einde van de overeenkomst"));
  uit.push(punt("1.", "De overeenkomst eindigt van rechtswege op de einddatum genoemd in artikel 2, of eerder wanneer het uitzendbeding in werking treedt (artikel 1 lid 3)."));
  uit.push(punt("2.", "Buiten een lopende klus kunnen beide Partijen de samenwerking op elk moment beeindigen door dit via het platform kenbaar te maken."));

  uit.push(kop("Artikel 8 - Overige bepalingen"));
  uit.push(punt("1.", "De Uitzendkracht kan zich te allen tijde legitimeren met een geldig identiteitsbewijs en beschikt over een geldige verblijfs- en werkvergunning voor Nederland."));
  uit.push(punt("2.", "De Gebruiksvoorwaarden van ZekerFlex en het privacybeleid zijn van toepassing."));
  uit.push(punt("3.", "Op deze overeenkomst is Nederlands recht van toepassing."));

  uit.push(kop("Ondertekening"));
  if (opties.voorbeeld) {
    uit.push(alinea(`Dit is een voorbeeld: ${c.workerName} heeft deze uitzendovereenkomst nog niet ondertekend. Door in de ZekerFlex-app op "Ondertekenen" te klikken aanvaardt de Uitzendkracht haar elektronisch, op dat moment.`));
    uit.push(alinea(`${c.employerName} aanvaardt deze uitzendovereenkomst op datzelfde moment langs elektronische weg namens de uitzendonderneming.`));
    uit.push({ soort: "ruimte" });
    uit.push({ soort: "klein", tekst: "Partijen gaan deze overeenkomst langs elektronische weg aan; een handgeschreven handtekening is niet vereist. Het tijdstip van het klikken op \"Ondertekenen\" geldt als moment van ondertekening." });
  } else {
    uit.push(
      alinea(
        `De Uitzendkracht, ${c.workerName}, heeft deze uitzendovereenkomst elektronisch aanvaard door op ` +
          `${nlLongTime(c.signedAt)} in de ZekerFlex-app op "Ondertekenen" te klikken.`,
      ),
    );
    uit.push(
      alinea(
        `${c.employerName} heeft deze uitzendovereenkomst op datzelfde moment langs elektronische weg ` +
          `namens de uitzendonderneming aanvaard.`,
      ),
    );
    uit.push({ soort: "ruimte" });
    uit.push({
      soort: "klein",
      tekst: "Partijen zijn deze overeenkomst langs elektronische weg aangegaan; een handgeschreven handtekening is niet vereist. Het hierboven vermelde tijdstip geldt als moment van ondertekening.",
    });
  }
  return uit;
}

/** Het pakket voor het scherm. */
export function uitzendContractTekst(c: UitzendContract, opties: { voorbeeld?: boolean } = {}): ContractTekst {
  return {
    voorbeeld: Boolean(opties.voorbeeld),
    referentie: c.reference,
    titel: opties.voorbeeld ? "Uitzendovereenkomst (voorbeeld)" : "Uitzendovereenkomst",
    gegevens: { fase: c.phase, weken: c.weeksWorked, van: c.validFrom, tot: c.validUntil, ondertekend: opties.voorbeeld ? null : c.signedAt },
    blokken: uitzendContractBlokken(c, opties),
  };
}
