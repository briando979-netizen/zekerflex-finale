import { GpsEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamStartOfDay } from "@/lib/time/amsterdam";
import { recordGpsEvent } from "@/lib/timesheets/checkin";
import { userIdFromToken } from "@/lib/passport/token";
import { fobHash, isCode, kiesDienst, leesPaspoortToken, leesSerie, nieuweCode, nieuweSleutel, otpGeldig, sleutelHash, volgendeActie, voornaam, NA_MS, VOOR_MS, type Actie, type DienstVandaag } from "@/lib/incheck/regels";

// ---------------------------------------------------------------------------
// Terminals en sleutelhangers (lib/incheck/regels.ts) in de KeyValueStore:
//   terminal:<tenantId>:<id>   — de terminal zelf (naam, vestiging, code, hash van de sleutel)
//   terminal-code:<code>       — openbare code (sticker, QR) → terminal
//   terminal-sleutel:<hash>    — sleutel van het scherm → terminal (de sleutel zelf staat nergens)
//   nfc-fob:<hash>             — sleutelhanger → gebruiker (het serienummer staat nergens)
//   nfc-fob-user:<userId>      — de sleutelhangers van een gebruiker (AVG: wisbaar, lib/privacy/user-kv.ts)
//   nfc-koppel:<terminalId>    — "houd nu je sleutelhanger tegen de tablet" (twee minuten)
// Een check-in via de terminal is een gewoon GPS-event op de plek van de
// vestiging zelf (deviceHash "terminal:<id>"), dus de rest van het platform
// (urenbriefje, goedkeuren, factuur) werkt zoals altijd.
// ---------------------------------------------------------------------------

export interface Terminal {
  id: string;
  tenantId: string;
  branchId: string;
  naam: string;
  /** openbare code op de sticker en in de QR */
  code: string;
  sleutelHash: string;
  actief: boolean;
  createdAt: string;
  /** wanneer het scherm voor het laatst om een code vroeg */
  laatstGezien?: string | undefined;
}

export interface TerminalVerwijzing {
  tenantId: string;
  id: string;
}

interface FobKoppeling {
  userId: string;
  at: string;
  terminalId: string;
}

interface FobVanGebruiker {
  hash: string;
  at: string;
}

const KEY = (tenantId: string, id: string) => `terminal:${tenantId}:${id}`;
const CODE = (code: string) => `terminal-code:${code}`;
const SLEUTEL = (hash: string) => `terminal-sleutel:${hash}`;
const FOB = (hash: string) => `nfc-fob:${hash}`;
const FOBS_VAN = (userId: string) => `nfc-fob-user:${userId}`;
const KOPPEL = (terminalId: string) => `nfc-koppel:${terminalId}`;
const KOPPEL_MS = 2 * 60_000;
export const MAX_TERMINALS = 25;
export const MAX_FOBS = 5;

const isId = (s: unknown): s is string => typeof s === "string" && /^t[a-z0-9]{8,24}$/.test(s);

