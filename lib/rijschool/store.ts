import type { Prisma, Rijschool, RijschoolLes, RijschoolLesStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/sites/types";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { conflict, leesWerktijden, STANDAARD_WERKTIJDEN, vrijeTijden, type Blok } from "@/lib/rijschool/planning";
import { lesduur } from "@/lib/rijschool/tegoed";
import { nieuweUitnodiging } from "@/lib/rijschool/accounts";
import { lesBevestigingMail, lesGeannuleerdMail, proeflesSchoolMail, uitnodigingMail, verstuur } from "@/lib/rijschool/mail";

// ---------------------------------------------------------------------------
// Opslag van het rijschool-pakket. Elke functie krijgt de rijschool mee en
// controleert zelf dat leerling, instructeur, auto en product daarbij horen,
// zodat een id van een andere rijschool nooit werkt. Lessen plannen gebeurt
// onder een databaseslot per rijschool: twee boekingen tegelijk op dezelfde
// tijd kunnen niet allebei slagen.
// ---------------------------------------------------------------------------

/** Deze soorten lessen gaan van het lestegoed af; proefles en examen betaal je los. */
const KOST_TEGOED = new Set(["LES", "TOETS"]);
const ACTIEF: RijschoolLesStatus[] = ["GEPLAND", "VOLTOOID", "NIET_VERSCHENEN"];
/** Een proefles via de website boek je minstens zoveel minuten van tevoren. */
export const PROEFLES_VOORAF_MIN = 12 * 60;

export const rijschoolVanSlug = (slug: string) => prisma.rijschool.findUnique({ where: { slug } });
export const rijschoolVanTenant = (tenantId: string) => prisma.rijschool.findUnique({ where: { tenantId } });

/** Voorbeeldpakketten voor een nieuwe rijschool; de eigenaar past de prijzen aan. */
const VOORBEELD_PRODUCTEN: Omit<Prisma.RijschoolProductCreateManyRijschoolInput, "rijschoolId">[] = [
  { naam: "Proefles", omschrijving: "Kennismaken, een eerste keer rijden en een eerlijke inschatting van het aantal lessen.", soort: "PROEFLES", prijsCent: 4500, lessen: 0, volgorde: 0 },
  { naam: "Losse rijles", omschrijving: "Eén les van 60 minuten.", soort: "LES", prijsCent: 6200, lessen: 1, volgorde: 1 },
  { naam: "Pakket 10 lessen", omschrijving: "Tien lessen van 60 minuten, voordeliger dan los.", soort: "PAKKET", prijsCent: 59500, lessen: 10, volgorde: 2 },
  { naam: "Pakket 20 lessen", omschrijving: "Twintig lessen van 60 minuten. Het meest gekozen pakket.", soort: "PAKKET", prijsCent: 116000, lessen: 20, populair: true, volgorde: 3 },
  { naam: "Examenpakket", omschrijving: "Dertig lessen van 60 minuten inclusief het praktijkexamen.", soort: "PAKKET", prijsCent: 209500, lessen: 30, examen: true, volgorde: 4 },
  { naam: "Praktijkexamen", omschrijving: "Het praktijkexamen, inclusief de les voorafgaand.", soort: "EXAMEN", prijsCent: 33500, lessen: 0, examen: true, volgorde: 5 },
];

async function vrijeSlug(naam: string): Promise<string> {
  const basis = slugify(naam).slice(0, 34) || "rijschool";
  for (let i = 1; i <= 50; i++) {
    const kandidaat = i === 1 ? basis : `${basis}-${i}`;
    if (kandidaat.length >= 3 && !(await prisma.rijschool.findUnique({ where: { slug: kandidaat }, select: { id: true } }))) return kandidaat;
  }
  throw AppError.conflict("Kies een andere naam voor je rijschool.");
}

/** Zet het rijschool-pakket aan: website, voorbeeldpakketten en de eigenaar als eerste instructeur. */
export async function maakRijschool(
  tenantId: string,
  eigenaar: { naam: string; email: string },
  input: { naam: string; plaats: string; adres: string; telefoon: string; email: string; kvk: string },
): Promise<Rijschool> {
  if (await rijschoolVanTenant(tenantId)) throw AppError.conflict("Het rijschool-pakket staat al aan.");
  const slug = await vrijeSlug(input.naam);
  return prisma.rijschool.create({
    data: {
      tenantId,
      slug,
      naam: input.naam,
      plaats: input.plaats,
      adres: input.adres,
      telefoon: input.telefoon,
      email: input.email || eigenaar.email,
      kvk: input.kvk,
      producten: { createMany: { data: VOORBEELD_PRODUCTEN } },
      instructeurs: {
        create: {
          naam: eigenaar.naam || input.naam,
          email: eigenaar.email.toLowerCase(),
          beschikbaarheid: STANDAARD_WERKTIJDEN as unknown as Prisma.InputJsonValue,
        },
      },
    },
  });
}

// --- lestegoed ------------------------------------------------------------------

export async function saldoVan(leerlingId: string): Promise<number> {
  const r = await prisma.rijschoolTegoed.aggregate({ where: { leerlingId }, _sum: { minuten: true } });
  return r._sum.minuten ?? 0;
}

export async function saldiVan(leerlingIds: string[]): Promise<Map<string, number>> {
  if (leerlingIds.length === 0) return new Map();
  const rijen = await prisma.rijschoolTegoed.groupBy({ by: ["leerlingId"], where: { leerlingId: { in: leerlingIds } }, _sum: { minuten: true } });
  return new Map(rijen.map((r) => [r.leerlingId, r._sum.minuten ?? 0]));
}

// --- controles: hoort dit bij deze rijschool? ------------------------------------

export async function eigenLeerling(r: Pick<Rijschool, "id">, id: string) {
  const l = await prisma.rijschoolLeerling.findFirst({ where: { id, rijschoolId: r.id } });
  if (!l) throw AppError.notFound("Leerling niet gevonden.");
  return l;
}

export async function eigenInstructeur(r: Pick<Rijschool, "id">, id: string) {
  const i = await prisma.rijschoolInstructeur.findFirst({ where: { id, rijschoolId: r.id } });
  if (!i) throw AppError.notFound("Instructeur niet gevonden.");
  return i;
}

export async function eigenLes(r: Pick<Rijschool, "id">, id: string) {
  const les = await prisma.rijschoolLes.findFirst({ where: { id, rijschoolId: r.id } });
  if (!les) throw AppError.notFound("Les niet gevonden.");
  return les;
}

// --- planning ---------------------------------------------------------------------

/** Wat een instructeur rond deze periode al heeft staan (lessen die tellen). */
export async function bezetVan(rijschoolId: string, instructeurId: string, van: Date, tot: Date): Promise<Blok[]> {
  return prisma.rijschoolLes.findMany({
    where: { rijschoolId, instructeurId, status: { in: ACTIEF }, start: { lt: tot }, eind: { gt: van } },
    select: { start: true, eind: true },
  });
}

/** Vrije begintijden van een instructeur op een dag (Nederlandse datum). */
export async function vrijVoor(
  r: Pick<Rijschool, "id">,
  instructeur: { id: string; beschikbaarheid: Prisma.JsonValue },
  datum: string,
  duurMin: number,
  nu: Date,
  minVoorafMin: number,
): Promise<Date[]> {
  const dagStart = new Date(`${datum}T00:00:00Z`);
  // ruim venster rond de Nederlandse dag (tijdzone + zomertijd)
  const bezet = await bezetVan(r.id, instructeur.id, new Date(dagStart.getTime() - 86_400_000), new Date(dagStart.getTime() + 2 * 86_400_000));
  return vrijeTijden({ werktijden: leesWerktijden(instructeur.beschikbaarheid), bezet, datum, duurMin, nu, minVoorafMin });
}

export interface NieuweLes {
  instructeurId: string;
  leerlingId: string | null;
  voertuigId: string | null;
  soort: "LES" | "PROEFLES" | "TOETS" | "EXAMEN";
  start: Date;
  eind: Date;
  ophaaladres: string;
}

/** Plan of verzet een les; weigert bij een dubbele boeking van instructeur, leerling of auto. */
export async function planLes(r: Pick<Rijschool, "id">, input: NieuweLes, lesId: string | null = null): Promise<RijschoolLes> {
  await eigenInstructeur(r, input.instructeurId);
  if (input.leerlingId) await eigenLeerling(r, input.leerlingId);
  if (input.voertuigId && !(await prisma.rijschoolVoertuig.findFirst({ where: { id: input.voertuigId, rijschoolId: r.id }, select: { id: true } }))) {
    throw AppError.notFound("Auto niet gevonden.");
  }
  if (lesId) await eigenLes(r, lesId);

  return prisma.$transaction(async (tx) => {
    // $executeRaw (niet $queryRaw): pg_advisory_xact_lock geeft void terug.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rijschool-planning:${r.id}`}))`;
    const rond = await tx.rijschoolLes.findMany({
      where: {
        rijschoolId: r.id,
        status: { in: ACTIEF },
        start: { lt: input.eind },
        eind: { gt: input.start },
        OR: [{ instructeurId: input.instructeurId }, ...(input.leerlingId ? [{ leerlingId: input.leerlingId }] : []), ...(input.voertuigId ? [{ voertuigId: input.voertuigId }] : [])],
      },
      select: { id: true, start: true, eind: true, instructeurId: true, leerlingId: true, voertuigId: true },
    });
    const fout = conflict({ ...input, ...(lesId ? { id: lesId } : {}) }, rond);
    if (fout) throw AppError.conflict(fout);
    const data = {
      instructeurId: input.instructeurId,
      leerlingId: input.leerlingId,
      voertuigId: input.voertuigId,
      soort: input.soort,
      start: input.start,
      eind: input.eind,
      ophaaladres: input.ophaaladres,
    };
    return lesId ? tx.rijschoolLes.update({ where: { id: lesId }, data }) : tx.rijschoolLes.create({ data: { ...data, rijschoolId: r.id } });
  });
}

/** Status van een les zetten; een gereden (of gemiste) les gaat één keer van het tegoed af. */
export async function zetLesStatus(r: Pick<Rijschool, "id">, lesId: string, status: RijschoolLesStatus, door: string): Promise<RijschoolLes> {
  const les = await eigenLes(r, lesId);
  return prisma.$transaction(async (tx) => {
    const bij = await tx.rijschoolLes.update({
      where: { id: les.id },
      data: { status, ...(status === "VOLTOOID" || status === "NIET_VERSCHENEN" ? { afgerondOm: les.afgerondOm ?? new Date() } : {}) },
    });
    const kost = les.leerlingId && KOST_TEGOED.has(les.soort) && (status === "VOLTOOID" || status === "NIET_VERSCHENEN");
    if (kost && les.leerlingId) {
      const minuten = lesduur(les.start, les.eind);
      const omschrijving = status === "VOLTOOID" ? "Les gereden" : "Les niet verschenen (telt als gereden)";
      await tx.rijschoolTegoed.upsert({
        where: { lesId: les.id },
        create: { leerlingId: les.leerlingId, lesId: les.id, minuten: -minuten, omschrijving, door },
        update: { minuten: -minuten, omschrijving },
      });
    } else {
      await tx.rijschoolTegoed.deleteMany({ where: { lesId: les.id } });
    }
    return bij;
  });
}

async function mailOverLes(r: Rijschool, les: RijschoolLes, soort: "bevestiging" | "annulering", door = "de rijschool"): Promise<void> {
  if (!les.leerlingId) return;
  const [leerling, instructeur] = await Promise.all([
    prisma.rijschoolLeerling.findUnique({ where: { id: les.leerlingId }, select: { naam: true, email: true } }),
    prisma.rijschoolInstructeur.findUnique({ where: { id: les.instructeurId }, select: { naam: true } }),
  ]);
  if (!leerling) return;
  await verstuur(soort === "bevestiging" ? lesBevestigingMail(r, leerling, les, instructeur?.naam ?? "je instructeur") : lesGeannuleerdMail(r, leerling, les, door));
}

export const bevestigLes = (r: Rijschool, les: RijschoolLes) => mailOverLes(r, les, "bevestiging");
export const meldAnnulering = (r: Rijschool, les: RijschoolLes, door: string) => mailOverLes(r, les, "annulering", door);

/** De leerling annuleert zelf: kosteloos tot `annuleerUren` voor de les, daarna via de rijschool. */
export async function annuleerDoorLeerling(r: Rijschool, leerlingId: string, lesId: string, nu = new Date()): Promise<RijschoolLes> {
  const les = await eigenLes(r, lesId);
  if (les.leerlingId !== leerlingId) throw AppError.notFound("Les niet gevonden.");
  if (les.status !== "GEPLAND") throw AppError.conflict("Deze les is niet meer gepland.");
  if (les.start.getTime() - nu.getTime() < r.annuleerUren * 3_600_000) {
    throw AppError.precondition(`Kosteloos annuleren kan tot ${r.annuleerUren} uur voor de les. Bel je rijschool${r.telefoon ? ` op ${r.telefoon}` : ""}.`);
  }
  return zetLesStatus(r, les.id, "GEANNULEERD", "leerling");
}

// --- betalingen -------------------------------------------------------------------

/** Een betaling die al binnen is (pin, contant, overboeking); een pakket zet meteen tegoed bij. */
export async function registreerBetaling(
  r: Pick<Rijschool, "id">,
  input: { leerlingId: string; productId: string | null; bedragCent: number; methode: "PIN" | "CONTANT" | "OVERBOEKING"; omschrijving: string },
  door: string,
) {
  await eigenLeerling(r, input.leerlingId);
  const product = input.productId ? await prisma.rijschoolProduct.findFirst({ where: { id: input.productId, rijschoolId: r.id } }) : null;
  if (input.productId && !product) throw AppError.notFound("Pakket niet gevonden.");
  return prisma.$transaction(async (tx) => {
    const betaling = await tx.rijschoolBetaling.create({
      data: {
        rijschoolId: r.id,
        leerlingId: input.leerlingId,
        productId: product?.id ?? null,
        omschrijving: input.omschrijving,
        bedragCent: input.bedragCent,
        status: "BETAALD",
        methode: input.methode,
        betaaldOm: new Date(),
      },
    });
    if (product && product.lessen > 0) {
      await tx.rijschoolTegoed.create({
        data: { leerlingId: input.leerlingId, betalingId: betaling.id, minuten: product.lessen * product.lesMinuten, omschrijving: product.naam, door },
      });
    }
    return betaling;
  });
}

export async function corrigeerTegoed(r: Pick<Rijschool, "id">, input: { leerlingId: string; minuten: number; omschrijving: string }, door: string) {
  await eigenLeerling(r, input.leerlingId);
  return prisma.rijschoolTegoed.create({ data: { leerlingId: input.leerlingId, minuten: input.minuten, omschrijving: input.omschrijving, door } });
}

// --- accounts ---------------------------------------------------------------------

/** Stuur (opnieuw) een link om een wachtwoord te kiezen; `herstel` bij "wachtwoord vergeten". Geeft terug of de mail verstuurd is. */
export async function nodigUit(r: Rijschool, soort: "leerling" | "instructeur", id: string, herstel = false): Promise<boolean> {
  const u = nieuweUitnodiging();
  const data = { uitnodigingHash: u.hash, uitnodigingTot: u.tot };
  const ontvanger =
    soort === "leerling"
      ? await prisma.rijschoolLeerling.update({ where: { id: (await eigenLeerling(r, id)).id }, data, select: { naam: true, email: true } })
      : await prisma.rijschoolInstructeur.update({ where: { id: (await eigenInstructeur(r, id)).id }, data, select: { naam: true, email: true } });
  return verstuur(uitnodigingMail(r, ontvanger, soort, u.token, herstel));
}

// --- proefles via de website ----------------------------------------------------------

export async function boekProefles(
  r: Rijschool,
  input: { naam: string; email: string; telefoon: string; adres: string; automaat: boolean; instructeurId: string; start: Date },
  nu = new Date(),
): Promise<{ les: RijschoolLes; nieuw: boolean }> {
  if (!r.proeflesOnline) throw AppError.precondition("Deze rijschool plant proeflessen nu niet online. Bel of mail de rijschool.");
  const instructeur = await eigenInstructeur(r, input.instructeurId);
  if (!instructeur.actief) throw AppError.notFound("Instructeur niet gevonden.");
  const eind = new Date(input.start.getTime() + r.lesMinuten * 60_000);
  // alleen een tijd die echt vrij is volgens de werktijden (niet zomaar elk moment)
  const vrij = await vrijVoor(r, instructeur, amsterdamDayKey(input.start), r.lesMinuten, nu, PROEFLES_VOORAF_MIN);
  if (!vrij.some((d) => d.getTime() === input.start.getTime())) throw AppError.conflict("Deze tijd is net bezet of niet meer beschikbaar. Kies een andere tijd.");

  const bestaand = await prisma.rijschoolLeerling.findUnique({ where: { rijschoolId_email: { rijschoolId: r.id, email: input.email } } });
  const leerling =
    bestaand ??
    (await prisma.rijschoolLeerling.create({
      data: { rijschoolId: r.id, naam: input.naam, email: input.email, telefoon: input.telefoon, adres: input.adres, automaat: input.automaat, instructeurId: instructeur.id },
    }));
  const les = await planLes(r, {
    instructeurId: instructeur.id,
    leerlingId: leerling.id,
    voertuigId: null,
    soort: "PROEFLES",
    start: input.start,
    eind,
    ophaaladres: input.adres,
  });
  await Promise.all([
    verstuur(lesBevestigingMail(r, leerling, les, instructeur.naam)),
    verstuur(proeflesSchoolMail(r, { naam: input.naam, email: input.email, telefoon: input.telefoon }, les, instructeur.naam)),
  ]);
  return { les, nieuw: !bestaand };
}
