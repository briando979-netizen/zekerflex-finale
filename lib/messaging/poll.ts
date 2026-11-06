// ---------------------------------------------------------------------------
// Peiling in de chat ("Wie kan zaterdag de late dienst?"): een vraag met 2–12
// keuzes, één of meer keuzes per persoon, stemmen zichtbaar met naam. Puur
// bestand (geen kv/prisma): de server (lib/messaging/store.ts, routes) en de
// browser (components/chat) rekenen met dezelfde regels.
// ---------------------------------------------------------------------------

export interface PollOption {
  id: string;
  text: string;
}

export interface MessagePoll {
  options: PollOption[];
  /** meer dan één keuze per persoon toegestaan */
  multi: boolean;
  /** keuze-id → userIds die erop stemden */
  votes: Record<string, string[]>;
  /** door de maker gesloten: wanneer; daarna kan niemand meer stemmen */
  closedAt?: string;
}

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 12;
export const POLL_QUESTION_MAX = 200;
export const POLL_OPTION_MAX = 100;

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Een nieuwe peiling uit wat iemand invulde: lege en dubbele keuzes vallen weg
 * (hoofdletters tellen niet). Null als er geen vraag is of minder dan twee keuzes overblijven.
 */
export function maakPeiling(question: string, options: string[], multi: boolean): { question: string; poll: MessagePoll } | null {
  const q = clean(question, POLL_QUESTION_MAX);
  const gezien = new Set<string>();
  const opts: PollOption[] = [];
  for (const raw of options) {
    const t = clean(raw, POLL_OPTION_MAX);
    const k = t.toLowerCase();
    if (!t || gezien.has(k)) continue;
    gezien.add(k);
    opts.push({ id: `o${opts.length + 1}`, text: t });
    if (opts.length === POLL_MAX_OPTIONS) break;
  }
  if (!q || opts.length < POLL_MIN_OPTIONS) return null;
  return { question: q, poll: { options: opts, multi, votes: {} } };
}

/**
 * Zet de stem van één persoon: `optionIds` is zijn hele keuze (leeg = stem
 * intrekken). Bij één keuze telt alleen de eerste; onbekende ids vallen weg.
 * Een gesloten peiling verandert niet.
 */
export function stem(poll: MessagePoll, userId: string, optionIds: string[]): MessagePoll {
  if (poll.closedAt) return poll;
  const geldig = new Set(poll.options.map((o) => o.id));
  let keuze = [...new Set(optionIds.filter((id) => geldig.has(id)))];
  if (!poll.multi) keuze = keuze.slice(0, 1);
  const votes: Record<string, string[]> = {};
  for (const o of poll.options) {
    const zonder = (poll.votes[o.id] ?? []).filter((u) => u !== userId);
    const met = keuze.includes(o.id) ? [...zonder, userId] : zonder;
    if (met.length) votes[o.id] = met;
  }
  return { ...poll, votes };
}

/** Tik op één keuze: aan of uit (meerkeuze), of wisselen / intrekken (één keuze). */
export function tikKeuze(poll: MessagePoll, userId: string, optionId: string): string[] {
  const mijn = mijnKeuze(poll, userId);
  if (mijn.includes(optionId)) return mijn.filter((id) => id !== optionId);
  return poll.multi ? [...mijn, optionId] : [optionId];
}

export function mijnKeuze(poll: MessagePoll, userId: string | null | undefined): string[] {
  if (!userId) return [];
  return poll.options.filter((o) => (poll.votes[o.id] ?? []).includes(userId)).map((o) => o.id);
}

/** Hoeveel verschillende mensen stemden. */
export function aantalStemmers(poll: MessagePoll): number {
  return new Set(Object.values(poll.votes).flat()).size;
}

export interface PollUitslag {
  id: string;
  text: string;
  stemmen: number;
  /** aandeel van de stemmers (0–100), afgerond */
  procent: number;
  stemmers: string[];
  /** deze keuze heeft (gedeeld) de meeste stemmen */
  koploper: boolean;
}

export function uitslag(poll: MessagePoll): PollUitslag[] {
  const totaal = aantalStemmers(poll);
  const max = Math.max(0, ...poll.options.map((o) => (poll.votes[o.id] ?? []).length));
  return poll.options.map((o) => {
    const stemmers = poll.votes[o.id] ?? [];
    return {
      id: o.id,
      text: o.text,
      stemmen: stemmers.length,
      procent: totaal ? Math.round((stemmers.length / totaal) * 100) : 0,
      stemmers,
      koploper: max > 0 && stemmers.length === max,
    };
  });
}

export const sluitPeiling = (poll: MessagePoll, now = new Date()): MessagePoll => (poll.closedAt ? poll : { ...poll, closedAt: now.toISOString() });
