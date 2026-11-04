import type { Rijschool, RijschoolInstructeur, RijschoolLeerling } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { leesWerktijden, type Werktijd } from "@/lib/rijschool/planning";
import { leesBeoordelingen, voortgang, type Beoordelingen, type Voortgang } from "@/lib/rijschool/leskaart";
import { leesTheorie, type TheorieScore } from "@/lib/rijschool/theorie";
import { websiteBewerkbaar, type RijschoolWebsite } from "@/lib/rijschool/website";
import { saldiVan, saldoVan } from "@/lib/rijschool/store";
import { siteUrl } from "@/lib/rijschool/mail";
import { onlineBetalenAan } from "@/lib/rijschool/betalen";
import { automailInstellingen } from "@/lib/rijschool/automailer";
import type { AutomailInstellingen } from "@/lib/rijschool/automail-soorten";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { routeWeergave, type RouteWeergave } from "@/lib/rijschool/lesroute";
import { gesprekMet, gesprekkenVan } from "@/lib/rijschool/berichten";
import type { BerichtRij, Gesprek } from "@/lib/rijschool/berichten-lijst";

// ---------------------------------------------------------------------------
// Wat elk scherm van het rijschool-pakket te zien krijgt, als platte JSON
// (datums als ISO-tekst). Een leerling krijgt nooit de interne notities van
// de rijschool; een instructeur alleen wat hij voor zijn lessen nodig heeft.
// ---------------------------------------------------------------------------

export interface RijschoolInfo {
  id: string;
  slug: string;
  naam: string;
  plaats: string;
  adres: string;
  telefoon: string;
  email: string;
  kvk: string;
  kleur: string;
  accent: string;
  lesMinuten: number;
  annuleerUren: number;
  proeflesOnline: boolean;
  zelfPlannen: boolean;
  online: boolean;
  url: string;
}

export interface InstructeurRij {
  id: string;
  naam: string;
  email: string;
  telefoon: string;
  bio: string;
  categorieen: string[];
  werktijden: Werktijd[];
  kleur: string;
  actief: boolean;
  heeftWachtwoord: boolean;
  uitnodigingOpen: boolean;
}

export interface VoertuigRij {
  id: string;
  naam: string;
  kenteken: string;
  automaat: boolean;
  categorie: string;
  actief: boolean;
}

export interface ProductRij {
  id: string;
  naam: string;
  omschrijving: string;
  soort: string;
  prijsCent: number;
  lessen: number;
  lesMinuten: number;
  examen: boolean;
  zichtbaar: boolean;
  populair: boolean;
  volgorde: number;
}

export interface LeerlingRij {
  id: string;
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  geboortedatum: string;
  automaat: boolean;
  status: string;
  instructeurId: string | null;
  theorieGehaald: boolean;
  examenDatum: string;
  notitie: string;
  saldoMin: number;
  procent: number;
  heeftWachtwoord: boolean;
  uitnodigingOpen: boolean;
  laatstIngelogd: string | null;
  aangemaakt: string;
}

export interface LesRij {
  id: string;
  soort: string;
  status: string;
  start: string;
  eind: string;
  instructeurId: string;
  instructeurNaam: string;
  leerlingId: string | null;
  leerlingNaam: string | null;
  voertuigId: string | null;
  voertuigNaam: string | null;
  ophaaladres: string;
}

export interface BetalingRij {
  id: string;
  leerlingId: string;
  leerlingNaam: string;
  omschrijving: string;
  bedragCent: number;
  status: string;
  methode: string | null;
  betaaldOm: string | null;
  aangemaakt: string;
}

export const rijschoolInfo = (r: Rijschool): RijschoolInfo => ({
  id: r.id,
  slug: r.slug,
  naam: r.naam,
  plaats: r.plaats,
  adres: r.adres,
  telefoon: r.telefoon,
  email: r.email,
  kvk: r.kvk,
  kleur: r.kleur,
  accent: r.accent,
  lesMinuten: r.lesMinuten,
  annuleerUren: r.annuleerUren,
  proeflesOnline: r.proeflesOnline,
  zelfPlannen: r.zelfPlannen,
  online: r.online,
  url: siteUrl(r),
});

