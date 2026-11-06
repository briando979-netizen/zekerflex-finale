import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { kvAppend, kvDelete, kvFindByField, kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendUserPush } from "@/lib/notifications/push";
import { amsterdamClock } from "@/lib/time/amsterdam";
import {
  MARGE_NA_MS,
  MARGE_VOOR_MS,
  geldigKenteken,
  normaliseerKenteken,
  toegangsBesluit,
  toonKenteken,
  type Besluit,
  type Registratie,
  type RoosterTreffer,
  type ToegangSoort,
} from "@/lib/locatie/modules";
import { beheerdersVan } from "@/lib/locatie/store";

// ---------------------------------------------------------------------------
// Toegang op kenteken. Het kastje bij de slagboom (deploy/toegang) leest het
// kenteken met de camera en vraagt hier: mag deze auto nu het terrein op? Het
// besluit volgt het rooster; het kastje zelf zet de slagboom open. Alles in de
// KV en Redis (geen migratie):
//   toegang-registraties:<tenantId>  kentekens die het bedrijf kent (medewerkers, bezoekers, leveranciers)
//   voertuig:<userId>                het eigen kenteken van een werker (in ERASABLE_KV_PREFIXES)
//   toegang-vestiging:<tenantId>     per vestiging: aan, de hash van het kastje-token, instellingen
//   toegang-token:<hash>             welk bedrijf/vestiging bij een token hoort (het token zelf staat nergens)
//   toegang-log:<tenantId>           elke aankomst met het besluit (laatste 3000)
//   redis toegang-opdracht:<branchId> handmatig openen: het kastje haalt de opdracht op (120 s)
// ---------------------------------------------------------------------------

const REGISTRATIES = (t: string) => `toegang-registraties:${t}`;
const VOERTUIG = (u: string) => `voertuig:${u}`;
const VESTIGING = (t: string) => `toegang-vestiging:${t}`;
const TOKEN = (h: string) => `toegang-token:${h}`;
const LOG = (t: string) => `toegang-log:${t}`;
const OPDRACHT = (b: string) => `toegang-opdracht:${b}`;
const LOG_BEWAREN = 3000;

const hashToken = (token: string) => createHash("sha256").update(`zf-toegang:${token}`).digest("hex");

export interface Voertuig {
  kenteken: string;
  sinds: string;
}

export interface VestigingToegang {
  aan: boolean;
  /** sha256 van het token van het kastje; nooit het token zelf */
  tokenHash?: string;
  /** hoe lang het relais de slagboom aanstuurt */
  openSeconden: number;
  /** de beheerders van de vestiging krijgen een melding bij elke aankomst */
  meldPlanner: boolean;
  /** de werker krijgt een welkomstbericht als de slagboom voor hem opengaat */
  meldWerker: boolean;
  sinds: string;
  /** het kastje meldde zich voor het laatst */
  laatstGezien?: string;
  apparaat?: string;
}

export interface ToegangEvent {
  id: string;
  at: string;
  branchId: string;
  kenteken: string;
  besluit: Besluit;
  bron: "camera" | "handmatig" | "proef";
  camera?: string;
}

/* ─────────────── eigen voertuig van een werker ─────────────── */

export async function mijnVoertuig(userId: string): Promise<Voertuig | null> {
  return kvGet<Voertuig>(VOERTUIG(userId));
}

export async function zetMijnVoertuig(userId: string, kenteken: string | null): Promise<Voertuig | null> {
  if (!kenteken) {
    await kvDelete(VOERTUIG(userId));
    return null;
  }
  if (!geldigKenteken(kenteken)) throw AppError.validation("Dat lijkt geen kenteken. Vul letters en cijfers in, bijvoorbeeld AB-123-C.");
  const v: Voertuig = { kenteken: normaliseerKenteken(kenteken), sinds: new Date().toISOString() };
  await kvSet(VOERTUIG(userId), v);
  return v;
}

/* ─────────────── registraties van het bedrijf ─────────────── */

