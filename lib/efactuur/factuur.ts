import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { amsterdamDayKey, amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { efactuurInstellingen, platformPartij, splitsPeppolId } from "@/lib/efactuur/instellingen";
import { bouwUbl, btwCategorieVoor, ublBestandsnaam, valideerUbl, type UblFactuur, type UblPartij, type UblRegel } from "@/lib/efactuur/ubl";

// ---------------------------------------------------------------------------
// Van een factuur in de database naar een UBL-e-factuur. De factuur zelf is al
// definitief (nummer, regels, btw); dit bestand zoekt er alleen de partijen bij:
//   - platformfacturen (platformkosten, uitzend, annulering): verkoper = ZekerFlex
//     uit de omgeving, koper = het bedrijf (KVK/btw uit het Handelsregister);
//   - self-billing (de zzp-factuur die wij namens de werker maken): verkoper =
//     de werker, koper = het bedrijf, soort 389 zodat het pakket weet dat de
//     koper hem heeft opgemaakt.
// Niets wordt bewaard: de XML volgt altijd uit de factuur zoals die in de
// database staat, dus download en verzending geven dezelfde inhoud.
// ---------------------------------------------------------------------------

const BETAALTERMIJN_DAGEN = 14;

type Registratie = { street: string | null; houseNumber: string | null; postalCode: string | null; city: string | null; country: string } | null;

function adresUit(reg: Registratie, land = "NL") {
  return {
    ...(reg?.street ? { straat: [reg.street, reg.houseNumber].filter(Boolean).join(" ") } : {}),
    ...(reg?.postalCode ? { postcode: reg.postalCode } : {}),
    ...(reg?.city ? { plaats: reg.city } : {}),
    land: reg?.country || land,
  };
}

function plusDagen(d: Date, n: number): Date {
  const p = amsterdamParts(d);
  const t = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  return amsterdamToUtc(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export interface EfactuurDocument {
  invoiceId: string;
  nummer: string;
  tenantId: string | null;
  factuur: UblFactuur;
  xml: string;
  bestandsnaam: string;
  /** bedrijfsregels die een pakket afkeurt; leeg = in orde */
  fouten: string[];
  /** ook geschikt voor het Peppol-netwerk (beide partijen een Peppol-adres) */
  peppolKlaar: boolean;
  /** waar deze factuur naartoe kan: het Peppol-adres van de koper en het mailadres van het boekhoudpakket */
  koperPeppolId: string | null;
  koperEmail: string | null;
}

/** De e-factuur bij een factuur, of null als de factuur niet bestaat of (nog) geen zakelijke koper heeft. */
export async function efactuurDocument(invoiceId: string): Promise<EfactuurDocument | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: true,
      issuerTenant: { select: { name: true, kvkNumber: true, vatNumber: true, country: true, companyRegistration: { select: { street: true, houseNumber: true, postalCode: true, city: true, country: true } } } },
      recipientTenant: { select: { id: true, name: true, kvkNumber: true, vatNumber: true, country: true, companyRegistration: { select: { street: true, houseNumber: true, postalCode: true, city: true, country: true } } } },
      timesheet: { select: { scheduledStart: true, branch: { select: { name: true, costCenter: true } } } },
    },
  });
  if (!inv || !inv.recipientTenant) return null;

  const instellingen = await efactuurInstellingen(inv.recipientTenant.id);
  const koperPeppol = splitsPeppolId(instellingen.peppolId);
  const koper: UblPartij = {
    naam: inv.recipientTenant.name,
    ...(inv.recipientTenant.kvkNumber ? { kvk: inv.recipientTenant.kvkNumber } : {}),
    ...(inv.recipientTenant.vatNumber ? { btw: inv.recipientTenant.vatNumber } : {}),
    adres: adresUit(inv.recipientTenant.companyRegistration, inv.recipientTenant.country),
    ...(instellingen.ontvangstEmail ? { email: instellingen.ontvangstEmail } : {}),
    ...(koperPeppol ? { peppolId: koperPeppol } : {}),
  };

  let verkoper: UblPartij;
  let soort: UblFactuur["soort"] = "factuur";
  if (inv.issuerFreelancerId) {
    const fp = await prisma.freelancerProfile.findUnique({
      where: { id: inv.issuerFreelancerId },
      select: { kvkNumber: true, vatNumber: true, country: true, homePostalCode: true, user: { select: { fullName: true, email: true } }, companyRegistration: { select: { street: true, houseNumber: true, postalCode: true, city: true, country: true, tradeName: true, legalName: true } } },
    });
    if (!fp) return null;
    soort = "selfbilling";
    verkoper = {
      naam: fp.companyRegistration?.tradeName || fp.companyRegistration?.legalName || fp.user.fullName,
      kvk: fp.kvkNumber,
      ...(fp.vatNumber ? { btw: fp.vatNumber } : {}),
      adres: { ...adresUit(fp.companyRegistration, fp.country), ...(fp.companyRegistration?.postalCode ? {} : { postcode: fp.homePostalCode }) },
    };
  } else {
    const p = platformPartij();
    verkoper = {
      naam: inv.issuerTenant?.name ?? p.naam,
      ...(p.kvk ? { kvk: p.kvk } : {}),
      ...(p.btw ? { btw: p.btw } : {}),
      adres: { ...(p.straat ? { straat: p.straat } : {}), ...(p.postcode ? { postcode: p.postcode } : {}), ...(p.plaats ? { plaats: p.plaats } : {}), land: "NL" },
      email: env.MAIL_REPLY_TO,
    };
    const sender = splitsPeppolId(env.PEPPOL_SENDER_ID);
    if (sender) verkoper.peppolId = sender;
  }

  const btwPercentage = Math.round(inv.vatRate * 100);
  const uitgifte = inv.issuedAt ?? inv.createdAt;
  const regels: UblRegel[] = inv.lines.map((l) => ({
    omschrijving: l.description,
    aantal: l.quantity > 0 ? l.quantity : 1,
    eenheid: l.quantity > 0 ? "HUR" : "C62",
    prijsCents: l.quantity > 0 ? l.unitPriceCents : l.amountCents,
    bedragCents: l.amountCents,
  }));
  const betaaltAanPlatform = !inv.issuerFreelancerId && inv.totalCents > 0;
  const referentie = inv.timesheet?.branch.costCenter || inv.timesheet?.branch.name || inv.number;

  const factuur: UblFactuur = {
    nummer: inv.number,
    soort,
    datum: amsterdamDayKey(uitgifte),
    ...(inv.totalCents > 0 ? { vervaldatum: amsterdamDayKey(inv.dueAt ?? plusDagen(uitgifte, BETAALTERMIJN_DAGEN)) } : {}),
    valuta: inv.currency,
    verkoper,
    koper,
    regels,
    subtotaalCents: inv.subtotalCents,
    btwCents: inv.vatCents,
    totaalCents: inv.totalCents,
    btwCategorie: btwCategorieVoor(inv.vatTreatment, btwPercentage),
    btwPercentage,
    betaalreferentie: inv.number,
    ...(betaaltAanPlatform && env.SEPA_CREDITOR_IBAN ? { iban: env.SEPA_CREDITOR_IBAN } : {}),
    koperReferentie: referentie,
    ...(inv.timesheet ? { notitie: `Werkdag ${amsterdamDayKey(inv.timesheet.scheduledStart)}, locatie ${inv.timesheet.branch.name}` } : {}),
  };

  const fouten = valideerUbl(factuur);
  const peppolFouten = valideerUbl(factuur, { peppol: true });
  return {
    invoiceId: inv.id,
    nummer: inv.number,
    tenantId: inv.recipientTenant.id,
    factuur,
    xml: bouwUbl(factuur),
    bestandsnaam: ublBestandsnaam(factuur),
    fouten,
    peppolKlaar: peppolFouten.length === 0,
    koperPeppolId: koperPeppol ? `${koperPeppol.schema}:${koperPeppol.id}` : null,
    koperEmail: instellingen.ontvangstEmail ?? null,
  };
}