const datumOfLeeg = (d: Date | null) => (d ? amsterdamDayKey(d) : "");

export const instructeurRij = (i: RijschoolInstructeur): InstructeurRij => ({
  id: i.id,
  naam: i.naam,
  email: i.email,
  telefoon: i.telefoon,
  bio: i.bio,
  categorieen: i.categorieen,
  werktijden: leesWerktijden(i.beschikbaarheid),
  kleur: i.kleur,
  actief: i.actief,
  heeftWachtwoord: Boolean(i.wachtwoordHash),
  uitnodigingOpen: Boolean(i.uitnodigingTot && i.uitnodigingTot > new Date()),
});

const lesInclude = {
  leerling: { select: { naam: true } },
  instructeur: { select: { naam: true } },
  voertuig: { select: { naam: true } },
} as const;

type LesMetNamen = {
  id: string;
  soort: string;
  status: string;
  start: Date;
  eind: Date;
  instructeurId: string;
  leerlingId: string | null;
  voertuigId: string | null;
  ophaaladres: string;
  leerling: { naam: string } | null;
  instructeur: { naam: string };
  voertuig: { naam: string } | null;
};

const lesRij = (l: LesMetNamen): LesRij => ({
  id: l.id,
  soort: l.soort,
  status: l.status,
  start: l.start.toISOString(),
  eind: l.eind.toISOString(),
  instructeurId: l.instructeurId,
  instructeurNaam: l.instructeur.naam,
  leerlingId: l.leerlingId,
  leerlingNaam: l.leerling?.naam ?? null,
  voertuigId: l.voertuigId,
  voertuigNaam: l.voertuig?.naam ?? null,
  ophaaladres: l.ophaaladres,
});

/** Lessen in een periode, voor de agenda. */
export async function lessenIn(r: Pick<Rijschool, "id">, van: Date, tot: Date): Promise<LesRij[]> {
  const lessen = await prisma.rijschoolLes.findMany({
    where: { rijschoolId: r.id, start: { gte: van, lt: tot } },
    include: lesInclude,
    orderBy: { start: "asc" },
    take: 2000,
  });
  return lessen.map(lesRij);
}

/** Voortgang per leerling uit alle gereden lessen. */
async function voortgangVan(leerlingIds: string[]): Promise<Map<string, Voortgang>> {
  if (leerlingIds.length === 0) return new Map();
  const lessen = await prisma.rijschoolLes.findMany({
    where: { leerlingId: { in: leerlingIds }, status: "VOLTOOID" },
    select: { leerlingId: true, start: true, beoordeling: true },
  });
  const perLeerling = new Map<string, { at: Date; beoordeling: unknown }[]>();
  for (const l of lessen) {
    if (!l.leerlingId) continue;
    const lijst = perLeerling.get(l.leerlingId) ?? [];
    lijst.push({ at: l.start, beoordeling: l.beoordeling });
    perLeerling.set(l.leerlingId, lijst);
  }
  return new Map(leerlingIds.map((id) => [id, voortgang(perLeerling.get(id) ?? [])]));
}

export interface BeheerWeergave {
  rijschool: RijschoolInfo;
  website: RijschoolWebsite;
  instructeurs: InstructeurRij[];
  voertuigen: VoertuigRij[];
  producten: ProductRij[];
  leerlingen: LeerlingRij[];
  betalingen: BetalingRij[];
  /** welke mails de automailer vanzelf stuurt (lib/rijschool/automailer.ts) */
  automails: AutomailInstellingen;
  /** gesprekken met leerlingen (lib/rijschool/berichten.ts), het meest recente bovenaan */
  gesprekken: Gesprek[];
}

