import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { cleanImage } from "@/lib/media/clean-image";
import { readUpload, verhuisUploadNaarSchijf } from "@/lib/storage/local";
import { kvDelete, kvGet, kvSet, kvSetIfAbsent, kvVerwijderAlsVeld } from "@/lib/storage/kv";
import { CJ_FOTO_MAX_PX, uploadIdUitMediaUrl } from "@/lib/shop/cj/cj-core";

// ---------------------------------------------------------------------------
// CJ-productfoto's van de database naar het opslagvolume (18 nov 2026). Met STORAGE_BACKEND=db kwamen die dag 2.862
// foto's (721 MB) in de tabel UploadBlob terecht: 93% van de database, en de nachtelijke dump groeide van 202 naar
// ±900 MB. Een CJ-foto is altijd opnieuw bij CJ te halen en hoort dus op schijf (storage/, AGENTS.md), niet in Postgres.
// Nieuwe foto's gaan sinds die dag direct naar schijf (haalFoto in importeer.ts); dit verhuist de bestaande, in rondes
// binnen een tijdsbudget, en verkleint ze onderweg naar CJ_FOTO_MAX_PX (zelfde id, zelfde url /api/shop/media/<id>).
// De rij in UploadBlob gaat pas weg nadat het bestand er aantoonbaar staat (lib/storage/local.ts).
// ---------------------------------------------------------------------------

const DB_PREFIX = "db:";

