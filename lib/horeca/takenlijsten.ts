import type { HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { VOORBEELD_LIJSTEN, leesRegels, leesTaken, periode, waardeOk, type Taak } from "@/lib/horeca/taken";

// ---------------------------------------------------------------------------
// Takenlijsten van een zaak en het afvinken. Eén vinkje per taak per periode
// (dag, of week voor wekelijkse lijsten): de unieke sleutel (lijst, periode,
// taak) maakt dubbel tikken onschadelijk. Elke lijst hoort bij de zaak; een id
// van een andere zaak werkt nooit.
// ---------------------------------------------------------------------------

async function eigenLijst(zaak: HorecaZaak, id: string) {
  const l = await prisma.horecaTakenlijst.findFirst({ where: { id, zaakId: zaak.id } });
  if (!l) throw AppError.notFound("Takenlijst niet gevonden.");
  return l;
}

/** De lijsten met wat er in de periode van deze datum al is afgevinkt. */
export async function lijstenOp(zaakId: string, datum: string) {
  const lijsten = await prisma.horecaTakenlijst.findMany({ where: { zaakId }, orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }] });
  const vinkjes = lijsten.length
    ? await prisma.horecaAfvinking.findMany({ where: { OR: lijsten.map((l) => ({ lijstId: l.id, datum: periode(l.moment, datum) })) } })
    : [];
  return lijsten.map((l) => ({
    id: l.id,
    naam: l.naam,
    moment: l.moment,
    periode: periode(l.moment, datum),
    taken: leesTaken(l.taken),
    vinkjes: vinkjes.filter((v) => v.lijstId === l.id).map((v) => ({ taak: v.taak, door: v.door, waarde: v.waarde, op: v.op })),
  }));
}

export async function bewaarLijst(zaak: HorecaZaak, l: { id?: string | undefined; naam: string; moment: string; regels: string }) {
  const taken = leesRegels(l.regels);
  if (!taken.length) throw AppError.validation("Zet minstens één taak in de lijst (één per regel).");
  const data = { naam: l.naam, moment: l.moment, taken: taken as unknown as object[] };
  if (!l.id) {
    const volgorde = await prisma.horecaTakenlijst.count({ where: { zaakId: zaak.id } });
    return prisma.horecaTakenlijst.create({ data: { ...data, zaakId: zaak.id, volgorde } });
  }
  await eigenLijst(zaak, l.id);
  return prisma.horecaTakenlijst.update({ where: { id: l.id }, data });
}

export async function verwijderLijst(zaak: HorecaZaak, id: string) {
  const r = await prisma.horecaTakenlijst.deleteMany({ where: { id, zaakId: zaak.id } });
  if (!r.count) throw AppError.notFound("Takenlijst niet gevonden.");
}

/** De voorbeeldlijsten aanmaken (alleen als de zaak nog geen lijsten heeft). */
export async function maakVoorbeeldlijsten(zaak: HorecaZaak) {
  if (await prisma.horecaTakenlijst.count({ where: { zaakId: zaak.id } })) return;
  await prisma.horecaTakenlijst.createMany({
    data: VOORBEELD_LIJSTEN.map((v, i) => ({ zaakId: zaak.id, naam: v.naam, moment: v.moment, volgorde: i, taken: leesRegels(v.regels.join("\n")) as unknown as object[] })),
  });
}

/** Een taak afvinken; een meting vraagt een geldig getal. Geeft terug of de waarde binnen de grens valt. */
export async function vinkAf(zaak: HorecaZaak, v: { lijstId: string; datum: string; taak: number; waarde: string; door: string }): Promise<{ binnenGrens: boolean | null }> {
  const l = await eigenLijst(zaak, v.lijstId);
  const taak: Taak | undefined = leesTaken(l.taken)[v.taak];
  if (!taak) throw AppError.validation("Deze taak staat niet (meer) in de lijst.");
  const ok = taak.meten ? waardeOk(taak, v.waarde) : true;
  if (taak.meten && ok === null) throw AppError.validation(`Vul bij "${taak.tekst}" een getal in, bijvoorbeeld 4,5.`);
  const sleutel = { lijstId: l.id, datum: periode(l.moment, v.datum), taak: v.taak };
  const data = { door: v.door.slice(0, 60) || "Team", waarde: taak.meten ? v.waarde.trim().replace(".", ",").slice(0, 20) : "", op: new Date() };
  await prisma.horecaAfvinking.upsert({ where: { lijstId_datum_taak: sleutel }, create: { ...sleutel, ...data }, update: data });
  return { binnenGrens: ok };
}

export async function vinkUit(zaak: HorecaZaak, v: { lijstId: string; datum: string; taak: number }) {
  const l = await eigenLijst(zaak, v.lijstId);
  await prisma.horecaAfvinking.deleteMany({ where: { lijstId: l.id, datum: periode(l.moment, v.datum), taak: v.taak } });
}

/** De registratie van de laatste 90 dagen (voor een inspectie), nieuwste eerst. */
export async function registratie(zaakId: string) {
  const sinds = new Date(Date.now() - 90 * 86_400_000);
  const lijsten = await prisma.horecaTakenlijst.findMany({ where: { zaakId }, select: { id: true, naam: true, taken: true } });
  const vinkjes = await prisma.horecaAfvinking.findMany({ where: { lijstId: { in: lijsten.map((l) => l.id) }, op: { gte: sinds } }, orderBy: { op: "desc" }, take: 5000 });
  const perLijst = new Map(lijsten.map((l) => [l.id, { naam: l.naam, taken: leesTaken(l.taken) }]));
  return vinkjes.map((v) => {
    const l = perLijst.get(v.lijstId);
    const t = l?.taken[v.taak];
    return { datum: v.datum, lijst: l?.naam ?? "", taak: t?.tekst ?? `Taak ${v.taak + 1}`, waarde: v.waarde, binnenGrens: t?.meten ? waardeOk(t, v.waarde) : null, door: v.door, op: v.op };
  });
}