export async function terminalsVan(tenantId: string): Promise<Terminal[]> {
  const lijst = await kvListValues<Terminal>(`terminal:${tenantId}:`, 100);
  return lijst.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function terminalVan(tenantId: string, id: string): Promise<Terminal | null> {
  return isId(id) ? kvGet<Terminal>(KEY(tenantId, id)) : null;
}

/** Een nieuwe terminal voor een vestiging van dit bedrijf. Geeft ook de sleutel van het scherm terug: die zie je alleen nu. */
export async function maakTerminal(tenantId: string, branchId: string, naam: string): Promise<{ terminal: Terminal; sleutel: string }> {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
  if (!branch) throw AppError.notFound("Deze vestiging hoort niet bij je bedrijf.");
  if ((await terminalsVan(tenantId)).length >= MAX_TERMINALS) throw AppError.validation(`Je kunt hoogstens ${MAX_TERMINALS} terminals hebben.`);
  const id = `t${Date.now().toString(36)}${nieuweCode().slice(0, 6).toLowerCase()}`;
  const code = nieuweCode();
  const sleutel = nieuweSleutel();
  const terminal: Terminal = { id, tenantId, branchId, naam: naam.trim().slice(0, 60) || "Terminal", code, sleutelHash: sleutelHash(sleutel), actief: true, createdAt: new Date().toISOString() };
  await kvSet(KEY(tenantId, id), terminal);
  await kvSet(CODE(code), { tenantId, id } satisfies TerminalVerwijzing);
  await kvSet(SLEUTEL(terminal.sleutelHash), { tenantId, id } satisfies TerminalVerwijzing);
  return { terminal, sleutel };
}

export async function wijzigTerminal(tenantId: string, id: string, patch: { naam?: string | undefined; actief?: boolean | undefined }): Promise<Terminal> {
  const t = await terminalVan(tenantId, id);
  if (!t) throw AppError.notFound("Deze terminal bestaat niet.");
  const next: Terminal = { ...t, ...(patch.naam !== undefined ? { naam: patch.naam.trim().slice(0, 60) || t.naam } : {}), ...(patch.actief !== undefined ? { actief: patch.actief } : {}) };
  await kvSet(KEY(tenantId, id), next);
  return next;
}

/** Een nieuwe sleutel voor het scherm: de oude tablet-link werkt daarna niet meer. */
export async function vernieuwSleutel(tenantId: string, id: string): Promise<{ terminal: Terminal; sleutel: string }> {
  const t = await terminalVan(tenantId, id);
  if (!t) throw AppError.notFound("Deze terminal bestaat niet.");
  const sleutel = nieuweSleutel();
  const next: Terminal = { ...t, sleutelHash: sleutelHash(sleutel) };
  await kvDelete(SLEUTEL(t.sleutelHash));
  await kvSet(SLEUTEL(next.sleutelHash), { tenantId, id } satisfies TerminalVerwijzing);
  await kvSet(KEY(tenantId, id), next);
  return { terminal: next, sleutel };
}

export async function verwijderTerminal(tenantId: string, id: string): Promise<void> {
  const t = await terminalVan(tenantId, id);
  if (!t) return;
  await kvDelete(CODE(t.code));
  await kvDelete(SLEUTEL(t.sleutelHash));
  await kvDelete(KOPPEL(t.id));
  await kvDelete(KEY(tenantId, id));
}

/** De terminal achter een openbare code (sticker, QR); null als die er niet is of uit staat. */
export async function terminalVanCode(code: string): Promise<Terminal | null> {
  if (!isCode(code)) return null;
  const v = await kvGet<TerminalVerwijzing>(CODE(code));
  const t = v ? await kvGet<Terminal>(KEY(v.tenantId, v.id)) : null;
  return t?.actief ? t : null;
}

/** De terminal achter de sleutel van een scherm; null bij een onbekende of ingetrokken sleutel. */
export async function terminalVanSleutel(sleutel: string): Promise<Terminal | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(sleutel)) return null;
  const v = await kvGet<TerminalVerwijzing>(SLEUTEL(sleutelHash(sleutel)));
  const t = v ? await kvGet<Terminal>(KEY(v.tenantId, v.id)) : null;
  return t?.actief ? t : null;
}

/** Het scherm vraagt elke minuut een nieuwe code: dat is ook de hartslag van de terminal. */
export async function markeerGezien(t: Terminal): Promise<void> {
  const laatst = t.laatstGezien ? Date.parse(t.laatstGezien) : 0;
  if (Date.now() - laatst < 5 * 60_000) return;
  await kvSet(KEY(t.tenantId, t.id), { ...t, laatstGezien: new Date().toISOString() } satisfies Terminal).catch(() => undefined);
}

// --- sleutelhangers ---------------------------------------------------------------

export async function fobsVan(userId: string): Promise<FobVanGebruiker[]> {
  return (await kvGet<{ fobs: FobVanGebruiker[] }>(FOBS_VAN(userId)))?.fobs ?? [];
}

/** "Houd nu je sleutelhanger tegen de tablet": twee minuten lang hoort de volgende hanger bij deze gebruiker. */
export async function startKoppeling(terminalId: string, userId: string): Promise<{ tot: string }> {
  if ((await fobsVan(userId)).length >= MAX_FOBS) throw AppError.validation(`Je kunt hoogstens ${MAX_FOBS} sleutelhangers koppelen.`);
  const tot = new Date(Date.now() + KOPPEL_MS).toISOString();
  await kvSet(KOPPEL(terminalId), { userId, tot });
  return { tot };
}

export async function koppelingOpen(terminalId: string): Promise<{ userId: string; tot: string } | null> {
  const k = await kvGet<{ userId: string; tot: string }>(KOPPEL(terminalId));
  return k && Date.parse(k.tot) > Date.now() ? k : null;
}

async function koppelFob(terminalId: string, userId: string, hash: string): Promise<void> {
  const al = await kvGet<FobKoppeling>(FOB(hash));
  if (al && al.userId !== userId) throw AppError.conflict("Deze sleutelhanger hoort al bij iemand anders.");
  await kvSet(FOB(hash), { userId, at: new Date().toISOString(), terminalId } satisfies FobKoppeling);
  const fobs = (await fobsVan(userId)).filter((f) => f.hash !== hash);
  await kvSet(FOBS_VAN(userId), { fobs: [...fobs, { hash, at: new Date().toISOString() }].slice(-MAX_FOBS) });
  await kvDelete(KOPPEL(terminalId));
}

