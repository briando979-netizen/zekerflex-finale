import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvGet, kvGetMany, kvSet } from "@/lib/storage/kv";
import { haversineMeters } from "@/lib/geo/geofencing";
import { isMatchEligibleWorker } from "@/lib/matching/engine";
import { blockedUserIdsForTenants } from "@/lib/employer/relations";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { WORKER_PUSH, pushRate, pushWhen } from "@/lib/i18n/worker-push";
import { userLocale, userLocales } from "@/lib/i18n/worker-locale";
import { applyToShift } from "@/lib/matching/apply";
import { kanalenBeschikbaar, stuurSms, stuurWhatsApp } from "@/lib/spoed/kanalen";
import { zonderTestwerker } from "@/lib/testwerker/adres";
import { zonderNummers } from "@/lib/telephony/log-nummer";
import {
  MAX_ONTVANGERS,
  isOpen,
  kiesOntvangers,
  kiesWachtende,
  leesAntwoord,
  normaliseerTelefoon,
  telefoonStaart,
  telling,
  verlooptOp,
  voegWachtToe,
  type Kanaal,
  type SpoedOntvanger,
  type SpoedOproep,
  type SpoedWacht,
} from "@/lib/spoed/regels";

// ---------------------------------------------------------------------------
// De spoedoproep zelf (zie lib/spoed/regels.ts voor de regels). Opslag in de
// KeyValueStore, geen migratie:
//   spoed:<shiftId>        de oproep met zijn ontvangers en antwoorden
//   spoed-wacht:<userId>   welke oproepen een "1" of "2" van deze kracht bedoelt
//   spoed-uit:<userId>     de kracht wil geen sms/WhatsApp (STOP of de schakelaar)
// De laatste twee staan in ERASABLE_KV_PREFIXES (AVG).
// ---------------------------------------------------------------------------

const OPEN_STATUSSEN = ["OPEN", "MATCHING", "PARTIALLY_FILLED"];
const key = (shiftId: string) => `spoed:${shiftId}`;
const wachtKey = (userId: string) => `spoed-wacht:${userId}`;
const uitKey = (userId: string) => `spoed-uit:${userId}`;

export async function spoedStand(shiftId: string): Promise<SpoedOproep | null> {
  return kvGet<SpoedOproep>(key(shiftId));
}

export async function stopSpoedoproep(shiftId: string): Promise<void> {
  const o = await spoedStand(shiftId);
  if (!o || o.gestopt) return;
  await kvSet(key(shiftId), { ...o, gestopt: new Date().toISOString() });
}

export async function spoedUitVoor(userId: string): Promise<boolean> {
  return Boolean(await kvGet(uitKey(userId)));
}

export async function zetSpoedUit(userId: string, uit: boolean): Promise<void> {
  if (uit) await kvSet(uitKey(userId), { at: new Date().toISOString() });
  else await prisma.keyValueStore.deleteMany({ where: { key: uitKey(userId) } });
}

export interface StartInput {
  shiftId: string;
  tenantId: string;
  userId: string;
  radiusKm: number;
  kanalen: Kanaal[];
}

export interface StartUitkomst {
  oproep: SpoedOproep;
  /** hoeveel krachten deze ronde zijn bereikt */
  nieuw: number;
  /** hoeveel sms/WhatsApp-berichten niet weg konden */
  mislukt: number;
}

/**
 * Stuurt de oproep naar de dichtstbijzijnde geschikte krachten die nog niet
 * zijn benaderd. Een tweede ronde (zelfde dienst, oproep nog open) bereikt
 * alleen nieuwe mensen, bijvoorbeeld met een grotere straal.
 */