export async function registraties(tenantId: string): Promise<Registratie[]> {
  const map = (await kvGet<Record<string, Registratie>>(REGISTRATIES(tenantId))) ?? {};
  return Object.values(map).sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

export interface RegistratieInvoer {
  kenteken: string;
  soort: ToegangSoort;
  naam: string;
  branchId?: string | undefined;
  geldigVan?: string | undefined;
  geldigTot?: string | undefined;
  toelichting?: string | undefined;
  userId?: string | undefined;
}

export async function zetRegistratie(tenantId: string, input: RegistratieInvoer, door: string): Promise<Registratie> {
  if (!geldigKenteken(input.kenteken)) throw AppError.validation("Dat lijkt geen kenteken. Vul letters en cijfers in, bijvoorbeeld AB-123-C.");
  const naam = input.naam.trim().slice(0, 80);
  if (!naam) throw AppError.validation("Vul een naam in.");
  if ((input.soort === "bezoeker" || input.soort === "leverancier") && input.geldigVan && input.geldigTot && input.geldigVan > input.geldigTot) {
    throw AppError.validation("Het einde van het tijdvenster ligt vóór het begin.");
  }
  const kenteken = normaliseerKenteken(input.kenteken);
  const reg: Registratie = {
    kenteken,
    soort: input.soort,
    naam,
    door,
    sinds: new Date().toISOString(),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.geldigVan ? { geldigVan: input.geldigVan } : {}),
    ...(input.geldigTot ? { geldigTot: input.geldigTot } : {}),
    ...(input.toelichting?.trim() ? { toelichting: input.toelichting.trim().slice(0, 300) } : {}),
  };
  const map = (await kvGet<Record<string, Registratie>>(REGISTRATIES(tenantId))) ?? {};
  if (Object.keys(map).length >= 2000 && !map[kenteken]) throw AppError.validation("Maximaal 2000 kentekens per bedrijf.");
  map[kenteken] = reg;
  await kvSet(REGISTRATIES(tenantId), map);
  return reg;
}

export async function verwijderRegistratie(tenantId: string, kenteken: string): Promise<void> {
  const map = (await kvGet<Record<string, Registratie>>(REGISTRATIES(tenantId))) ?? {};
  delete map[normaliseerKenteken(kenteken)];
  await kvSet(REGISTRATIES(tenantId), map);
}

/* ─────────────── vestigingen en het kastje ─────────────── */

export async function vestigingToegang(tenantId: string): Promise<Record<string, VestigingToegang>> {
  return (await kvGet<Record<string, VestigingToegang>>(VESTIGING(tenantId))) ?? {};
}

const standaard = (): VestigingToegang => ({ aan: true, openSeconden: 3, meldPlanner: true, meldWerker: true, sinds: new Date().toISOString() });

export async function zetVestigingToegang(
  tenantId: string,
  branchId: string,
  patch: { aan?: boolean | undefined; openSeconden?: number | undefined; meldPlanner?: boolean | undefined; meldWerker?: boolean | undefined },
): Promise<VestigingToegang> {
  const alles = await vestigingToegang(tenantId);
  const huidig = alles[branchId] ?? standaard();
  const nieuw: VestigingToegang = {
    ...huidig,
    ...(patch.aan !== undefined ? { aan: patch.aan } : {}),
    ...(patch.openSeconden !== undefined ? { openSeconden: Math.min(60, Math.max(1, Math.round(patch.openSeconden))) } : {}),
    ...(patch.meldPlanner !== undefined ? { meldPlanner: patch.meldPlanner } : {}),
    ...(patch.meldWerker !== undefined ? { meldWerker: patch.meldWerker } : {}),
  };
  alles[branchId] = nieuw;
  await kvSet(VESTIGING(tenantId), alles);
  return nieuw;
}

/** Een (nieuw) token voor het kastje van deze vestiging; het oude werkt daarna niet meer. Het token zie je één keer. */
export async function maakKastjeToken(tenantId: string, branchId: string): Promise<{ token: string; vestiging: VestigingToegang }> {
  const alles = await vestigingToegang(tenantId);
  const huidig = alles[branchId] ?? standaard();
  if (huidig.tokenHash) await kvDelete(TOKEN(huidig.tokenHash));
  const token = `zft_${randomBytes(24).toString("base64url")}`;
  const tokenHash = hashToken(token);
  const nieuw: VestigingToegang = { ...huidig, tokenHash };
  delete nieuw.laatstGezien;
  delete nieuw.apparaat;
  alles[branchId] = nieuw;
  await kvSet(VESTIGING(tenantId), alles);
  await kvSet(TOKEN(tokenHash), { tenantId, branchId });
  return { token, vestiging: nieuw };
}

/** Welk bedrijf en welke vestiging horen bij het token van een kastje? */
export async function vestigingVanToken(token: string | null | undefined): Promise<{ tenantId: string; branchId: string } | null> {
  if (!token || token.length < 20 || token.length > 120) return null;
  const hit = await kvGet<{ tenantId: string; branchId: string }>(TOKEN(hashToken(token)));
  if (!hit) return null;
  const alles = await vestigingToegang(hit.tenantId);
  if (alles[hit.branchId]?.tokenHash !== hashToken(token)) return null;
  return hit;
}

