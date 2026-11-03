import { Prisma, type Rijschool } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { saldiVan } from "@/lib/rijschool/store";
import { lesduur } from "@/lib/rijschool/tegoed";
import { geslaagdMail, langNietGeredenMail, naProeflesMail, tegoedBijnaOpMail, verstuur } from "@/lib/rijschool/mail";
import { AUTOMAILS, type AutomailId, type AutomailInstellingen } from "@/lib/rijschool/automail-soorten";

// ---------------------------------------------------------------------------
// De automailer van een rijschool: vaste mails die vanzelf gaan, elk aan of uit
// in het beheer (Instellingen). Draait dagelijks mee met de lesherinneringen
// (cron 17:00 UTC); "geslaagd" gaat meteen als de rijschool een leerling op
// Geslaagd zet. Elke mail heeft een claim in de KeyValueStore, zodat niemand
// dezelfde mail twee keer krijgt (of te vaak: tegoed hoogstens per 14 dagen,
// lang-niet-gereden hoogstens per 30 dagen).
// ---------------------------------------------------------------------------

export { AUTOMAILS, type AutomailId, type AutomailInstellingen } from "@/lib/rijschool/automail-soorten";

const kvSleutel = (rijschoolId: string) => `rijschool-automail:${rijschoolId}`;
const STANDAARD: AutomailInstellingen = { tegoed: true, proefles: true, stil: true, geslaagd: true };
const DAG = 86_400_000;

export const isAutomail = (s: string): s is AutomailId => AUTOMAILS.some((a) => a.id === s);

export async function automailInstellingen(rijschoolId: string): Promise<AutomailInstellingen> {
  return { ...STANDAARD, ...((await kvGet<Partial<AutomailInstellingen>>(kvSleutel(rijschoolId))) ?? {}) };
}

export async function zetAutomail(rijschoolId: string, id: AutomailId, aan: boolean): Promise<void> {
  await kvSet(kvSleutel(rijschoolId), { ...(await automailInstellingen(rijschoolId)), [id]: aan });
}

/** Eenmalige claim; false = al eerder gestuurd. */
async function claim(sleutel: string, nu: Date): Promise<boolean> {
  try {
    await prisma.keyValueStore.create({ data: { key: sleutel, value: { at: nu.toISOString() } } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

/** Claim die na `dagen` weer vrijkomt. */
async function claimPer(sleutel: string, dagen: number, nu: Date): Promise<boolean> {
  const oud = await kvGet<{ at: string }>(sleutel);
  if (oud && nu.getTime() - Date.parse(oud.at) < dagen * DAG) return false;
  await kvSet(sleutel, { at: nu.toISOString() });
  return true;
}

export interface AutomailUitslag {
  tegoed: number;
  proefles: number;
  stil: number;
}

/** De dagelijkse ronde over alle rijscholen. */
export async function stuurAutomails(nu = new Date()): Promise<AutomailUitslag> {
  const uitslag: AutomailUitslag = { tegoed: 0, proefles: 0, stil: 0 };
  const scholen = await prisma.rijschool.findMany({ take: 2000 });
  for (const r of scholen) {
    const aan = await automailInstellingen(r.id);
    if (aan.tegoed) uitslag.tegoed += await tegoedRonde(r, nu);
    if (aan.proefles) uitslag.proefles += await proeflesRonde(r, nu);
    if (aan.stil) uitslag.stil += await stilRonde(r, nu);
  }
  return uitslag;
}

/** Leerlingen die de afgelopen week reden en niet genoeg tegoed meer hebben voor nog een les (naast wat al gepland is). */
async function tegoedRonde(r: Rijschool, nu: Date): Promise<number> {
  const recent = await prisma.rijschoolLes.findMany({
    where: { rijschoolId: r.id, status: "VOLTOOID", soort: { in: ["LES", "TOETS"] }, eind: { gte: new Date(nu.getTime() - 7 * DAG), lte: nu } },
    select: { leerlingId: true },
    distinct: ["leerlingId"],
  });
  const ids = recent.map((l) => l.leerlingId).filter((x): x is string => !!x);
  if (ids.length === 0) return 0;
  const [leerlingen, saldi, gepland] = await Promise.all([
    prisma.rijschoolLeerling.findMany({ where: { id: { in: ids }, status: "ACTIEF" }, select: { id: true, naam: true, email: true } }),
    saldiVan(ids),
    prisma.rijschoolLes.findMany({ where: { leerlingId: { in: ids }, status: "GEPLAND", soort: { in: ["LES", "TOETS"] }, start: { gt: nu } }, select: { leerlingId: true, start: true, eind: true } }),
  ]);
  let n = 0;
  for (const l of leerlingen) {
    const nogNodig = gepland.filter((g) => g.leerlingId === l.id).reduce((s, g) => s + lesduur(g.start, g.eind), 0);
    const over = (saldi.get(l.id) ?? 0) - nogNodig;
    if (over >= r.lesMinuten) continue;
    if (!(await claimPer(`rijschool-automail:tegoed:${l.id}`, 14, nu))) continue;
    if (await verstuur(tegoedBijnaOpMail(r, l, Math.max(0, over)))) n++;
  }
  return n;
}

/** Proeflessen die gisteren (12 tot 48 uur geleden) zijn gereden. */
async function proeflesRonde(r: Rijschool, nu: Date): Promise<number> {
  const lessen = await prisma.rijschoolLes.findMany({
    where: { rijschoolId: r.id, soort: "PROEFLES", status: "VOLTOOID", eind: { gte: new Date(nu.getTime() - 48 * 3_600_000), lte: new Date(nu.getTime() - 12 * 3_600_000) } },
    include: { leerling: { select: { naam: true, email: true, status: true } } },
  });
  let n = 0;
  for (const les of lessen) {
    if (!les.leerling || les.leerling.status === "GESTOPT") continue;
    if (!(await claim(`rijschool-automail:proefles:${les.id}`, nu))) continue;
    if (await verstuur(naProeflesMail(r, les.leerling))) n++;
  }
  return n;
}

/** Actieve leerlingen zonder les in 3 weken en zonder geplande les. */
async function stilRonde(r: Rijschool, nu: Date): Promise<number> {
  const grens = new Date(nu.getTime() - 21 * DAG);
  const leerlingen = await prisma.rijschoolLeerling.findMany({
    where: {
      rijschoolId: r.id,
      status: "ACTIEF",
      createdAt: { lt: grens },
      lessen: { none: { OR: [{ status: "GEPLAND", start: { gt: nu } }, { status: "VOLTOOID", eind: { gte: grens } }] } },
    },
    select: { id: true, naam: true, email: true },
    take: 500,
  });
  let n = 0;
  for (const l of leerlingen) {
    if (l.email.endsWith("@zekerflex.com")) continue; // testaccount voor de beoordelaar van Google
    if (!(await claimPer(`rijschool-automail:stil:${l.id}`, 30, nu))) continue;
    if (await verstuur(langNietGeredenMail(r, l))) n++;
  }
  return n;
}

/** Direct na "Geslaagd" in het beheer. true = gemaild. */
export async function stuurGeslaagd(r: Rijschool, l: { id: string; naam: string; email: string }, nu = new Date()): Promise<boolean> {
  if (!(await automailInstellingen(r.id)).geslaagd) return false;
  if (!(await claim(`rijschool-automail:geslaagd:${l.id}`, nu))) return false;
  return verstuur(geslaagdMail(r, l));
}
