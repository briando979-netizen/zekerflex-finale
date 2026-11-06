import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { kvAppend, kvGet, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { AppError } from "@/lib/errors";
import { KLUIS_SOORT_LABEL, STANDAARD_MINUTEN_VOORAF, kluisZichtbaar, type KluisItemMeta, type KluisSoort } from "@/lib/locatie/modules";

// ---------------------------------------------------------------------------
// De sleutelkluis: wifi-codes, alarmcodes, sleutelkastjes en inloggegevens per
// vestiging. Versleuteld in de KV (AES-256-GCM, lib/security/sealed-secret.ts,
// doel "kluis"); het eigen team ziet alles, een flexwerker alleen wat bij zijn
// dienst hoort, van `minutenVooraf` vóór de dienst tot het einde ervan.
//   kluis:<tenantId>      de items (met het versleutelde geheim)
//   kluis-log:<tenantId>  wie welk geheim bekeek (laatste 3000)
// ---------------------------------------------------------------------------

const ITEMS = (t: string) => `kluis:${t}`;
const LOG = (t: string) => `kluis-log:${t}`;
const DOEL = "kluis";
const MAX_ITEMS = 300;

interface KluisItemOpslag extends KluisItemMeta {
  geheimSealed: string;
}

export interface KluisLogRegel {
  at: string;
  userId: string;
  naam: string;
  itemId: string;
  titel: string;
  /** werker: via welke dienst */
  shiftId?: string;
  rol: "team" | "werker";
}

const meta = (i: KluisItemOpslag): KluisItemMeta => {
  const { geheimSealed: _g, ...rest } = i;
  void _g;
  return rest;
};

async function lees(tenantId: string): Promise<KluisItemOpslag[]> {
  return (await kvGet<KluisItemOpslag[]>(ITEMS(tenantId))) ?? [];
}

export async function kluisItems(tenantId: string, branchIds: string[] | null = null): Promise<KluisItemMeta[]> {
  const alles = await lees(tenantId);
  return alles.filter((i) => !branchIds || !i.branchId || branchIds.includes(i.branchId)).map(meta);
}

export interface KluisInvoer {
  id?: string | undefined;
  titel: string;
  soort: KluisSoort;
  branchId?: string | undefined;
  gebruikersnaam?: string | undefined;
  /** leeg bij bewerken = het geheim blijft zoals het was */
  geheim?: string | undefined;
  notitie?: string | undefined;
  minutenVooraf?: number | undefined;
  vervangNaDienst?: boolean | undefined;
}

export async function zetKluisItem(tenantId: string, input: KluisInvoer, door: { userId: string; naam: string }): Promise<KluisItemMeta> {
  const titel = input.titel.trim().slice(0, 80);
  if (!titel) throw AppError.validation("Geef het item een titel, bijvoorbeeld 'Wifi personeel'.");
  if (!(input.soort in KLUIS_SOORT_LABEL)) throw AppError.validation("Onbekende soort.");
  const alles = await lees(tenantId);
  const bestaand = input.id ? alles.find((i) => i.id === input.id) : undefined;
  if (input.id && !bestaand) throw AppError.notFound("Item niet gevonden.");
  const geheim = input.geheim?.trim() ?? "";
  if (!bestaand && !geheim) throw AppError.validation("Vul het geheim in (de code, het wachtwoord of de inlog).");
  if (geheim.length > 2000) throw AppError.validation("Het geheim is te lang (max 2000 tekens).");
  if (!bestaand && alles.length >= MAX_ITEMS) throw AppError.validation(`Maximaal ${MAX_ITEMS} items per bedrijf.`);
  const minutenVooraf = Math.min(24 * 60, Math.max(0, Math.round(input.minutenVooraf ?? bestaand?.minutenVooraf ?? STANDAARD_MINUTEN_VOORAF)));
  const now = new Date().toISOString();
  const item: KluisItemOpslag = {
    id: bestaand?.id ?? randomBytes(6).toString("hex"),
    titel,
    soort: input.soort,
    minutenVooraf,
    vervangNaDienst: input.vervangNaDienst ?? bestaand?.vervangNaDienst ?? false,
    gewijzigd: geheim || !bestaand ? now : bestaand.gewijzigd,
    gewijzigdDoor: geheim || !bestaand ? door.naam : bestaand.gewijzigdDoor,
    geheimSealed: geheim ? sealSecret(geheim, DOEL) : bestaand!.geheimSealed,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.gebruikersnaam?.trim() ? { gebruikersnaam: input.gebruikersnaam.trim().slice(0, 120) } : {}),
    ...(input.notitie?.trim() ? { notitie: input.notitie.trim().slice(0, 500) } : {}),
    // een nieuw geheim maakt het advies "vervangen" ongedaan
    ...(!geheim && bestaand?.vervangenAanbevolenSinds ? { vervangenAanbevolenSinds: bestaand.vervangenAanbevolenSinds } : {}),
  };
  const nieuw = bestaand ? alles.map((i) => (i.id === item.id ? item : i)) : [...alles, item];
  await kvSet(ITEMS(tenantId), nieuw);
  return meta(item);
}

