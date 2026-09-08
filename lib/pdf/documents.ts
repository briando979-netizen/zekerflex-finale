import { prisma } from "@/lib/prisma";
import { SimplePdf } from "@/lib/pdf/simple";
import type { UitzendContract } from "@/lib/agreements/uitzend-contract";

const euro = (c: number) => `EUR ${(c / 100).toFixed(2).replace(".", ",")}`;
const nlDate = (d: Date | string) => new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });

const VAT_LABEL: Record<string, string> = {
  STANDARD_RATE: "21% btw",
  REVERSE_CHARGE: "Btw verlegd",
  OUT_OF_SCOPE: "Buiten reikwijdte btw",
  ZERO_RATE: "0% btw",
};

const TYPE_LABEL: Record<string, string> = {
  SELF_BILL_FREELANCER: "Dienstfactuur (self-billing)",
  PLATFORM_FEE: "Platformkosten",
  REVERSE_BILL_CLIENT: "Factuur opdrachtgever",
};

/** Build an A4 PDF for a single invoice. Returns null if not found. */
export async function invoicePdf(invoiceId: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: true,
      issuerTenant: { select: { name: true } },
      recipientTenant: { select: { name: true } },
      timesheet: { select: { scheduledStart: true, branch: { select: { name: true } } } },
      payment: { select: { status: true, settledAt: true, amountCents: true } },
    },
  });
  if (!inv) return null;

  let issuerName = inv.issuerTenant?.name ?? "ZekerFlex";
  if (inv.issuerFreelancerId) {
    const fp = await prisma.freelancerProfile.findUnique({
      where: { id: inv.issuerFreelancerId },
      select: { user: { select: { fullName: true } }, kvkNumber: true, vatNumber: true },
    });
    if (fp) issuerName = `${fp.user.fullName}${fp.kvkNumber ? ` — KVK ${fp.kvkNumber}` : ""}`;
  }

  const pdf = new SimplePdf();
  pdf.heading("ZekerFlex", 20);
  pdf.line(TYPE_LABEL[inv.type] ?? inv.type, 11, { color: [0.05, 0.36, 0.29] });
  pdf.gap(8);
  pdf.rule();

  pdf.row("Factuurnummer", inv.number, { bold: true });
  pdf.row("Datum", nlDate(inv.issuedAt ?? inv.createdAt));
  pdf.row("Van", issuerName);
  pdf.row("Aan", inv.recipientTenant.name);
  if (inv.timesheet) {
    pdf.row("Werkdag", nlDate(inv.timesheet.scheduledStart));
    pdf.row("Locatie", inv.timesheet.branch.name);
  }
  pdf.gap(6);
  pdf.rule();

  pdf.line("Omschrijving", 10, { bold: true });
  pdf.gap(2);
  for (const l of inv.lines) {
    pdf.row(
      `${l.description}${l.quantity ? `  (${l.quantity.toFixed(2).replace(".", ",")} u x ${euro(l.unitPriceCents)})` : ""}`,
      euro(l.amountCents),
    );
  }
  pdf.gap(4);
  pdf.rule();

  pdf.row("Subtotaal", euro(inv.subtotalCents));
  pdf.row(VAT_LABEL[inv.vatTreatment] ?? "Btw", euro(inv.vatCents));
  pdf.row("Totaal", euro(inv.totalCents), { bold: true, size: 12 });

  pdf.gap(14);
  if (inv.payment) {
    const paid = inv.payment.status === "SETTLED";
    pdf.line(
      paid
        ? `Betaald${inv.payment.settledAt ? ` op ${nlDate(inv.payment.settledAt)}` : ""} via SEPA.`
        : "Betaalstatus: in behandeling.",
      9.5,
      { color: paid ? [0.05, 0.45, 0.2] : [0.45, 0.35, 0.05] },
    );
  }
  pdf.gap(18);
  pdf.line(
    "Deze factuur is automatisch aangemaakt door ZekerFlex (reverse billing / self-billing).",
    8.5,
    { color: [0.4, 0.45, 0.42] },
  );
  pdf.line("ZekerFlex Sovereign Box — 100% in Nederland gehost.", 8.5, { color: [0.4, 0.45, 0.42] });

  return { bytes: pdf.toBuffer(), filename: `${inv.number}.pdf` };
}