/** De upload-id's van alle foto's van CJ-producten: de hoofdfoto en de extra foto's. */
export async function cjFotoUploadIds(): Promise<string[]> {
  const producten = await prisma.shopProduct.findMany({
    where: { variants: { some: { sku: { startsWith: "cj-" } } } },
    select: { imageUploadId: true, fotos: true },
  });
  const ids = new Set<string>();
  for (const p of producten) {
    if (p.imageUploadId) ids.add(p.imageUploadId);
    for (const u of p.fotos) {
      const id = uploadIdUitMediaUrl(u);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export interface TeVerhuizen {
  ids: string[];
  aantal: number;
  bytes: number;
}

/** Welke van die foto's staan nog in de database? */
export async function cjFotosTeVerhuizen(): Promise<TeVerhuizen> {
  const alle = await cjFotoUploadIds();
  const ids: string[] = [];
  let bytes = 0;
  for (let i = 0; i < alle.length; i += 500) {
    const rijen = await prisma.upload.findMany({
      where: { id: { in: alle.slice(i, i + 500) }, storageKey: { startsWith: DB_PREFIX } },
      select: { id: true, sizeBytes: true },
      orderBy: { createdAt: "asc" },
    });
    for (const r of rijen) {
      ids.push(r.id);
      bytes += r.sizeBytes;
    }
  }
  return { ids, aantal: ids.length, bytes };
}

export interface DrogeTelling {
  droog: true;
  aantal: number;
  bytes: number;
  /** een steekproef, verkleind naar CJ_FOTO_MAX_PX, zodat de winst te schatten is */
  steekproef: { n: number; bytesVoor: number; bytesNa: number };
  /** geschatte grootte na verhuizing en verkleining */
  schattingBytesNa: number;
}

export interface VerhuisUitkomst {
  droog: false;
  gedaan: number;
  mislukt: number;
  rest: number;
  bytesVoor: number;
  bytesNa: number;
}

/** Verkleind naar CJ_FOTO_MAX_PX; wordt het er niet kleiner van (al klein), dan het origineel. */
async function verkleind(bytes: Buffer): Promise<Buffer> {
  try {
    const uit = await cleanImage(bytes, CJ_FOTO_MAX_PX);
    return uit.bytes.length < bytes.length ? uit.bytes : bytes;
  } catch {
    return bytes;
  }
}

/** Droge telling: niets verandert. */
export async function telCjFotos(steekproef = 20): Promise<DrogeTelling> {
  const t = await cjFotosTeVerhuizen();
  const proef = { n: 0, bytesVoor: 0, bytesNa: 0 };
  for (const id of t.ids.slice(0, Math.max(0, steekproef))) {
    try {
      const { bytes } = await readUpload(id);
      const klein = await verkleind(bytes);
      proef.n++;
      proef.bytesVoor += bytes.length;
      proef.bytesNa += klein.length;
    } catch (e) {
      logger.warn("cj-foto's tellen: steekproef mislukt", { error: (e as Error).message.slice(0, 120) });
    }
  }
  const ratio = proef.bytesVoor > 0 ? proef.bytesNa / proef.bytesVoor : 1;
  return { droog: true, aantal: t.aantal, bytes: t.bytes, steekproef: proef, schattingBytesNa: Math.round(t.bytes * ratio) };
}

/** Eén ronde verhuizen, binnen het budget. Elke foto: lezen, verkleinen, naar schijf, controleren, rij bijwerken, blob weg. */
export async function verhuisCjFotos(o: { actorUserId: string | null; budgetMs?: number }): Promise<VerhuisUitkomst> {
  const start = Date.now();
  const budget = o.budgetMs ?? 200_000;
  const t = await cjFotosTeVerhuizen();
  const uit: VerhuisUitkomst = { droog: false, gedaan: 0, mislukt: 0, rest: t.aantal, bytesVoor: 0, bytesNa: 0 };
  for (const id of t.ids) {
    if (Date.now() - start > budget) break;
    try {
      const { bytes } = await readUpload(id);
      const klein = await verkleind(bytes);
      const r = await verhuisUploadNaarSchijf(id, { bytes: klein, map: "cj" });
      if (r.status === "verhuisd") {
        uit.gedaan++;
        uit.bytesVoor += r.bytesVoor;
        uit.bytesNa += r.bytesNa;
      }
      uit.rest--;
    } catch (e) {
      uit.mislukt++;
      logger.warn("cj-foto verhuizen mislukt", { error: (e as Error).message.slice(0, 120) });
    }
  }
  if (uit.gedaan || uit.mislukt) {
    await recordAudit({
      category: "ADMIN",
      action: "shop.cj.fotos-verhuisd",
      actorUserId: o.actorUserId,
      actorLabel: o.actorUserId ? "user" : "system:cj",
      summary: `CJ-foto's naar schijf: ${uit.gedaan} verhuisd (${Math.round(uit.bytesVoor / 1_048_576)} → ${Math.round(uit.bytesNa / 1_048_576)} MB), ${uit.mislukt} mislukt, ${uit.rest} te gaan`,
      targetType: "shop",
      targetId: "cj-fotos",
    });
  }
  return uit;
}

// --- op de achtergrond (18 nov, avond): de klik in Beheer kwam er niet; de eigenaar gaf toestemming om het voor hem te doen.
// Een vlag in KV zet de verhuizing aan; de cron (elke 5 minuten) doet een ronde zolang de vlag aan staat en zet hem uit
// zodra alles verhuisd is of er alleen nog mislukkingen over zijn. De knop in Beheer zet dezelfde vlag.

const K_AAN = "shop:cj:fotos-verhuizen:aan";
const K_SLOT = "shop:cj:fotos-verhuizen:slot";
/** een slot ouder dan dit is van een ronde die nooit netjes eindigde */
const SLOT_MAX_MS = 6 * 60_000;

export interface VerhuisStand {
  aan: boolean;
  sinds: string | null;
  laatsteRondeOp: string | null;
  rondes: number;
  gedaan: number;
  mislukt: number;
  bytesVoor: number;
  bytesNa: number;
  /** wat er na de laatste ronde nog in de database stond; null = nog geen ronde gedaan */
  rest: number | null;
}

const LEGE_STAND: VerhuisStand = { aan: false, sinds: null, laatsteRondeOp: null, rondes: 0, gedaan: 0, mislukt: 0, bytesVoor: 0, bytesNa: 0, rest: null };

export async function leesVerhuisStand(): Promise<VerhuisStand> {
  const s = await kvGet<Partial<VerhuisStand>>(K_AAN).catch(() => null);
  return { ...LEGE_STAND, ...(s ?? {}), aan: s?.aan === true };
}

/** Aanzetten begint met schone tellers; uitzetten laat de tellers staan (voor het scherm). */
export async function zetVerhuisStand(aan: boolean, now = new Date()): Promise<VerhuisStand> {
  const huidig = await leesVerhuisStand();
  const nieuw: VerhuisStand = aan ? { ...LEGE_STAND, aan: true, sinds: now.toISOString() } : { ...huidig, aan: false };
  await kvSet(K_AAN, nieuw);
  return nieuw;
}

export type RondeAchtergrond = { status: "uit" | "bezet" | "gedaan" | "klaar" | "vast"; stand: VerhuisStand };

/** Eén ronde vanuit de cron: alleen als de vlag aan staat, nooit twee tegelijk; klaar = vlag uit. */
export async function rondeVerhuizenAchtergrond(o: { budgetMs?: number; now?: Date } = {}): Promise<RondeAchtergrond> {
  const now = o.now ?? new Date();
  const stand = await leesVerhuisStand();
  if (!stand.aan) return { status: "uit", stand };

  const slot = { bezig: now.toISOString() };
  const oud = await kvGet<{ bezig?: string }>(K_SLOT).catch(() => null);
  if (oud?.bezig && now.getTime() - Date.parse(oud.bezig) < SLOT_MAX_MS) return { status: "bezet", stand };
  if (oud) await kvDelete(K_SLOT).catch(() => undefined);
  if (!(await kvSetIfAbsent(K_SLOT, slot))) return { status: "bezet", stand };

  try {
    const uit = await verhuisCjFotos({ actorUserId: null, budgetMs: o.budgetMs ?? 200_000 });
    const klaar = uit.rest === 0 && uit.mislukt === 0;
    const vast = uit.gedaan === 0 && uit.mislukt > 0; // alles wat over is mislukt: niet eindeloos door
    const nieuw: VerhuisStand = {
      ...stand,
      aan: !(klaar || vast),
      laatsteRondeOp: now.toISOString(),
      rondes: stand.rondes + 1,
      gedaan: stand.gedaan + uit.gedaan,
      mislukt: stand.mislukt + uit.mislukt,
      bytesVoor: stand.bytesVoor + uit.bytesVoor,
      bytesNa: stand.bytesNa + uit.bytesNa,
      rest: uit.rest,
    };
    await kvSet(K_AAN, nieuw);
    if (klaar || vast) {
      await recordAudit({
        category: "ADMIN",
        action: klaar ? "shop.cj.fotos-verhuizing-klaar" : "shop.cj.fotos-verhuizing-vast",
        actorUserId: null,
        actorLabel: "system:cj",
        summary: klaar
          ? `CJ-foto's naar schijf klaar: ${nieuw.gedaan} verhuisd in ${nieuw.rondes} rondes (${Math.round(nieuw.bytesVoor / 1_048_576)} → ${Math.round(nieuw.bytesNa / 1_048_576)} MB)`
          : `CJ-foto's naar schijf gestopt: ${nieuw.gedaan} verhuisd, ${uit.rest} blijven mislukken (${nieuw.mislukt} fouten); zie het log`,
        targetType: "shop",
        targetId: "cj-fotos",
      });
    }
    return { status: klaar ? "klaar" : vast ? "vast" : "gedaan", stand: nieuw };
  } finally {
    await kvVerwijderAlsVeld(K_SLOT, "bezig", slot.bezig).catch(() => undefined);
  }
}