export async function verwijderKluisItem(tenantId: string, id: string): Promise<void> {
  const alles = await lees(tenantId);
  await kvSet(ITEMS(tenantId), alles.filter((i) => i.id !== id));
}

/** Het geheim zelf, met een regel in het logboek. */
export async function onthulGeheim(tenantId: string, id: string, kijker: { userId: string; naam: string; rol: KluisLogRegel["rol"]; shiftId?: string | undefined }): Promise<{ item: KluisItemMeta; geheim: string }> {
  const item = (await lees(tenantId)).find((i) => i.id === id);
  if (!item) throw AppError.notFound("Item niet gevonden.");
  let geheim: string;
  try {
    geheim = openSecret(item.geheimSealed, DOEL);
  } catch {
    throw AppError.precondition("Dit geheim is niet meer te lezen (de serversleutel is gewisseld). Vul het opnieuw in.");
  }
  await kvAppend<KluisLogRegel>(
    LOG(tenantId),
    { at: new Date().toISOString(), userId: kijker.userId, naam: kijker.naam, itemId: id, titel: item.titel, rol: kijker.rol, ...(kijker.shiftId ? { shiftId: kijker.shiftId } : {}) },
    3000,
  );
  return { item: meta(item), geheim };
}

export async function kluisLog(tenantId: string, limit = 200): Promise<KluisLogRegel[]> {
  const alles = (await kvGet<KluisLogRegel[]>(LOG(tenantId))) ?? [];
  return alles.slice(-limit).reverse();
}

/* ─────────────── de werker ─────────────── */

export interface DienstMetKluis {
  shiftId: string;
  titel: string;
  tenantId: string;
  bedrijf: string;
  branchId: string;
  vestiging: string;
  startsAt: string;
  endsAt: string;
  items: KluisItemMeta[];
}

/** Welke items mag deze werker nu zien, per dienst (vandaag en de komende uren)? */
export async function kluisVoorWerker(userId: string, nu = new Date()): Promise<DienstMetKluis[]> {
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      cancelledAt: null,
      freelancer: { userId },
      shift: { status: { notIn: ["CANCELLED", "DRAFT"] }, startsAt: { lte: new Date(nu.getTime() + 24 * 3_600_000) }, endsAt: { gte: nu } },
    },
    select: { shift: { select: { id: true, title: true, startsAt: true, endsAt: true, branchId: true, branch: { select: { name: true, tenantId: true, tenant: { select: { name: true } } } } } } },
    orderBy: { shift: { startsAt: "asc" } },
  });
  const out: DienstMetKluis[] = [];
  const cache = new Map<string, KluisItemOpslag[]>();
  for (const { shift } of assignments) {
    const tenantId = shift.branch.tenantId;
    const alles = cache.get(tenantId) ?? (await lees(tenantId));
    cache.set(tenantId, alles);
    const items = alles.filter((i) => kluisZichtbaar(i, { branchId: shift.branchId, startsAt: shift.startsAt, endsAt: shift.endsAt }, nu)).map(meta);
    if (items.length === 0) continue;
    out.push({
      shiftId: shift.id,
      titel: shift.title,
      tenantId,
      bedrijf: shift.branch.tenant.name,
      branchId: shift.branchId,
      vestiging: shift.branch.name,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      items,
    });
  }
  return out;
}

/** Mag deze werker dit item nu zien? Zo ja: via welke dienst. */
export async function werkerMagZien(userId: string, tenantId: string, itemId: string, nu = new Date()): Promise<{ shiftId: string } | null> {
  for (const d of await kluisVoorWerker(userId, nu)) {
    if (d.tenantId === tenantId && d.items.some((i) => i.id === itemId)) return { shiftId: d.shiftId };
  }
  return null;
}

/* ─────────────── advies: vervangen na een dienst ─────────────── */

/** Items met "vervang na elke dienst" waarvan sinds de laatste wijziging een dienst op die vestiging is afgelopen. */
export async function metVervangAdvies(tenantId: string, items: KluisItemMeta[], nu = new Date()): Promise<KluisItemMeta[]> {
  const kandidaten = items.filter((i) => i.vervangNaDienst);
  if (kandidaten.length === 0) return items;
  const laatsteEinde = await prisma.shift.groupBy({
    by: ["branchId"],
    where: { branch: { tenantId }, status: { notIn: ["CANCELLED", "DRAFT"] }, endsAt: { lte: nu }, assignments: { some: { cancelledAt: null } } },
    _max: { endsAt: true },
  });
  const perVestiging = new Map(laatsteEinde.map((r) => [r.branchId, r._max.endsAt]));
  const overal = [...perVestiging.values()].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return items.map((i) => {
    if (!i.vervangNaDienst) return i;
    const einde = i.branchId ? (perVestiging.get(i.branchId) ?? null) : overal;
    if (einde && einde.toISOString() > i.gewijzigd) return { ...i, vervangenAanbevolenSinds: einde.toISOString() };
    return i;
  });
}