/** Het kastje meldde zich (bij elke vraag of elke poll): zo zie je of het nog leeft. */
export async function kastjeGezien(tenantId: string, branchId: string, apparaat: string | null): Promise<void> {
  const alles = await vestigingToegang(tenantId);
  const huidig = alles[branchId];
  if (!huidig) return;
  const nu = new Date().toISOString();
  // niet bij elke poll schrijven: eens per minuut is genoeg
  if (huidig.laatstGezien && Date.parse(nu) - Date.parse(huidig.laatstGezien) < 60_000 && (!apparaat || huidig.apparaat === apparaat)) return;
  alles[branchId] = { ...huidig, laatstGezien: nu, ...(apparaat ? { apparaat: apparaat.slice(0, 60) } : {}) };
  await kvSet(VESTIGING(tenantId), alles);
}

/* ─────────────── het besluit ─────────────── */

/** Staat deze werker nu (met marge) op deze vestiging ingepland? */
export async function roosterTreffer(userId: string, branchId: string, nu: Date): Promise<RoosterTreffer> {
  const a = await prisma.shiftAssignment.findFirst({
    where: {
      cancelledAt: null,
      freelancer: { userId },
      shift: {
        branchId,
        status: { notIn: ["CANCELLED", "DRAFT"] },
        startsAt: { lte: new Date(nu.getTime() + MARGE_VOOR_MS) },
        endsAt: { gte: new Date(nu.getTime() - MARGE_NA_MS) },
      },
    },
    select: { shiftId: true, shift: { select: { title: true } } },
    orderBy: { shift: { startsAt: "asc" } },
  });
  return a ? { ingepland: true, shiftId: a.shiftId, shiftTitel: a.shift.title } : { ingepland: false };
}

/** Wie hoort bij dit kenteken: eerst de lijst van het bedrijf, dan het eigen kenteken van een werker. */
export async function zoekRegistratie(tenantId: string, kenteken: string): Promise<Registratie | null> {
  const k = normaliseerKenteken(kenteken);
  if (!k) return null;
  const map = (await kvGet<Record<string, Registratie>>(REGISTRATIES(tenantId))) ?? {};
  const eigen = map[k];
  if (eigen) return eigen;
  const voertuigen = await kvFindByField<Voertuig & { userId?: string }>("voertuig:", "kenteken", k, 5);
  if (voertuigen.length === 0) return null;
  // de sleutel draagt de userId; kvFindByField geeft alleen waarden, dus zoek de eigenaar erbij
  const rows = await prisma.$queryRaw<{ key: string }[]>`SELECT key FROM "KeyValueStore" WHERE key LIKE 'voertuig:%' AND value->>'kenteken' = ${k} LIMIT 5`;
  for (const r of rows) {
    const userId = r.key.slice("voertuig:".length);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, disabledAt: true } });
    if (!user || user.disabledAt) continue;
    return { kenteken: k, soort: "werker", naam: user.fullName, userId, door: userId, sinds: voertuigen[0]?.sinds ?? new Date().toISOString() };
  }
  return null;
}

export interface Aankomst {
  tenantId: string;
  branchId: string;
  kenteken: string;
  bron: ToegangEvent["bron"];
  camera?: string | undefined;
  nu?: Date;
}

/** Het complete besluit bij een aankomst: opzoeken, rooster, loggen en melden. */
export async function verwerkAankomst(a: Aankomst): Promise<{ event: ToegangEvent; openSeconden: number }> {
  const nu = a.nu ?? new Date();
  const kenteken = normaliseerKenteken(a.kenteken);
  const [reg, vestigingen] = await Promise.all([zoekRegistratie(a.tenantId, kenteken), vestigingToegang(a.tenantId)]);
  const instel = vestigingen[a.branchId] ?? standaard();
  const rooster = reg?.soort === "werker" && reg.userId ? await roosterTreffer(reg.userId, a.branchId, nu) : null;
  const besluit: Besluit = instel.aan ? toegangsBesluit(reg, a.branchId, rooster, nu) : { open: false, reden: "onbekend" };
  const event: ToegangEvent = {
    id: randomBytes(6).toString("hex"),
    at: nu.toISOString(),
    branchId: a.branchId,
    kenteken,
    besluit,
    bron: a.bron,
    ...(a.camera ? { camera: a.camera.slice(0, 60) } : {}),
  };
  await kvAppend(LOG(a.tenantId), event, LOG_BEWAREN);
  if (a.bron !== "proef") void meld(a.tenantId, a.branchId, event, instel, rooster).catch((e: unknown) => logger.warn("toegang: melding mislukt", { message: e instanceof Error ? e.message : String(e) }));
  return { event, openSeconden: instel.openSeconden };
}

