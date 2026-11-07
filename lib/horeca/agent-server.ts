import type { HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { featureEnabled } from "@/lib/flags";
import { zaakVanSlug } from "@/lib/horeca/store";
import { heeftModule } from "@/lib/horeca/modules";
import { leesMet, tekenMet } from "@/lib/horeca/link";
import { annuleerUrl } from "@/lib/horeca/mail";
import { annuleerDoorGast, maakReservering, reserveringVoorGast, type NieuweReservering } from "@/lib/horeca/reserveringen";
import { idemOpslag, reserveringVoorAgent, verzoekAfdruk } from "@/lib/horeca/agent";

// ---------------------------------------------------------------------------
// Reserveren via AI-assistenten (/api/agent/horeca), het deel met database.
// Alleen zaken die online staan én de module reserveren aan hebben. Boeken gaat
// via maakReservering met bron "agent": dezelfde controle onder een slot als de
// eigen site. Het token in het antwoord is de ondertekende annuleerlink die de
// gast ook in zijn mail krijgt (lib/horeca/link.ts): bekijken en annuleren van
// precies die ene reservering.
// ---------------------------------------------------------------------------

const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");

async function aan(): Promise<void> {
  if (!(await featureEnabled("agent-horeca"))) {
    throw AppError.upstream("Reserveren via AI-assistenten staat even uit. Reserveer op de website van de zaak of bel even.");
  }
}

export async function agentZaken(): Promise<HorecaZaak[]> {
  await aan();
  return prisma.horecaZaak.findMany({ where: { online: true, modules: { has: "reserveren" } }, orderBy: { naam: "asc" }, take: 500 });
}

export async function agentZaak(slug: string): Promise<HorecaZaak> {
  await aan();
  const z = /^[a-z0-9-]{1,80}$/.test(slug) ? await zaakVanSlug(slug) : null;
  if (!z || !z.online || !heeftModule(z, "reserveren")) throw AppError.notFound("Bij deze zaak kun je niet online reserveren (of de zaak bestaat niet).");
  return z;
}

type Bewaard = { afdruk: string; id?: string };

/**
 * Boekt één keer per Idempotency-Key: dezelfde sleutel met hetzelfde verzoek
 * geeft de eerdere reservering terug (herhaald: true). Valt Redis weg, dan
 * boeken we gewoon (een storing mag reserveren niet blokkeren).
 */
export async function boekViaAgent(zaak: HorecaZaak, r: NieuweReservering, sleutel: string | null) {
  const maak = () => maakReservering(zaak, r, "agent");
  if (!sleutel) return { reservering: await maak(), herhaald: false };

  const opslag = idemOpslag(zaak.slug, sleutel);
  const afdruk = verzoekAfdruk(r);
  let eerder: string | null;
  try {
    eerder = await redis.get(opslag);
  } catch {
    return { reservering: await maak(), herhaald: false };
  }
  if (eerder) {
    const b = JSON.parse(eerder) as Bewaard;
    if (b.afdruk !== afdruk) throw AppError.conflict("Deze Idempotency-Key is al gebruikt voor een andere reservering. Gebruik voor een nieuwe reservering een nieuwe sleutel.");
    if (!b.id) throw AppError.conflict("Deze reservering wordt nog verwerkt. Probeer het over een paar seconden opnieuw met dezelfde sleutel.");
    const bestaand = await reserveringVoorGast(zaak.id, b.id);
    if (bestaand) return { reservering: bestaand, herhaald: true };
  }
  const geclaimd = await redis.set(opslag, JSON.stringify({ afdruk } satisfies Bewaard), "EX", 120, "NX").catch(() => "OK" as const);
  if (geclaimd !== "OK") throw AppError.conflict("Deze reservering wordt nog verwerkt. Probeer het over een paar seconden opnieuw met dezelfde sleutel.");
  try {
    const reservering = await maak();
    await redis.set(opslag, JSON.stringify({ afdruk, id: reservering.id } satisfies Bewaard), "EX", 86_400).catch(() => undefined);
    return { reservering, herhaald: false };
  } catch (err) {
    await redis.del(opslag).catch(() => undefined);
    throw err;
  }
}

export const agentToken = (id: string) => tekenMet(env.AUTH_SECRET, "annuleer", id);

/** Het antwoord voor de assistent bij een reservering. */
export function agentAntwoord(zaak: HorecaZaak, r: { id: string; datum: string; tijd: string; personen: number; naam: string; status: string }) {
  return reserveringVoorAgent(r, zaak, agentToken(r.id), basis(), annuleerUrl(zaak, r.id));
}

/** De reservering en zaak achter een token, of een nette 404. */
export async function agentReservering(token: string) {
  await aan();
  const id = leesMet(env.AUTH_SECRET, "annuleer", token);
  const r = id ? await prisma.horecaReservering.findUnique({ where: { id }, include: { zaak: true } }) : null;
  if (!r) throw AppError.notFound("Deze reservering bestaat niet (meer) of de link klopt niet.");
  const { zaak, ...reservering } = r;
  return { zaak, reservering };
}

export async function annuleerViaAgent(token: string) {
  const { zaak, reservering } = await agentReservering(token);
  await annuleerDoorGast(zaak, reservering.id);
  return { zaak, reservering: { ...reservering, status: "GEANNULEERD" as const } };
}