export async function startSpoedoproep(input: StartInput): Promise<StartUitkomst> {
  const nu = new Date();
  const shift = await prisma.shift.findFirst({
    where: { id: input.shiftId, branch: { tenantId: input.tenantId } },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      hourlyRateCents: true,
      positions: true,
      status: true,
      requiredSkillId: true,
      viaUitzendbureau: true,
      branch: { select: { name: true, city: true, latitude: true, longitude: true, tenant: { select: { name: true } } } },
      assignments: { where: { cancelledAt: null }, select: { freelancerId: true } },
    },
  });
  if (!shift) throw AppError.notFound("Deze dienst bestaat niet.");
  if (!OPEN_STATUSSEN.includes(shift.status)) throw AppError.conflict("Deze dienst staat niet open voor aanmeldingen.");
  if (shift.assignments.length >= shift.positions) throw AppError.conflict("Deze dienst is al vol.");
  if (shift.endsAt.getTime() < nu.getTime()) throw AppError.conflict("Deze dienst is al afgelopen.");
  const blat = shift.branch.latitude;
  const blng = shift.branch.longitude;
  if (!Number.isFinite(blat) || !Number.isFinite(blng)) throw AppError.precondition("De vestiging heeft nog geen locatie; vul het adres aan bij Vestigingen.");

  const bestaand = await spoedStand(shift.id);
  const open = bestaand && isOpen(bestaand, nu) ? bestaand : null;
  const alBereikt = new Set((open?.ontvangers ?? []).map((o) => o.userId));
  const alIngepland = new Set(shift.assignments.map((a) => a.freelancerId));
  const blocked = await blockedUserIdsForTenants([input.tenantId]).catch(() => new Set<string>());

  // kandidaten met een thuislocatie, grof rond de vestiging (±0,5° ≈ 55 km)
  const kandidaten = await prisma.freelancerProfile.findMany({
    where: {
      user: { disabledAt: null, ...zonderTestwerker() },
      homeLatitude: { gte: blat - 0.5, lte: blat + 0.5 },
      homeLongitude: { gte: blng - 0.8, lte: blng + 0.8 },
      ...(shift.requiredSkillId ? { skills: { some: { skillId: shift.requiredSkillId } } } : {}),
    },
    select: { id: true, userId: true, vatValid: true, kvkValid: true, country: true, homeLatitude: true, homeLongitude: true, user: { select: { fullName: true, phone: true } } },
    take: 800,
  });
  const dichtbij = kandidaten
    .filter((k) => !blocked.has(k.userId) && !alIngepland.has(k.id))
    .map((k) => ({ ...k, km: haversineMeters({ latitude: blat, longitude: blng }, { latitude: k.homeLatitude, longitude: k.homeLongitude }) / 1000 }));
  // de dichtstbijzijnde eerst, dan pas de (duurdere) geschiktheidscontrole
  const kandidaatRij = kiesOntvangers(dichtbij, alBereikt, input.radiusKm, MAX_ONTVANGERS * 3);
  const gekozen: typeof kandidaatRij = [];
  for (const k of kandidaatRij) {
    if (gekozen.length >= MAX_ONTVANGERS) break;
    if (await isMatchEligibleWorker(k, shift.viaUitzendbureau)) gekozen.push(k);
  }
  if (!gekozen.length) {
    throw AppError.precondition(alBereikt.size ? "Iedereen in deze straal is al bereikt. Probeer een grotere straal." : "Geen geschikte krachten gevonden in deze straal. Probeer een grotere straal.");
  }

  const beschikbaar = kanalenBeschikbaar();
  const kanalen = input.kanalen.filter((k) => beschikbaar[k]);
  if (!kanalen.includes("push")) kanalen.unshift("push");
  const link = `${env.APP_BASE_URL.replace(/\/+$/, "")}/dashboard/klussen/${shift.id}`;
  const bedrijf = shift.branch.tenant.name;
  const verloopt = open?.verloopt ?? verlooptOp(shift.startsAt, nu).toISOString();
  const ttl = Math.max(600, Math.round((Date.parse(verloopt) - nu.getTime()) / 1000));
  const userIds = gekozen.map((k) => k.userId);
  const locales = await userLocales(userIds);
  const uitKeys = await kvGetMany<{ at: string }>(userIds.map(uitKey));

  await sendLocalizedPush(userIds, (t, locale) => ({
    title: t.spoedTitle(shift.title),
    body: t.spoedBody(bedrijf, shift.branch.city, pushWhen(locale, shift), pushRate(t, shift.hourlyRateCents)),
    data: { type: "SHIFT", url: `/dashboard/klussen/${shift.id}`, tag: `spoed-${shift.id}` },
    ttlSeconds: ttl,
  })).catch(() => 0);

  let mislukt = 0;
  const ontvangers: SpoedOntvanger[] = [];
  for (const k of gekozen) {
    const via: Kanaal[] = ["push"];
    const tel = normaliseerTelefoon(k.user.phone);
    const wilGeenBerichten = uitKeys.has(uitKey(k.userId));
    if (tel && !wilGeenBerichten && (kanalen.includes("whatsapp") || kanalen.includes("sms"))) {
      const locale = locales.get(k.userId) ?? "nl";
      const t = WORKER_PUSH[locale];
      const tekst = t.spoedSms(shift.title, bedrijf, shift.branch.city, pushWhen(locale, shift), pushRate(t, shift.hourlyRateCents), link);
      const kanaal: Kanaal = kanalen.includes("whatsapp") ? "whatsapp" : "sms";
      try {
        if (kanaal === "whatsapp") await stuurWhatsApp(tel, tekst);
        else await stuurSms(tel, tekst);
        via.push(kanaal);
      } catch (err) {
        mislukt += 1;
        logger.warn("spoedoproep: bericht niet verstuurd", { kanaal, err: zonderNummers(err instanceof Error ? err.message : String(err)) });
      }
    }
    ontvangers.push({ userId: k.userId, naam: k.user.fullName, km: Math.round(k.km * 10) / 10, via, at: nu.toISOString() });
    const wacht = await kvGet<SpoedWacht>(wachtKey(k.userId));
    await kvSet(wachtKey(k.userId), voegWachtToe(wacht, shift.id, verloopt, nu));
  }

  const oproep: SpoedOproep = open
    ? { ...open, radiusKm: Math.max(open.radiusKm, input.radiusKm), kanalen: [...new Set([...open.kanalen, ...kanalen])], ontvangers: [...open.ontvangers, ...ontvangers] }
    : { shiftId: shift.id, tenantId: input.tenantId, gestartDoor: input.userId, at: nu.toISOString(), verloopt, radiusKm: input.radiusKm, kanalen, ontvangers };
  await kvSet(key(shift.id), oproep);
  logger.info("spoedoproep verstuurd", { shiftId: shift.id, nieuw: ontvangers.length, mislukt, kanalen });
  return { oproep, nieuw: ontvangers.length, mislukt };
}