async function meld(tenantId: string, branchId: string, event: ToegangEvent, instel: VestigingToegang, rooster: RoosterTreffer | null): Promise<void> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } });
  const vestiging = b?.name ?? "de vestiging";
  const tijd = amsterdamClock(event.at);
  const plaat = toonKenteken(event.kenteken);
  if (instel.meldPlanner) {
    const ids = await beheerdersVan(tenantId, branchId);
    const kop = event.besluit.open ? `🚗 ${event.besluit.naam} is aangekomen` : `🚧 Onbekende auto bij ${vestiging}`;
    const body = event.besluit.open
      ? `${plaat} bij ${vestiging} om ${tijd}${rooster?.shiftTitel ? ` · ${rooster.shiftTitel}` : ""}. De slagboom is open.`
      : `${plaat} om ${tijd}: ${event.besluit.naam ? `${event.besluit.naam}, ` : ""}${event.besluit.reden === "onbekend" ? "niet in de lijst" : "nu niet ingepland"}. Niet geopend.`;
    if (ids.length) await sendUserPush(ids, { title: kop, body, data: { type: "SHIFT", url: "/werkgever/op-locatie?tab=toegang", tag: `toegang-${branchId}` }, ttlSeconds: 3600 });
  }
  if (instel.meldWerker && event.besluit.open && event.besluit.userId) {
    await sendUserPush([event.besluit.userId], {
      title: `👋 Welkom bij ${vestiging}`,
      body: `Je kenteken ${plaat} is herkend, de slagboom gaat open. Vergeet niet in te checken in de app.`,
      data: { type: "SHIFT", url: rooster?.shiftId ? `/dashboard/klussen/${rooster.shiftId}` : "/dashboard/klussen", tag: `welkom-${branchId}` },
      ttlSeconds: 900,
    });
  }
}

export async function toegangLog(tenantId: string, limit = 200, branchIds: string[] | null = null): Promise<ToegangEvent[]> {
  const alles = (await kvGet<ToegangEvent[]>(LOG(tenantId))) ?? [];
  const gefilterd = branchIds ? alles.filter((e) => branchIds.includes(e.branchId)) : alles;
  return gefilterd.slice(-limit).reverse();
}

/* ─────────────── handmatig openen ─────────────── */

export interface Opdracht {
  id: string;
  actie: "open";
  seconden: number;
  door: string;
  at: string;
}

/** De beheerder drukt op "Open": het kastje haalt de opdracht binnen 2 s op. */
export async function openHandmatig(tenantId: string, branchId: string, door: { userId: string; naam: string }): Promise<Opdracht> {
  const alles = await vestigingToegang(tenantId);
  const instel = alles[branchId] ?? standaard();
  const opdracht: Opdracht = { id: randomBytes(6).toString("hex"), actie: "open", seconden: instel.openSeconden, door: door.naam, at: new Date().toISOString() };
  const k = OPDRACHT(branchId);
  await redis.rpush(k, JSON.stringify(opdracht));
  await redis.expire(k, 120);
  await kvAppend(
    LOG(tenantId),
    { id: opdracht.id, at: opdracht.at, branchId, kenteken: "", besluit: { open: true, reden: "handmatig", naam: door.naam, soort: "medewerker", userId: door.userId }, bron: "handmatig" } satisfies ToegangEvent,
    LOG_BEWAREN,
  );
  return opdracht;
}

/** Het kastje haalt de openstaande opdrachten op (en maakt de lijst leeg). */
export async function haalOpdrachten(branchId: string): Promise<Opdracht[]> {
  const k = OPDRACHT(branchId);
  const [items] = await Promise.all([redis.lrange(k, 0, -1), redis.del(k)]);
  const out: Opdracht[] = [];
  for (const raw of items) {
    try {
      out.push(JSON.parse(raw) as Opdracht);
    } catch {
      /* een kapot item overslaan */
    }
  }
  return out;
}

/** Staat er een kastje gekoppeld en leeft het nog (gezien in de laatste 5 minuten)? */
export function kastjeStatus(v: VestigingToegang | undefined, nu = Date.now()): "geen-token" | "nooit-gezien" | "online" | "offline" {
  if (!v?.tokenHash) return "geen-token";
  if (!v.laatstGezien) return "nooit-gezien";
  return nu - Date.parse(v.laatstGezien) < 5 * 60_000 ? "online" : "offline";
}
