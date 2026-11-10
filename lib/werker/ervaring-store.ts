import { randomUUID } from "node:crypto";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamParts } from "@/lib/time/amsterdam";
import {
  ERVARING_MAX,
  controleerErvaring,
  leesErvaringStand,
  sorteerErvaring,
  type ErvaringInvoer,
  type ErvaringStand,
} from "@/lib/werker/ervaring";

// Werkervaring per werker in KV "werker-ervaring:<userId>" (AVG: het voorvoegsel staat in
// ERASABLE_KV_PREFIXES, lib/privacy/user-kv.ts). Alleen de werker zelf leest en schrijft dit.
const sleutel = (userId: string) => `werker-ervaring:${userId}`;

function jaarMaand(now: Date): { jaar: number; maand: number } {
  const p = amsterdamParts(now);
  return { jaar: p.year, maand: p.month };
}

export async function getErvaring(userId: string, now = new Date()): Promise<ErvaringStand> {
  const { jaar, maand } = jaarMaand(now);
  return leesErvaringStand(await kvGet<unknown>(sleutel(userId)), jaar, maand);
}

export type ToevoegUitslag = { ok: true; stand: ErvaringStand } | { ok: false; fout: string };

export async function voegErvaringToe(userId: string, invoer: ErvaringInvoer, now = new Date()): Promise<ToevoegUitslag> {
  const { jaar, maand } = jaarMaand(now);
  const stand = await getErvaring(userId, now);
  if (stand.items.length >= ERVARING_MAX) return { ok: false, fout: `Je kunt maximaal ${ERVARING_MAX} werkervaringen toevoegen.` };
  const uitslag = controleerErvaring(invoer, jaar, maand);
  if (!uitslag.ok) return uitslag;
  // een echte ervaring vervangt de keuze "nog geen werkervaring"
  const nieuw: ErvaringStand = { items: sorteerErvaring([...stand.items, { id: randomUUID(), ...uitslag.waarde }]), geen: false };
  await kvSet(sleutel(userId), nieuw);
  return { ok: true, stand: nieuw };
}

export async function verwijderErvaring(userId: string, id: string, now = new Date()): Promise<ErvaringStand> {
  const stand = await getErvaring(userId, now);
  const nieuw: ErvaringStand = { items: stand.items.filter((e) => e.id !== id), geen: stand.geen };
  await kvSet(sleutel(userId), nieuw);
  return nieuw;
}

/** "Ik heb nog geen werkervaring": een geldige afronding van de stap, alleen zolang de lijst leeg is. */
export async function zetGeenErvaring(userId: string, geen: boolean, now = new Date()): Promise<ErvaringStand> {
  const stand = await getErvaring(userId, now);
  const nieuw: ErvaringStand = { items: stand.items, geen: geen && stand.items.length === 0 };
  await kvSet(sleutel(userId), nieuw);
  return nieuw;
}