export async function ontkoppelFob(userId: string, hash: string): Promise<void> {
  const k = await kvGet<FobKoppeling>(FOB(hash));
  if (k?.userId === userId) await kvDelete(FOB(hash));
  await kvSet(FOBS_VAN(userId), { fobs: (await fobsVan(userId)).filter((f) => f.hash !== hash) });
}

/** Bij een verwijderverzoek: ook de koppelingen van de hangers zelf weg (de lijst per gebruiker gaat via ERASABLE_KV_PREFIXES). */
export async function wisFobsVan(userId: string): Promise<void> {
  for (const f of await fobsVan(userId)) await kvDelete(FOB(f.hash)).catch(() => undefined);
}

// --- inchecken --------------------------------------------------------------------

export type IncheckVia = "scherm" | "sticker" | "sleutelhanger" | "paspoort";

export interface IncheckUitslag {
  ok: boolean;
  /** "in", "uit", of waarom het niet kon */
  actie: Actie | "klaar" | "geen-dienst" | "geen-urenbriefje" | "onbekend";
  naam: string;
  voornaam: string;
  tijd: string;
  dienst: { titel: string; start: string; eind: string; shiftId: string } | null;
  /** de sleutelhanger is zojuist gekoppeld (in plaats van ingecheckt) */
  gekoppeld?: boolean;
}

async function dienstenVanVandaag(freelancerId: string, branchId: string, nu: number): Promise<DienstVandaag[]> {
  const rows = await prisma.shiftAssignment.findMany({
    where: {
      freelancerId,
      cancelledAt: null,
      shift: { branchId, startsAt: { lte: new Date(nu + VOOR_MS) }, endsAt: { gte: new Date(nu - NA_MS) } },
    },
    select: {
      id: true,
      shiftId: true,
      shift: { select: { title: true, startsAt: true, endsAt: true } },
      timesheet: { select: { id: true, status: true, gpsEvents: { select: { type: true } } } },
    },
    take: 10,
  });
  return rows.map((r) => ({
    assignmentId: r.id,
    shiftId: r.shiftId,
    titel: r.shift.title,
    start: r.shift.startsAt,
    eind: r.shift.endsAt,
    timesheetId: r.timesheet?.id ?? null,
    timesheetStatus: r.timesheet?.status ?? null,
    ingecheckt: Boolean(r.timesheet?.gpsEvents.some((e) => e.type === GpsEventType.CHECK_IN)),
    uitgecheckt: Boolean(r.timesheet?.gpsEvents.some((e) => e.type === GpsEventType.CHECK_OUT)),
  }));
}

/** Wat de volgende tik van deze gebruiker bij deze terminal zou doen (voor het scherm op de telefoon). */
export async function standVoor(userId: string, t: Terminal, nu = Date.now()): Promise<{ dienst: DienstVandaag | null; actie: Actie | "klaar" | null; vestiging: string }> {
  const [profile, branch] = await Promise.all([
    prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.branch.findUnique({ where: { id: t.branchId }, select: { name: true } }),
  ]);
  if (!profile) return { dienst: null, actie: null, vestiging: branch?.name ?? "" };
  const dienst = kiesDienst(await dienstenVanVandaag(profile.id, t.branchId, nu), nu);
  return { dienst, actie: dienst ? (volgendeActie(dienst) ?? "klaar") : null, vestiging: branch?.name ?? "" };
}

/**
 * Een kracht checkt in of uit bij een terminal. De positie is die van de vestiging zelf, dus
 * altijd binnen de geofence; het apparaat is de terminal (geen apparaatcontrole per kracht).
 */