/** Een kracht die in de app reageert: ook in de oproep bijschrijven (zodat de teller klopt). */
export async function noteerAppReactie(shiftId: string, userId: string): Promise<void> {
  const o = await spoedStand(shiftId);
  const r = o?.ontvangers.find((x) => x.userId === userId);
  if (!o || !r || r.antwoord) return;
  r.antwoord = "ja";
  r.antwoordAt = new Date().toISOString();
  r.uitkomst = "ingepland";
  await kvSet(key(shiftId), o);
}

/**
 * Een antwoord per sms of WhatsApp. Geeft de tekst terug die we terugsturen,
 * of null als het nummer niet van een kracht is (dan antwoorden we niet).
 */
export async function antwoordOpSpoed(telefoon: string, tekst: string, via: "sms" | "whatsapp"): Promise<string | null> {
  const tel = normaliseerTelefoon(telefoon);
  if (!tel) return null;
  const staart = telefoonStaart(tel);
  const users = await prisma.user.findMany({
    where: { phone: { endsWith: staart }, disabledAt: null, freelancerProfile: { isNot: null } },
    select: { id: true, phone: true },
    take: 5,
  });
  const user = users.find((u) => normaliseerTelefoon(u.phone) === tel) ?? (users.length === 1 ? users[0] : undefined);
  if (!user) return null;

  const locale = await userLocale(user.id);
  const t = WORKER_PUSH[locale];
  const antwoord = leesAntwoord(tekst);
  if (antwoord === "stop") {
    await zetSpoedUit(user.id, true);
    return t.spoedStopped;
  }
  if (!antwoord) return t.spoedUnknown;

  const nu = new Date();
  const wacht = await kvGet<SpoedWacht>(wachtKey(user.id));
  const shiftId = kiesWachtende(wacht, nu);
  if (!shiftId) return t.spoedNone;
  const o = await spoedStand(shiftId);
  const r = o?.ontvangers.find((x) => x.userId === user.id);
  if (!o || !r) return t.spoedNone;

  // deze oproep is beantwoord: van het wachtlijstje af
  await kvSet(wachtKey(user.id), { items: (wacht?.items ?? []).filter((i) => i.shiftId !== shiftId) });
  r.antwoord = antwoord;
  r.antwoordAt = nu.toISOString();
  if (antwoord === "nee") {
    await kvSet(key(shiftId), o);
    return t.spoedDeclined;
  }
  try {
    const uit = await applyToShift(user.id, shiftId);
    r.uitkomst = uit.pendingCompanyVerification ? "wacht op goedkeuring bedrijf" : "ingepland";
    await kvSet(key(shiftId), o);
    const shift = await prisma.shift.findUnique({ where: { id: shiftId }, select: { title: true, startsAt: true, endsAt: true } });
    if (!shift) return t.spoedNone;
    const link = `${env.APP_BASE_URL.replace(/\/+$/, "")}/dashboard/klussen/${shiftId}`;
    logger.info("spoedoproep: aangenomen via bericht", { shiftId, via });
    return uit.pendingCompanyVerification ? t.spoedPending(shift.title) : t.spoedAccepted(shift.title, pushWhen(locale, shift), link);
  } catch (err) {
    const reden = err instanceof AppError ? err.message : "probeer het in de app";
    r.uitkomst = reden;
    await kvSet(key(shiftId), o);
    return t.spoedFailed(reden);
  }
}

/** Voor het paneel van de opdrachtgever. */
export async function spoedOverzicht(shiftId: string): Promise<{ oproep: SpoedOproep | null; open: boolean; telling: ReturnType<typeof telling> | null; kanalen: Record<Kanaal, boolean> }> {
  const oproep = await spoedStand(shiftId);
  return { oproep, open: oproep ? isOpen(oproep) : false, telling: oproep ? telling(oproep) : null, kanalen: kanalenBeschikbaar() };
}