const nlLong = (d: Date | string) =>
  new Date(d).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const nlLongTime = (d: Date | string) =>
  `${nlLong(d)} om ${new Date(d).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
const ddmmyyyy = (d: Date | string) => new Date(d).toLocaleDateString("nl-NL");

const CANCEL_HOURS = 24;

/**
 * Build the full A4 modelovereenkomst PDF — the same legal structure as a
 * Belastingdienst-beoordeelde modelovereenkomst (opdracht / uitvoering /
 * vervanging / vergoeding / duur / belastingen / annulering / overig /
 * eigendommen / geheimhouding / rechtskeuze) filled with this engagement's data.
 */
export async function agreementPdf(agreementId: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const a = await prisma.modelAgreement.findUnique({
    where: { id: agreementId },
    include: {
      shift: { select: { title: true, startsAt: true, breakMinutes: true } },
      tenant: { select: { name: true } },
      branch: { select: { addressLine: true, postalCode: true, city: true } },
    },
  });
  if (!a) return null;

  const contractor = a.freelancerLegalName || "Opdrachtnemer";
  const clientName = a.clientLegalName || a.tenant?.name || "Opdrachtgever";
  const clientCity = a.branch?.city || "Nederland";
  const opdrachtTitel = a.scopeDescription || a.shift?.title || "de klus";
  const uitvoerDatum = a.shift ? ddmmyyyy(a.shift.startsAt) + " " + new Date(a.shift.startsAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "de overeengekomen datum";
  const rate = a.hourlyRateCents ? euro(a.hourlyRateCents) : "het overeengekomen tarief";
  const regNr = a.belastingdienstNr || `${a.templateKey} (${a.templateVersion})`;
  const cancelDeadline = a.shift ? new Date(a.shift.startsAt.getTime() - CANCEL_HOURS * 3_600_000) : null;

  const pdf = new SimplePdf();
  pdf.heading("Overeenkomst tussen Opdrachtnemer en Opdrachtgever", 16);
  pdf.line(`Referentie ${a.reference}`, 9.5, { color: [0.05, 0.36, 0.29] });
  pdf.gap(6);

  pdf.section("ONDERGETEKENDEN:");
  pdf.paragraph(
    `${contractor}, in dezen rechtsgeldig vertegenwoordigd${a.freelancerKvkNumber ? ` (KVK ${a.freelancerKvkNumber})` : ""}, hierna te noemen "Opdrachtnemer";`,
  );
  pdf.paragraph("En");
  pdf.paragraph(
    `${clientName} gevestigd en kantoorhoudende te ${clientCity}${a.clientKvkNumber ? `, KVK ${a.clientKvkNumber}` : ""}, te dezen rechtsgeldig vertegenwoordigd, hierna te noemen "Opdrachtgever",`,
  );
  pdf.paragraph('Hierna gezamenlijk ook aangeduid als "Partijen".');

  pdf.section("IN AANMERKING NEMENDE DAT:");
  [
    `Opdrachtgever Opdrachtnemer in wil zetten voor de Opdracht getiteld ${opdrachtTitel};`,
    "Opdrachtnemer beschikt over de voor het verrichten van de Opdracht benodigde kennis en ervaring;",
    'Opdrachtgever wenst de opdracht aan Opdrachtnemer te verstrekken om buiten dienstverband voor hem werkzaamheden te verrichten onder de voorwaarden zoals overeengekomen in deze overeenkomst (hierna: "de Overeenkomst");',
    "Opdrachtnemer vrij is in het al dan niet sluiten van overeenkomsten van opdracht met andere opdrachtgevers;",
    "De Overeenkomst door Opdrachtgever en Opdrachtnemer wordt gekwalificeerd als een overeenkomst van opdracht in de zin van artikel 7:400 BW, waarbij Opdrachtnemer de werkzaamheden uitvoert in de zelfstandige uitoefening van zijn beroep/bedrijf en de bepalingen van Titel 7 van Boek 7 BW op de Overeenkomst van toepassing zijn behoudens indien en voor zover daarvan door Partijen in de Overeenkomst is afgeweken;",
    "Partijen ervoor kiezen om in voorkomende gevallen de fictieve dienstbetrekking van thuiswerkers of gelijkgestelden zoals bedoeld in de artikelen 2b en 2c Uitvoeringsbesluit Loonbelasting 1965 buiten toepassing te laten en daartoe deze Overeenkomst opstellen en ondertekenen voordat uitbetaling plaatsvindt;",
    `Deze Overeenkomst gebaseerd is op de door de Belastingdienst beoordeelde modelovereenkomst met kenmerk ${regNr};`,
    "Opdrachtnemer zich ervan bewust is dat hij op grond van de Overeenkomst geen aanspraken kan maken op pensioen en/of andere oudedagsvoorzieningen en/of uitkeringen ter zake van arbeidsongeschiktheid jegens Opdrachtgever en daarvan, voor zover nodig, hierbij uitdrukkelijk afstand doet;",
    "Opdrachtgever en Opdrachtnemer verklaren hierbij dat de Gebruiksvoorwaarden van ZekerFlex en de daarin opgenomen definities van toepassing zijn op de Overeenkomst.",
  ].forEach((t, i) => pdf.item(`${i + 1}.`, t));

  pdf.section("Artikel 1 - Opdracht");
  pdf.item("1.", "De Opdracht is de klus zoals omschreven in de door Opdrachtgever geplaatste omschrijving op de Website van ZekerFlex. De Opdracht wordt aangegaan voor de duur van een klus die maximaal 24 uur duurt.");
  pdf.item("2.", "Opdrachtgever verklaart zich er uitdrukkelijk mee akkoord dat Opdrachtnemer ook ten behoeve van andere opdrachtgevers werkzaamheden verricht.");
  pdf.item("3.", "Opdrachtgever wenst gebruik te maken van de kennis en ervaring van Opdrachtnemer. Daartoe verleent Opdrachtgever aan Opdrachtnemer de Opdracht om in het kader van de uitoefening van zijn beroep en/of bedrijf de werkzaamheden door Opdrachtnemer te laten verrichten.");

  pdf.section("Artikel 2 - Uitvoering van de Opdracht");
  pdf.item("1.", `Opdrachtnemer accepteert de Opdracht "${opdrachtTitel}", uit te voeren op ${uitvoerDatum}, en aanvaardt daarmee de volle verantwoordelijkheid voor het op juiste wijze uitvoeren van de overeengekomen werkzaamheden.`);
  pdf.item("2.", "Opdrachtnemer deelt zijn werkzaamheden zelfstandig in. Wel vindt, voor zover dat voor de uitvoering van de Opdracht nodig is, afstemming met Opdrachtgever plaats in geval van samenwerking met anderen. Indien noodzakelijk voor de werkzaamheden richt Opdrachtnemer zich naar de arbeidstijden bij Opdrachtgever.");
  pdf.item("3.", "Opdrachtgever verstrekt Opdrachtnemer alle bevoegdheid en informatie benodigd voor een goede uitvoering van de opdracht.");
  pdf.item("4.", "Opdrachtnemer is bij het uitvoeren van de overeengekomen werkzaamheden geheel zelfstandig. Hij/zij verricht de overeengekomen werkzaamheden naar eigen inzicht en zonder toezicht of leiding van Opdrachtgever. Opdrachtgever kan wel aanwijzingen en instructies geven omtrent het beoogde resultaat van de Opdracht.");
  pdf.item("5.", "Opdrachtnemer zal voor een ieder geldende veiligheidsregels, veiligheidsvoorschriften en andere (huis-)regels respecteren, zowel op de locatie van Opdrachtgever zelf als op de locatie van derde(n) waar de Opdracht wordt uitgevoerd.");

  pdf.section("Artikel 3 - Vervanging");
  pdf.item("1.", "Indien Opdrachtnemer voorziet dat hij vanwege onvoorziene omstandigheden de verplichtingen in verband met de Opdracht niet, niet tijdig, niet naar behoren of niet geheel kan nakomen, dan dient Opdrachtnemer Opdrachtgever hiervan onmiddellijk op de hoogte te stellen.");
  pdf.item("2.", "Het staat Opdrachtnemer vrij zich bij de werkzaamheden te laten vervangen door een opdrachtnemer die actief is op het platform van ZekerFlex en hierop een profiel heeft, dit in overleg met en na goedkeuring van Opdrachtgever. De aangedragen vervanging dient minstens over dezelfde ervaring en vaardigheden te beschikken als de Opdrachtnemer zelf. Indien Partijen niet tot een akkoord komen over de vervanging of de vervanging wordt te laat aangedragen, dan staat het Opdrachtgever vrij de Opdracht kosteloos in te trekken en opnieuw op het platform te plaatsen.");
  pdf.item("3.", "Opdrachtnemer blijft verantwoordelijk voor de uitvoering van de Opdracht en de naleving van al hetgeen in de Overeenkomst wordt bepaald, en garandeert dat de ingeschakelde derde bekend is met de bepalingen in deze Overeenkomst.");

  pdf.section("Artikel 4 - Vergoeding");
  pdf.item("1.", "Opdrachtgever en Opdrachtnemer spreken na overleg een vergoeding af die verschuldigd is voor de uitvoering van de Opdracht. Opdrachtgever blijft onder alle omstandigheden verantwoordelijk voor nakoming van deze betalingsverplichting aan Opdrachtnemer.");
  pdf.item("2.", `Voor het verrichten van de werkzaamheden ontvangt Opdrachtnemer een vergoeding van ${rate} per uur, exclusief btw en andere heffingen die van overheidswege worden opgelegd.`);
  pdf.item("3.", "Opdrachtnemer ontvangt uitdrukkelijk geen vergoeding ter zake van uren waarin geen werkzaamheden ten behoeve van Opdrachtgever worden verricht, zoals tijdens ziekte en verlof. Bij arbeidsongeschiktheid bestaat geen aanspraak op enige betaling door Opdrachtgever.");

  pdf.section("Artikel 5 - Duur en beeindiging");
  pdf.item("1.", "De Overeenkomst wordt aangegaan voor de duur van de Opdracht en eindigt van rechtswege wanneer de Opdracht is uitgevoerd.");
  pdf.item("2.", "Partijen hebben het recht de Overeenkomst met onmiddellijke ingang te beeindigen zonder ingebrekestelling indien een Partij surseance van betaling aanvraagt of failliet wordt verklaard, in een blijvende toestand van betalingsonmacht verkeert of wordt ontbonden, dan wel bij onvoorziene omstandigheden of een onrechtmatige daad waardoor instandhouding van de Overeenkomst niet langer verlangd kan worden.");
  pdf.item("3.", "De Overeenkomst eindigt met onmiddellijke ingang bij overlijden van Opdrachtnemer.");
  pdf.item("4.", "ZekerFlex faciliteert een marktplaats waar Opdrachtgevers Opdrachten plaatsen en Opdrachtnemers hierop reageren en over de voorwaarden onderhandelen. ZekerFlex is geen partij bij de Overeenkomst en niet betrokken bij de keuze van Opdrachtgever voor Opdrachtnemer of de uitvoering van de Opdracht.");

  pdf.section("Artikel 6 - Belastingen en sociale premies");
  pdf.item("1.", "Opdrachtnemer vrijwaart Opdrachtgever van eventuele naheffingen voor loonbelasting en premie volksverzekeringen. Deze vrijwaring vervalt indien naheffingen (mede) door een handelen of nalaten van Opdrachtgever aan Opdrachtgever zelf te wijten zijn.");
  pdf.item("2.", "Opdrachtnemer draagt zelf zorg voor de afdracht van de over het honorarium verschuldigde belastingen en premies van welke aard dan ook in verband met deze Overeenkomst.");

  pdf.section("Artikel 7 - Annulering");
  pdf.item("1.", "Opdrachtgever bepaalt bij het plaatsen van de Opdracht tot welk moment de Opdracht kosteloos mag worden geannuleerd door Opdrachtnemer. Opdrachtnemer gaat hiermee akkoord bij het accepteren van de Opdracht.");
  pdf.item("2.", cancelDeadline
    ? `Voor deze Opdracht geldt een annuleringstermijn van ${CANCEL_HOURS} uur: Partijen kunnen de Opdracht uiterlijk tot ${nlLongTime(cancelDeadline)} kosteloos annuleren.`
    : `Voor deze Opdracht geldt een annuleringstermijn van ${CANCEL_HOURS} uur voor aanvang van de Opdracht.`);
  pdf.item("3.", "Indien Opdrachtgever de Opdracht na verloop van de geldende annuleringstermijn annuleert, mag Opdrachtnemer 50% van de totale uren minus pauze, zoals vastgesteld op het platform van ZekerFlex, claimen.");
  pdf.item("4.", "Indien Opdrachtnemer de Overeenkomst na het verloop van de annuleringstermijn wenst te annuleren, is deze gehouden vervanging te regelen volgens artikel 3. Wordt geen vervanging verzorgd, dan meldt Opdrachtgever dit officieel en wordt dit op het profiel van Opdrachtnemer weergegeven als een no-show.");
  pdf.item("5.", "Indien Opdrachtgever de klus beeindigt voordat het overeengekomen aantal uren is gewerkt, heeft Opdrachtnemer recht op 100% betaling van de overeengekomen uren.");
  pdf.item("6.", "Indien Opdrachtnemer niet is komen opdagen, zich niet kan of wil identificeren, of niet blijkt te beschikken over de op de Website aangegeven vereisten, staat het Opdrachtgever vrij om overeengekomen klussen te annuleren en/of te beeindigen zonder dat recht op een annuleringsvergoeding ontstaat.");

  pdf.section("Artikel 8 - Overige bepalingen");
  pdf.item("1.", "Eventuele algemene voorwaarden van Opdrachtgever en Opdrachtnemer zijn niet van toepassing en worden uitdrukkelijk van de hand gewezen, tenzij expliciet als aanvullende voorwaarden overeengekomen.");
  pdf.item("2.", "Opdrachtnemer (of diens vervanger) dient zich te allen tijde te kunnen legitimeren tegenover Opdrachtgever met een geldig legitimatiebewijs en beschikt indien nodig over een vergunning om arbeid te verrichten in Nederland.");
  pdf.item("3.", "Wijzigingen van en/of aanvullingen op de Overeenkomst kunnen uitsluitend schriftelijk door Partijen worden overeengekomen.");
  pdf.item("4.", "Indien enige bepaling nietig is of vernietigd wordt, blijven de overige bepalingen van kracht en treden Partijen in overleg over een vervangende bepaling die zoveel mogelijk het doel en de strekking van de nietige bepaling benadert.");

  pdf.section("Artikel 9 - Eigendommen");
  pdf.item("1.", "Alle bedrijfseigendommen die Opdrachtnemer gedurende deze Overeenkomst onder zich krijgt, blijven eigendom van Opdrachtgever. Opdrachtnemer retourneert alle eigendommen uiterlijk 2 dagen na de dag waarop de Overeenkomst van rechtswege eindigt.");

  pdf.section("Artikel 10 - Geheimhouding");
  pdf.item("1.", "Behoudens schriftelijke toestemming van Opdrachtgever zal Opdrachtnemer geen informatie over (a) de (onderneming van de) Opdrachtgever en (b) deze Overeenkomst aan derden openbaren, tenzij een wettelijke of gerechtelijke verplichting daartoe bestaat.");

  pdf.section("Artikel 11 - Rechtskeuze en bevoegde rechter");
  pdf.item("1.", "Op de Overeenkomst is Nederlands recht van toepassing.");
  pdf.item("2.", "Alle geschillen die tussen Partijen uit de Overeenkomst voortvloeien, worden voorgelegd aan de bevoegde rechter.");

  pdf.section("Ondertekening");
  pdf.paragraph(
    a.freelancerSignedAt
      ? `Opdrachtnemer, ${contractor}, heeft deze Overeenkomst elektronisch aanvaard door op ${nlLongTime(a.freelancerSignedAt)} via het platform van ZekerFlex op de Opdracht te reageren en akkoord te gaan met deze modelovereenkomst.`
      : `Opdrachtnemer, ${contractor}, heeft deze Overeenkomst nog niet aanvaard.`,
  );
  pdf.paragraph(
    a.clientSignedAt
      ? `Opdrachtgever, ${clientName}, heeft deze Overeenkomst elektronisch aanvaard door op ${nlLongTime(a.clientSignedAt)} via het platform van ZekerFlex Opdrachtnemer voor deze Opdracht te selecteren.`
      : `Opdrachtgever, ${clientName}, heeft deze Overeenkomst nog niet aanvaard.`,
  );
  pdf.gap(4);
  pdf.paragraph(
    "Partijen hebben deze Overeenkomst langs elektronische weg gesloten. De hierboven vermelde tijdstippen gelden als moment van ondertekening; een handgeschreven handtekening is niet vereist.",
    9,
    { color: [0.4, 0.45, 0.42] },
  );
  pdf.gap(10);
  pdf.line("ZekerFlex bewaakt doorlopend de Wet DBA-signalen voor deze samenwerking.", 8.5, {
    color: [0.4, 0.45, 0.42],
  });

  return { bytes: pdf.toBuffer(), filename: `${a.reference}.pdf` };
}

/**
 * Uitzendovereenkomst (fase-systeem, ABU-cao) tussen ZekerFlex als formeel
 * werkgever en de uitzendkracht. Elektronisch ondertekend bij het aanmaken.
 */
export function uitzendContractPdf(c: UitzendContract): { bytes: Buffer; filename: string } {
  const pdf = new SimplePdf();
  pdf.heading("Uitzendovereenkomst", 16);
  pdf.line(`Referentie ${c.reference}`, 9.5, { color: [0.05, 0.36, 0.29] });
  pdf.gap(6);

  pdf.section("DE ONDERGETEKENDEN:");
  pdf.paragraph(
    `${c.employerName}, kantoorhoudende te Amsterdam${c.employerKvk ? ` (KVK ${c.employerKvk})` : ""}, ` +
      `als uitzendonderneming en formeel werkgever, hierna "ZekerFlex";`,
  );
  pdf.paragraph("en");
  pdf.paragraph(
    `${c.workerName}${c.workerBsnLast4 ? `, BSN eindigend op ${c.workerBsnLast4}` : ""}, ` +
      `hierna "de Uitzendkracht";`,
  );
  pdf.paragraph('Hierna gezamenlijk "Partijen".');

  pdf.section("IN AANMERKING NEMENDE DAT:");
  [
    "ZekerFlex een uitzendonderneming is die uitzendkrachten ter beschikking stelt aan opdrachtgevers om onder leiding en toezicht van die opdrachtgever werkzaamheden te verrichten;",
    "de Uitzendkracht zich via het platform van ZekerFlex beschikbaar stelt voor uitzendklussen en wenst te werken op basis van een uitzendovereenkomst;",
    "Partijen de ABU-cao voor Uitzendkrachten van toepassing verklaren op deze overeenkomst;",
    "deze overeenkomst een uitzendovereenkomst is in de zin van artikel 7:690 BW.",
  ].forEach((t, i) => pdf.item(`${i + 1}.`, t));

  pdf.section("Artikel 1 - Aard van de overeenkomst");
  pdf.item("1.", "De Uitzendkracht treedt in dienst van ZekerFlex en wordt door ZekerFlex ter beschikking gesteld aan opdrachtgevers om onder hun leiding en toezicht werkzaamheden te verrichten.");
  pdf.item("2.", "Er ontstaat pas een dienstverband voor de duur van een klus zodra de Uitzendkracht via het platform een klus accepteert en de opdrachtgever de Uitzendkracht selecteert. Buiten die klussen om bestaat geen loondoorbetalingsverplichting.");
  pdf.item("3.", "Op deze overeenkomst is het uitzendbeding van toepassing (fase A): de terbeschikkingstelling en daarmee het dienstverband eindigen van rechtswege wanneer de opdrachtgever de klus beeindigt of de klus is voltooid.");

  pdf.section("Artikel 2 - Duur");
  pdf.item("1.", `Deze overeenkomst gaat in op ${nlDate(c.validFrom)} en is geldig tot en met ${nlDate(c.validUntil)} (${CONTRACT_MONTHS_LABEL}).`);
  pdf.item("2.", "Binnen deze periode kan de Uitzendkracht klussen doen voor alle opdrachtgevers op het platform. Om na afloop door te werken, ondertekent de Uitzendkracht een nieuwe uitzendovereenkomst.");
  pdf.item("3.", `De Uitzendkracht bevindt zich bij ondertekening in fase ${c.phase} van het ABU-fasensysteem (${c.weeksWorked} gewerkte weken). De rechten en zekerheid groeien mee met het aantal gewerkte weken.`);

  pdf.section("Artikel 3 - Arbeidsvoorwaarden en cao");
  pdf.item("1.", "De inlenersbeloning van de opdrachtgever is van toepassing: de Uitzendkracht ontvangt hetzelfde loon, dezelfde toeslagen en dezelfde kostenvergoedingen als een werknemer in gelijke functie bij de opdrachtgever.");
  pdf.item("2.", "Voor het overige geldt de ABU-cao voor Uitzendkrachten.");

  pdf.section("Artikel 4 - Loon en reserveringen");
  pdf.item("1.", "Het loon wordt per kalenderweek berekend en uitbetaald nadat de opdrachtgever de gewerkte uren heeft goedgekeurd. De Uitzendkracht ontvangt elke week een digitale loonstrook.");
  pdf.item("2.", "Over het loon worden loonheffing en premies ingehouden en afgedragen door ZekerFlex.");
  pdf.item("3.", "De Uitzendkracht bouwt 8,33% vakantiegeld en circa 10,83% vakantie-uren op; deze reserveringen staan apart op de loonstrook en worden op verzoek uitgekeerd.");
  pdf.item("4.", "ZekerFlex kan direct na goedkeuring een voorschot op het nettoloon uitbetalen; dit wordt automatisch verrekend met de wekelijkse loonbetaling.");

  pdf.section("Artikel 5 - Pensioen (StiPP)");
  pdf.item("1.", "Vanaf de negende gewerkte week neemt de Uitzendkracht deel aan de StiPP-basisregeling; na 78 gewerkte weken aan de StiPP-plusregeling. ZekerFlex draagt het werkgeversdeel af.");

  pdf.section("Artikel 6 - Ziekte");
  pdf.item("1.", "Bij ziekte tijdens een klus meldt de Uitzendkracht zich direct ziek bij ZekerFlex en de opdrachtgever. De Uitzendkracht hoeft zelf geen vervanging te regelen; loondoorbetaling bij ziekte verloopt volgens de cao en de Ziektewet via ZekerFlex.");

  pdf.section("Artikel 7 - Einde van de overeenkomst");
  pdf.item("1.", "De overeenkomst eindigt van rechtswege op de einddatum genoemd in artikel 2, of eerder wanneer het uitzendbeding in werking treedt (artikel 1 lid 3).");
  pdf.item("2.", "Buiten een lopende klus kunnen beide Partijen de samenwerking op elk moment beeindigen door dit via het platform kenbaar te maken.");

  pdf.section("Artikel 8 - Overige bepalingen");
  pdf.item("1.", "De Uitzendkracht kan zich te allen tijde legitimeren met een geldig identiteitsbewijs en beschikt over een geldige verblijfs- en werkvergunning voor Nederland.");
  pdf.item("2.", "De Gebruiksvoorwaarden van ZekerFlex en het privacybeleid zijn van toepassing.");
  pdf.item("3.", "Op deze overeenkomst is Nederlands recht van toepassing.");

  pdf.section("Ondertekening");
  pdf.paragraph(
    `De Uitzendkracht, ${c.workerName}, heeft deze uitzendovereenkomst elektronisch aanvaard door op ` +
      `${nlLongTime(c.signedAt)} in de ZekerFlex-app op "Ondertekenen" te klikken.`,
  );
  pdf.paragraph(
    `${c.employerName} heeft deze uitzendovereenkomst op datzelfde moment langs elektronische weg ` +
      `namens de uitzendonderneming aanvaard.`,
  );
  pdf.gap(4);
  pdf.paragraph(
    "Partijen zijn deze overeenkomst langs elektronische weg aangegaan; een handgeschreven handtekening is niet vereist. Het hierboven vermelde tijdstip geldt als moment van ondertekening.",
    9,
    { color: [0.4, 0.45, 0.42] },
  );

  const safe = c.reference.replace(/[^a-z0-9-]+/gi, "-");
  return { bytes: pdf.toBuffer(), filename: `${safe}.pdf` };
}

const CONTRACT_MONTHS_LABEL = "3 kalendermaanden";

/**
 * A blank ZekerFlex modelovereenkomst addressed to one person — used by
 * admins from the gebruikersdetail ("Maak overeenkomst") when there is no
 * specific dienst/opdracht yet to hang a real ModelAgreement record on.
 * Not signed, not stored — a ready document for the admin to send onward.
 */
export function blankAgreementPdf(personName: string): { bytes: Buffer; filename: string } {
  const pdf = new SimplePdf();
  pdf.heading("Modelovereenkomst", 20);
  pdf.line(`Opgesteld voor ${personName}`, 11, { color: [0.05, 0.36, 0.29] });
  pdf.gap(8);
  pdf.rule();

  pdf.row("Opdrachtnemer", personName);
  pdf.row("Platform", "ZekerFlex B.V.");
  pdf.row("Opgesteld op", nlDate(new Date()));
  pdf.row("Status", "concept — nog niet gekoppeld aan een opdracht");
  pdf.gap(10);
  pdf.rule();

  pdf.line(
    "Deze overeenkomst is gebaseerd op een door de Belastingdienst beoordeelde modelovereenkomst.",
    9.5,
  );
  pdf.line(
    "Werken volgens deze overeenkomst betekent: vrije vervanging is toegestaan, geen gezagsverhouding,",
    9.5,
  );
  pdf.line("en de opdrachtnemer werkt voor eigen rekening en risico.", 9.5);
  pdf.gap(10);
  pdf.line(
    "Zodra deze opdrachtnemer een dienst accepteert, genereert ZekerFlex automatisch de definitieve,",
    9.5,
  );
  pdf.line("aan die opdracht gekoppelde overeenkomst — inclusief tarief, opdrachtgever en handtekeningen.", 9.5);
  pdf.gap(14);
  pdf.line("ZekerFlex bewaakt doorlopend de Wet DBA-signalen voor elke samenwerking.", 8.5, {
    color: [0.4, 0.45, 0.42],
  });

  const safeName = personName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return { bytes: pdf.toBuffer(), filename: `modelovereenkomst-${safeName || "concept"}.pdf` };
}