export async function checkInBij(userId: string, t: Terminal, via: IncheckVia, nu = Date.now()): Promise<IncheckUitslag> {
  const [user, profile, branch] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, disabledAt: true } }),
    prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.branch.findUnique({ where: { id: t.branchId }, select: { latitude: true, longitude: true } }),
  ]);
  const tijd = new Date(nu).toISOString();
  if (!user || user.disabledAt || !profile || !branch) return { ok: false, actie: "onbekend", naam: "", voornaam: "", tijd, dienst: null };
  const naam = user.fullName;
  const dienst = kiesDienst(await dienstenVanVandaag(profile.id, t.branchId, nu), nu);
  if (!dienst) return { ok: false, actie: "geen-dienst", naam, voornaam: voornaam(naam), tijd, dienst: null };
  const info = { titel: dienst.titel, start: dienst.start.toISOString(), eind: dienst.eind.toISOString(), shiftId: dienst.shiftId };
  const actie = volgendeActie(dienst);
  if (!actie) return { ok: false, actie: "klaar", naam, voornaam: voornaam(naam), tijd, dienst: info };
  if (!dienst.timesheetId || dienst.timesheetStatus !== "DRAFT") return { ok: false, actie: "geen-urenbriefje", naam, voornaam: voornaam(naam), tijd, dienst: info };

  const result = await recordGpsEvent({
    timesheetId: dienst.timesheetId,
    freelancerProfileId: profile.id,
    type: actie === "in" ? GpsEventType.CHECK_IN : GpsEventType.CHECK_OUT,
    latitude: branch.latitude,
    longitude: branch.longitude,
    accuracyMeters: 0,
    deviceHash: `terminal:${t.id}`,
    bron: "terminal",
  });
  logger.info("terminal check-in", { terminalId: t.id, via, actie, shiftId: dienst.shiftId });
  return { ok: true, actie, naam, voornaam: voornaam(naam), tijd: result.recordedAt, dienst: info };
}

/** Een tik op de terminal: een sleutelhanger (serienummer) of een gescand werkpaspoort. */
export async function tikOpTerminal(t: Terminal, invoer: { serie?: string | undefined; paspoort?: string | undefined }): Promise<IncheckUitslag> {
  const leeg = (actie: IncheckUitslag["actie"]): IncheckUitslag => ({ ok: false, actie, naam: "", voornaam: "", tijd: new Date().toISOString(), dienst: null });
  const serie = leesSerie(invoer.serie);
  if (serie) {
    const hash = fobHash(serie);
    const koppeling = await koppelingOpen(t.id);
    if (koppeling) {
      await koppelFob(t.id, koppeling.userId, hash);
      const u = await prisma.user.findUnique({ where: { id: koppeling.userId }, select: { fullName: true } });
      const naam = u?.fullName ?? "";
      return { ok: true, actie: "klaar", naam, voornaam: voornaam(naam), tijd: new Date().toISOString(), dienst: null, gekoppeld: true };
    }
    const fob = await kvGet<FobKoppeling>(FOB(hash));
    if (!fob) return leeg("onbekend");
    return checkInBij(fob.userId, t, "sleutelhanger");
  }
  const token = invoer.paspoort ? leesPaspoortToken(invoer.paspoort) : null;
  const userId = token ? userIdFromToken(token) : null;
  if (!userId) return leeg("onbekend");
  return checkInBij(userId, t, "paspoort");
}

/** Een kracht scant de QR op het scherm (met code van dat moment) of tikt de sticker (zonder code). */
export async function checkInViaTelefoon(userId: string, code: string, otp: string | null): Promise<{ uitslag: IncheckUitslag; terminal: Terminal } | null> {
  const t = await terminalVanCode(code);
  if (!t) return null;
  const via: IncheckVia = otp ? (otpGeldig(t.id, otp) ? "scherm" : "sticker") : "sticker";
  return { uitslag: await checkInBij(userId, t, via), terminal: t };
}

export interface TerminalRegel {
  tijd: string;
  type: "in" | "uit";
  naam: string;
  terminalId: string;
  dienst: string;
}

/** De check-ins van vandaag via terminals van dit bedrijf (voor het overzicht van de werkgever). */
export async function terminalRegelsVanVandaag(tenantId: string, nu = new Date()): Promise<TerminalRegel[]> {
  const events = await prisma.gpsEvent.findMany({
    where: {
      deviceHash: { startsWith: "terminal:" },
      type: { in: [GpsEventType.CHECK_IN, GpsEventType.CHECK_OUT] },
      recordedAt: { gte: amsterdamStartOfDay(nu) },
      timesheet: { branch: { tenantId } },
    },
    select: { recordedAt: true, type: true, deviceHash: true, timesheet: { select: { freelancer: { select: { user: { select: { fullName: true } } } }, assignment: { select: { shift: { select: { title: true } } } } } } },
    orderBy: { recordedAt: "desc" },
    take: 200,
  });
  return events.map((e) => ({
    tijd: e.recordedAt.toISOString(),
    type: e.type === GpsEventType.CHECK_IN ? "in" : "uit",
    naam: e.timesheet.freelancer.user.fullName,
    terminalId: e.deviceHash.slice("terminal:".length),
    dienst: e.timesheet.assignment.shift.title,
  }));
}
