import { randomUUID } from "node:crypto";
import { kvAppend, kvGet, kvSet } from "@/lib/storage/kv";
import { schoonPersoonsgegevens, soortenPersoonsgegevens } from "@/lib/learn/schoon";

// ---------------------------------------------------------------------------
// Lightweight "learning" for the local assistants — Postgres-backed
// (KeyValueStore), no separate DB schema. Was local disk, unreliable on
// Vercel's serverless functions.
//
// A local LLM can't be fine-tuned on the fly, so "learning" here means:
//   • remembering every Q&A pair               key "learn-log:<scope>"
//   • letting people rate the answers          key "learn-rated:<scope>"
//   • feeding the best-rated pairs back as few-shot examples on the next call
//   • keeping a per-user conversation memory   (jarvis, without a JarvisTurn row)
// ---------------------------------------------------------------------------

export type Scope = "public" | "jarvis" | "brain";

interface Exchange {
  id: string;
  at: string;
  userId?: string;
  q: string;
  a: string;
}

const logKey = (s: Scope) => `learn-log:${s}`;
const ratedKey = (s: Scope) => `learn-rated:${s}`;
const SCOPES: readonly Scope[] = ["public", "jarvis", "brain"];

/** Bewaartermijn van een vraag en antwoord in de leerlijsten (lib/privacy/retention.ts, regel "chatlog"). */
export const CHATLOG_DAGEN = 90;

/**
 * Append a Q&A pair; returns its id (used to rate it later). E-mailadressen, telefoonnummers, rekeningnummers en BSN's gaan
 * er vóór het bewaren uit (lib/learn/schoon.ts); de lijst is 90 dagen te bewaren (sweep) en per gebruiker te wissen.
 */
export async function logExchange(scope: Scope, e: { q: string; a: string; userId?: string }): Promise<string> {
  const rec: Exchange = {
    id: randomUUID().slice(0, 10),
    at: new Date().toISOString(),
    q: schoonPersoonsgegevens(e.q).slice(0, 1000),
    a: schoonPersoonsgegevens(e.a).slice(0, 2000),
    ...(e.userId ? { userId: e.userId } : {}),
  };
  await kvAppend(logKey(scope), rec, 800);
  return rec.id;
}

/** Find a logged exchange by its text (used when the caller has no id, e.g. a rating widget). */
export async function findExchangeIdByText(scope: Scope, q: string, a: string): Promise<string | null> {
  const log = (await kvGet<Exchange[]>(logKey(scope))) ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const rec = log[i]!;
    if (rec.q.trim() === q.trim() && rec.a.slice(0, 40) === a.slice(0, 40)) return rec.id;
  }
  return null;
}

export async function rateExchange(scope: Scope, id: string, up: boolean): Promise<void> {
  await kvAppend(ratedKey(scope), { id, up, at: new Date().toISOString() }, 5000);
}

/** Best-rated recent Q&A pairs, as few-shot examples for the next prompt. */
export async function topExamples(scope: Scope, n = 3): Promise<{ q: string; a: string }[]> {
  const [log, rated] = await Promise.all([
    kvGet<Exchange[]>(logKey(scope)),
    kvGet<{ id: string; up: boolean }[]>(ratedKey(scope)),
  ]);
  const score = new Map<string, number>();
  for (const r of rated ?? []) score.set(r.id, (score.get(r.id) ?? 0) + (r.up ? 1 : -2));
  const byId = new Map((log ?? []).map((e) => [e.id, e]));
  return [...score.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => byId.get(id))
    .filter((e): e is Exchange => Boolean(e && e.q && e.a))
    .map((e) => ({ q: e.q, a: e.a }));
}

/** Per-user conversation memory (jarvis) built from the log — no separate schema. */
export async function recentHistory(
  scope: Scope,
  userId: string,
  turns = 4,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const log = (await kvGet<Exchange[]>(logKey(scope))) ?? [];
  return log
    .filter((e) => e.userId === userId)
    .slice(-turns)
    .flatMap((e) => [
      { role: "user" as const, content: e.q.slice(0, 800) },
      { role: "assistant" as const, content: e.a.slice(0, 1200) },
    ]);
}

export async function learnStats(scope: Scope): Promise<{ logged: number; rated: number; examples: number }> {
  const [log, rated, ex] = await Promise.all([
    kvGet<Exchange[]>(logKey(scope)),
    kvGet<unknown[]>(ratedKey(scope)),
    topExamples(scope, 50),
  ]);
  return { logged: (log ?? []).length, rated: (rated ?? []).length, examples: ex.length };
}

/**
 * AVG-wissen: alle vragen van deze gebruiker uit de leerlijsten, en de beoordelingen van die vragen (een beoordeling heeft zelf
 * geen userId, dus die vinden we via het id van de vraag). Geeft het aantal gewiste vragen terug.
 */