export async function beheerWeergave(r: Rijschool): Promise<BeheerWeergave> {
  const [instructeurs, voertuigen, producten, leerlingen, betalingen, automails, gesprekken] = await Promise.all([
    prisma.rijschoolInstructeur.findMany({ where: { rijschoolId: r.id }, orderBy: { createdAt: "asc" } }),
    prisma.rijschoolVoertuig.findMany({ where: { rijschoolId: r.id }, orderBy: { createdAt: "asc" } }),
    prisma.rijschoolProduct.findMany({ where: { rijschoolId: r.id }, orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }] }),
    prisma.rijschoolLeerling.findMany({ where: { rijschoolId: r.id }, orderBy: { createdAt: "desc" }, take: 2000 }),
    prisma.rijschoolBetaling.findMany({
      where: { rijschoolId: r.id },
      include: { leerling: { select: { naam: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    automailInstellingen(r.id),
    gesprekkenVan(r.id),
  ]);
  const ids = leerlingen.map((l) => l.id);
  const [saldi, voortgangen] = await Promise.all([saldiVan(ids), voortgangVan(ids)]);
  return {
    automails,
    gesprekken,
    rijschool: rijschoolInfo(r),
    website: websiteBewerkbaar(r.website),
    instructeurs: instructeurs.map(instructeurRij),
    voertuigen: voertuigen.map(({ id, naam, kenteken, automaat, categorie, actief }) => ({ id, naam, kenteken, automaat, categorie, actief })),
    producten: producten.map(({ id, naam, omschrijving, soort, prijsCent, lessen, lesMinuten, examen, zichtbaar, populair, volgorde }) => ({
      id, naam, omschrijving, soort, prijsCent, lessen, lesMinuten, examen, zichtbaar, populair, volgorde,
    })),
    leerlingen: leerlingen.map((l) => ({
      id: l.id,
      naam: l.naam,
      email: l.email,
      telefoon: l.telefoon,
      adres: l.adres,
      geboortedatum: datumOfLeeg(l.geboortedatum),
      automaat: l.automaat,
      status: l.status,
      instructeurId: l.instructeurId,
      theorieGehaald: l.theorieGehaald,
      examenDatum: datumOfLeeg(l.examenDatum),
      notitie: l.notitie,
      saldoMin: saldi.get(l.id) ?? 0,
      procent: voortgangen.get(l.id)?.procent ?? 0,
      heeftWachtwoord: Boolean(l.wachtwoordHash),
      uitnodigingOpen: Boolean(l.uitnodigingTot && l.uitnodigingTot > new Date()),
      laatstIngelogd: l.laatstIngelogd?.toISOString() ?? null,
      aangemaakt: l.createdAt.toISOString(),
    })),
    betalingen: betalingen.map((b) => ({
      id: b.id,
      leerlingId: b.leerlingId,
      leerlingNaam: b.leerling.naam,
      omschrijving: b.omschrijving,
      bedragCent: b.bedragCent,
      status: b.status,
      methode: b.methode,
      betaaldOm: b.betaaldOm?.toISOString() ?? null,
      aangemaakt: b.createdAt.toISOString(),
    })),
  };
}

// --- leerling-app -----------------------------------------------------------------

export interface LeerlingLes extends LesRij {
  verslag: string;
  huiswerk: string[];
  beoordeling: Beoordelingen;
  /** de gereden route (lib/rijschool/lesroute.ts), alleen bij een gereden les */
  route: RouteWeergave | null;
}

export interface LeerlingWeergave {
  rijschool: RijschoolInfo;
  leerling: { id: string; naam: string; email: string; telefoon: string; adres: string; status: string; automaat: boolean; theorieGehaald: boolean; examenDatum: string };
  instructeur: { id: string; naam: string; telefoon: string } | null;
  lessen: LeerlingLes[];
  saldoMin: number;
  betalingen: BetalingRij[];
  producten: ProductRij[];
  voortgang: Voortgang;
  theorie: Record<string, TheorieScore>;
  /** de rijschool ontvangt iDEAL via haar eigen Stripe-account (lib/rijschool/betalen.ts) */
  onlineBetalen: boolean;
  /** het gesprek met de rijschool (lib/rijschool/berichten.ts), oudste eerst */
  berichten: BerichtRij[];
}

export async function leerlingWeergave(r: Rijschool, l: RijschoolLeerling): Promise<LeerlingWeergave> {
  const [lessen, saldoMin, betalingen, producten, instructeur, berichten] = await Promise.all([
    prisma.rijschoolLes.findMany({ where: { leerlingId: l.id }, include: lesInclude, orderBy: { start: "desc" }, take: 300 }),
    saldoVan(l.id),
    prisma.rijschoolBetaling.findMany({ where: { leerlingId: l.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.rijschoolProduct.findMany({ where: { rijschoolId: r.id, zichtbaar: true }, orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }] }),
    l.instructeurId ? prisma.rijschoolInstructeur.findUnique({ where: { id: l.instructeurId }, select: { id: true, naam: true, telefoon: true } }) : null,
    gesprekMet(l.id, 100),
  ]);
  return {
    rijschool: rijschoolInfo(r),
    berichten,
    leerling: {
      id: l.id,
      naam: l.naam,
      email: l.email,
      telefoon: l.telefoon,
      adres: l.adres,
      status: l.status,
      automaat: l.automaat,
      theorieGehaald: l.theorieGehaald,
      examenDatum: datumOfLeeg(l.examenDatum),
    },
    instructeur,
    lessen: lessen.map((les) => ({
      ...lesRij(les),
      verslag: les.status === "VOLTOOID" ? les.verslag : "",
      huiswerk: les.huiswerk,
      beoordeling: les.status === "VOLTOOID" ? leesBeoordelingen(les.beoordeling) : {},
      route: les.status === "VOLTOOID" ? routeWeergave(les.route) : null,
    })),
    saldoMin,
    betalingen: betalingen.map((b) => ({
      id: b.id,
      leerlingId: b.leerlingId,
      leerlingNaam: l.naam,
      omschrijving: b.omschrijving,
      bedragCent: b.bedragCent,
      status: b.status,
      methode: b.methode,
      betaaldOm: b.betaaldOm?.toISOString() ?? null,
      aangemaakt: b.createdAt.toISOString(),
    })),
    producten: producten.map(({ id, naam, omschrijving, soort, prijsCent, lessen: n, lesMinuten, examen, zichtbaar, populair, volgorde }) => ({
      id, naam, omschrijving, soort, prijsCent, lessen: n, lesMinuten, examen, zichtbaar, populair, volgorde,
    })),
    voortgang: voortgang(lessen.filter((les) => les.status === "VOLTOOID").map((les) => ({ at: les.start, beoordeling: les.beoordeling }))),
    theorie: leesTheorie(l.theorie),
    onlineBetalen: await onlineBetalenAan(r),
  };
}

// --- instructeur-app ----------------------------------------------------------------

export interface DagLes extends LesRij {
  verslag: string;
  huiswerk: string[];
  beoordeling: Beoordelingen;
  interneNotitie: string;
  gestartOm: string | null;
  /** meters lesroute die al is opgeslagen (0 = nog geen) */
  routeMeters: number;
  leerling: { id: string; naam: string; telefoon: string; adres: string; automaat: boolean; saldoMin: number; voortgang: Voortgang; vorigVerslag: string } | null;
}

export interface InstructeurWeergave {
  rijschool: RijschoolInfo;
  instructeur: { id: string; naam: string };
  datum: string;
  lessen: DagLes[];
  leerlingen: { id: string; naam: string; saldoMin: number; procent: number; volgende: string | null }[];
  voertuigen: VoertuigRij[];
  producten: ProductRij[];
  /** iDEAL in de auto (QR-code) kan als de rijschool online betalen heeft aangezet */
  onlineBetalen: boolean;
}

export async function instructeurWeergave(r: Rijschool, i: RijschoolInstructeur, datum: string): Promise<InstructeurWeergave> {
  const dag = new Date(`${datum}T00:00:00Z`);
  const lessenRuim = await prisma.rijschoolLes.findMany({
    where: { rijschoolId: r.id, instructeurId: i.id, start: { gte: new Date(dag.getTime() - 86_400_000), lt: new Date(dag.getTime() + 2 * 86_400_000) } },
    include: lesInclude,
    orderBy: { start: "asc" },
  });
  const lessen = lessenRuim.filter((l) => amsterdamDayKey(l.start) === datum);
  const eigen = await prisma.rijschoolLeerling.findMany({
    where: { rijschoolId: r.id, status: { in: ["AANMELDING", "ACTIEF"] }, OR: [{ instructeurId: i.id }, { lessen: { some: { instructeurId: i.id } } }] },
    select: { id: true, naam: true, telefoon: true, adres: true, automaat: true },
    orderBy: { naam: "asc" },
    take: 500,
  });
  const dagLeerlingIds = lessen.flatMap((l) => (l.leerlingId ? [l.leerlingId] : []));
  const ids = [...new Set([...eigen.map((l) => l.id), ...dagLeerlingIds])];
  const [saldi, voortgangen, dagLeerlingen, volgende, vorige, voertuigen, producten] = await Promise.all([
    saldiVan(ids),
    voortgangVan(ids),
    prisma.rijschoolLeerling.findMany({ where: { id: { in: dagLeerlingIds } }, select: { id: true, naam: true, telefoon: true, adres: true, automaat: true } }),
    prisma.rijschoolLes.findMany({
      where: { leerlingId: { in: ids }, status: "GEPLAND", start: { gte: new Date() } },
      select: { leerlingId: true, start: true },
      orderBy: { start: "asc" },
    }),
    prisma.rijschoolLes.findMany({
      where: { leerlingId: { in: dagLeerlingIds }, status: "VOLTOOID", verslag: { not: "" } },
      select: { leerlingId: true, verslag: true, start: true },
      orderBy: { start: "desc" },
    }),
    prisma.rijschoolVoertuig.findMany({ where: { rijschoolId: r.id, actief: true }, orderBy: { createdAt: "asc" } }),
    prisma.rijschoolProduct.findMany({ where: { rijschoolId: r.id }, orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }] }),
  ]);
  const eerstVolgende = new Map<string, string>();
  for (const v of volgende) if (v.leerlingId && !eerstVolgende.has(v.leerlingId)) eerstVolgende.set(v.leerlingId, v.start.toISOString());
  const leerlingInfo = new Map(dagLeerlingen.map((l) => [l.id, l]));

  return {
    rijschool: rijschoolInfo(r),
    instructeur: { id: i.id, naam: i.naam },
    datum,
    lessen: lessen.map((les) => {
      const info = les.leerlingId ? leerlingInfo.get(les.leerlingId) : undefined;
      return {
        ...lesRij(les),
        verslag: les.verslag,
        huiswerk: les.huiswerk,
        beoordeling: leesBeoordelingen(les.beoordeling),
        interneNotitie: les.interneNotitie,
        gestartOm: les.gestartOm?.toISOString() ?? null,
        routeMeters: routeWeergave(les.route)?.meters ?? 0,
        leerling: info
          ? {
              ...info,
              saldoMin: saldi.get(info.id) ?? 0,
              voortgang: voortgangen.get(info.id) ?? voortgang([]),
              // het verslag van de vorige gereden les, niet van deze
              vorigVerslag: vorige.find((v) => v.leerlingId === info.id && v.start < les.start)?.verslag ?? "",
            }
          : null,
      };
    }),
    leerlingen: eigen.map((l) => ({
      id: l.id,
      naam: l.naam,
      saldoMin: saldi.get(l.id) ?? 0,
      procent: voortgangen.get(l.id)?.procent ?? 0,
      volgende: eerstVolgende.get(l.id) ?? null,
    })),
    voertuigen: voertuigen.map(({ id, naam, kenteken, automaat, categorie, actief }) => ({ id, naam, kenteken, automaat, categorie, actief })),
    producten: producten.map(({ id, naam, omschrijving, soort, prijsCent, lessen: n, lesMinuten, examen, zichtbaar, populair, volgorde }) => ({
      id, naam, omschrijving, soort, prijsCent, lessen: n, lesMinuten, examen, zichtbaar, populair, volgorde,
    })),
    onlineBetalen: await onlineBetalenAan(r),
  };
}