export async function wisChatlogVan(userId: string): Promise<number> {
  let gewist = 0;
  for (const scope of SCOPES) {
    const log = (await kvGet<Exchange[]>(logKey(scope))) ?? [];
    const van = log.filter((e) => e.userId === userId);
    if (van.length === 0) continue;
    const ids = new Set(van.map((e) => e.id));
    await kvSet(logKey(scope), log.filter((e) => e.userId !== userId));
    const rated = await kvGet<{ id: string }[]>(ratedKey(scope));
    if (rated?.some((r) => ids.has(r.id))) await kvSet(ratedKey(scope), rated.filter((r) => !ids.has(r.id)));
    gewist += van.length;
  }
  return gewist;
}

/**
 * Bewaartermijn: vragen en beoordelingen ouder dan 90 dagen weg (de nachtelijke sweep, lib/privacy/sweep.ts). Met `dryRun`
 * alleen tellen. Een regel zonder geldige tijd telt als verlopen: zonder datum valt niet te bewijzen dat hij jonger is.
 */
export async function ruimChatlogOp(now: Date, dryRun: boolean): Promise<number> {
  const grens = now.getTime() - CHATLOG_DAGEN * 24 * 60 * 60 * 1000;
  const verlopen = (at: unknown) => {
    const t = typeof at === "string" ? Date.parse(at) : NaN;
    return !Number.isFinite(t) || t < grens;
  };
  let totaal = 0;
  for (const scope of SCOPES) {
    for (const key of [logKey(scope), ratedKey(scope)]) {
      const lijst = (await kvGet<{ at?: unknown }[]>(key)) ?? [];
      const over = lijst.filter((r) => !verlopen(r.at));
      const weg = lijst.length - over.length;
      if (weg === 0) continue;
      totaal += weg;
      if (!dryRun) await kvSet(key, over);
    }
  }
  return totaal;
}

export interface ChatlogExportRegel {
  assistent: Scope;
  op: string;
  vraag: string;
  antwoord: string;
  beoordeling: "goed" | "slecht" | null;
}

/** Wat een gebruiker aan de assistenten heeft gevraagd (AVG art. 15, lib/privacy/export.ts): alleen zijn eigen vragen en antwoorden. */
export async function exportChatlogVan(userId: string): Promise<ChatlogExportRegel[]> {
  const uit: ChatlogExportRegel[] = [];
  for (const scope of SCOPES) {
    const log = ((await kvGet<Exchange[]>(logKey(scope))) ?? []).filter((e) => e.userId === userId);
    if (log.length === 0) continue;
    const rated = (await kvGet<{ id: string; up: boolean }[]>(ratedKey(scope))) ?? [];
    for (const e of log) {
      const stem = rated.filter((r) => r.id === e.id).pop();
      uit.push({ assistent: scope, op: e.at, vraag: e.q, antwoord: e.a, beoordeling: stem ? (stem.up ? "goed" : "slecht") : null });
    }
  }
  return uit;
}

export interface ScrubTelling {
  /** regels in de leerlijsten */
  regels: number;
  /** regels met minstens een e-mailadres, telefoonnummer, rekeningnummer of BSN (in vraag of antwoord) */
  metPersoonsgegevens: number;
  perSoort: { mail: number; tel: number; iban: number; bsn: number };
  /** alleen bij schrijven: het aantal herschreven regels */
  herschreven: number;
}

/**
 * Eenmalig opschonen van wat vóór de scrub al bewaard was (lib/learn/schoon.ts). Idempotent: een tweede keer vindt niets meer.
 * Met `dryRun` (de standaard van de route) alleen tellen. Geeft nooit inhoud terug, alleen aantallen.
 */
export async function scrubBestaandeChatlog(dryRun: boolean): Promise<ScrubTelling> {
  const uit: ScrubTelling = { regels: 0, metPersoonsgegevens: 0, perSoort: { mail: 0, tel: 0, iban: 0, bsn: 0 }, herschreven: 0 };
  for (const scope of SCOPES) {
    const log = (await kvGet<Exchange[]>(logKey(scope))) ?? [];
    let gewijzigd = false;
    const nieuw = log.map((e) => {
      uit.regels += 1;
      const q = soortenPersoonsgegevens(e.q ?? "");
      const a = soortenPersoonsgegevens(e.a ?? "");
      const soorten = { mail: q.mail || a.mail, tel: q.tel || a.tel, iban: q.iban || a.iban, bsn: q.bsn || a.bsn };
      if (!soorten.mail && !soorten.tel && !soorten.iban && !soorten.bsn) return e;
      uit.metPersoonsgegevens += 1;
      for (const k of ["mail", "tel", "iban", "bsn"] as const) if (soorten[k]) uit.perSoort[k] += 1;
      gewijzigd = true;
      if (!dryRun) uit.herschreven += 1;
      return { ...e, q: schoonPersoonsgegevens(e.q ?? ""), a: schoonPersoonsgegevens(e.a ?? "") };
    });
    if (gewijzigd && !dryRun) await kvSet(logKey(scope), nieuw);
  }
  return uit;
}
