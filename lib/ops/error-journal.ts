import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { setUnexpectedErrorReporter } from "@/lib/errors";
import { logger, setLogSink } from "@/lib/logger";
import { alertOwnerLater } from "@/lib/ops/alert";
import { stuurNaarGlitchtip } from "@/lib/ops/glitchtip";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Foutenlogboek. De app logt naar de console van de container, en die is bij
// elke uitrol weg. Hier blijven waarschuwingen en fouten bewaard: alles wat via
// logger.warn/error gaat, fouten die als kale 500 eindigen (lib/errors.ts) en
// onverwachte fouten in pagina's en server-acties (instrumentation.ts).
//
// Per soort melding één rij (KV "fout:<id>") met een teller, eerste en laatste
// keer en de laatste 3 voorbeelden. Persoonsgegevens en geheimen gaan eruit
// voordat iets wordt opgeslagen. Schrijven gebeurt in batches (elke 15 s), met
// grenzen, zodat een storm van fouten of een spammer de database niet vult.
// Admin → Systeem → Foutmeldingen toont het.
// ---------------------------------------------------------------------------

export type JournalLevel = "warn" | "error";

export interface JournalSample {
  at: string;
  detail: string;
}

export interface ErrorGroup {
  id: string;
  level: JournalLevel;
  message: string;
  /** the error text that set this group apart (scrubbed), when there was one */
  reason: string | null;
  /** method + route pattern, never a real path with ids or tokens in it */
  route: string | null;
  count: number;
  firstAt: string;
  lastAt: string;
  samples: JournalSample[];
}

const PREFIX = "fout:";
const KEY = (id: string) => `${PREFIX}${id}`;
const OVERFLOW_ID = "overloop";
const FLUSH_MS = 15_000;
const MAX_PENDING = 200;
const MAX_GROUPS = 400;
const KEEP_DAYS = 30;
const KEEP_SAMPLES = 3;
const PRUNE_EVERY_MS = 60 * 60_000;
const PRUNE_AFTER_NEW = 100;

export const isErrorGroupId = (id: string) => id === OVERFLOW_ID || /^[a-f0-9]{16}$/.test(id);

// --- weghalen wat niet bewaard mag worden --------------------------------------

const SECRET_KEY = /pass(word)?|token|secret|key|authorization|cookie|iban|bsn|e-?mail|phone|telefoon|signature/i;

/** Haalt e-mailadressen, IBAN's, telefoonnummers, sleutels en lange id's uit een tekst. */
export function scrub(text: string): string {
  return text
    // a query or fragment can carry a token (a push endpoint's ?token=…, percent-encoded so the id rules below miss it)
    .replace(/(https?:\/\/[^\s"'<>?#]+)[?#][^\s"'<>]*/g, "$1?<weg>")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<e-mail>")
    .replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g, "<iban>")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 <weg>")
    .replace(/\b(?:sk|pk|rk|whsec|zfj|ghp|gho|ghs|xox[abp])_[A-Za-z0-9_]{6,}/g, "<sleutel>")
    .replace(/(?:\+|\b00)31[\s-]?(?:\(0\)[\s-]?)?\d(?:[\s-]?\d){8}\b/g, "<telefoon>")
    // ten digits starting with 0, in any grouping: 0612345678, 06-1234 5678, 0548 123 456
    .replace(/\b0\d(?:[\s-]?\d){8}\b/g, "<telefoon>")
    .replace(/\b\d{9,}\b/g, "<nummer>")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<id>")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "<id>");
}

/** Een routepatroon om op te groeperen: geen query, geen id's of tokens in het pad. */
export function normalizeRoute(route: string): string {
  const path = (route.split("?")[0] ?? route)
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    // an id or token: long, with a digit in it ("websitevoorstellen" stays)
    .replace(/\/(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{12,}(?=\/|$)/g, "/:id");
  return scrub(path).slice(0, 160);
}

function describe(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    const stack = (value.stack ?? "").split("\n").slice(1, 5).map((l) => l.trim()).filter(Boolean).join(" | ");
    return stack ? `${value.name}: ${value.message} | ${stack}` : `${value.name}: ${value.message}`;
  }
  if (value === null || typeof value !== "object") return typeof value === "bigint" ? String(value) : value;
  if (depth >= 3) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => describe(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) out[k] = SECRET_KEY.test(k) ? "<weg>" : describe(v, depth + 1);
  return out;
}

/** De context van één melding als korte, opgeschoonde tekst (route en correlatie-id staan er apart bij). */
export function detailOf(context: Record<string, unknown>): string {
  const { route: _route, correlationId: _id, digest, ...rest } = context;
  let text: string;
  try {
    text = Object.keys(rest).length ? (JSON.stringify(describe(rest)) ?? "") : "";
  } catch {
    text = "[niet te lezen]";
  }
  // the digest is what a visitor sees on the error page: keep it readable to match their report
  const code = typeof digest === "string" && /^[\w-]{1,40}$/.test(digest) ? `digest ${digest}${text ? " · " : ""}` : "";
  return `${code}${scrub(text)}`.slice(0, 800);
}

function textOf(value: unknown): string | null {
  if (value instanceof Error) return value.message;
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

/** De fouttekst die meldingen met dezelfde boodschap uit elkaar houdt. */
function reasonOf(context: Record<string, unknown>): string | null {
  const raw = textOf(context.error) ?? textOf(context.err) ?? textOf(context.reason) ?? textOf(context.clientMessage);
  return raw ? scrub(raw).slice(0, 300) : null;
}

function routeOf(context: Record<string, unknown>): string | null {
  if (typeof context.route === "string" && context.route) return normalizeRoute(context.route);
  if (typeof context.url === "string" && context.url) {
    try {
      return normalizeRoute(new URL(context.url, "https://zekerflex.com").pathname);
    } catch {
      return null;
    }
  }
  return null;
}

/** Same kind of message = same group: numbers and ids don't make a new one. */
export function groupId(level: JournalLevel, message: string, route: string | null, reason: string | null): string {
  const shape = (s: string) => scrub(s).replace(/\d+/g, "#").slice(0, 200);
  return createHash("sha256").update([level, shape(message), route ?? "", shape(reason ?? "")].join("\n")).digest("hex").slice(0, 16);
}

// --- verzamelen en wegschrijven -------------------------------------------------

interface JournalState {
  pending: Map<string, ErrorGroup>;
  dropped: number;
  flushing: Promise<void> | null;
  lastPrune: number;
  createdSincePrune: number;
  started: boolean;
}
// On globalThis, not in module variables: the Next.js server build holds several
// copies of this module (instrumentation.ts and each route get their own), and
// they must all fill and flush the same queue.
const shared = globalThis as typeof globalThis & { __zfErrorJournal?: JournalState };
const state: JournalState = (shared.__zfErrorJournal ??= { pending: new Map(), dropped: 0, flushing: null, lastPrune: 0, createdSincePrune: 0, started: false });
const pending = state.pending;

/** Remember one warning or error; it reaches the database with the next flush. */
export function journal(level: JournalLevel, message: string, context: Record<string, unknown> = {}, at = new Date()): void {
  const route = routeOf(context);
  const reason = reasonOf(context);
  const id = groupId(level, message, route, reason);
  const iso = at.toISOString();
  const sample = { at: iso, detail: detailOf(context) };
  const cur = pending.get(id);
  if (cur) {
    cur.count += 1;
    cur.lastAt = iso;
    cur.samples = [...cur.samples, sample].slice(-KEEP_SAMPLES);
    return;
  }
  if (pending.size >= MAX_PENDING) {
    state.dropped += 1;
    return;
  }
  pending.set(id, { id, level, message: scrub(message).slice(0, 300), reason, route, count: 1, firstAt: iso, lastAt: iso, samples: [sample] });
}

function merge(old: ErrorGroup | null, add: ErrorGroup): ErrorGroup {
  if (!old) return add;
  return { ...old, count: old.count + add.count, lastAt: add.lastAt > old.lastAt ? add.lastAt : old.lastAt, samples: [...old.samples, ...add.samples].slice(-KEEP_SAMPLES) };
}

// --- de eigenaar laten weten dat er iets nieuws misgaat --------------------------

const ALERT_KEY = "fouten:nieuw";

/** Only a new kind of real error: never our own ZF-TEST messages, and never a failing alert itself (that would loop). */
export function worthAlerting(g: Pick<ErrorGroup, "id" | "level" | "message" | "reason">): boolean {
  if (g.level !== "error" || g.id === OVERFLOW_ID || g.message === "owner alert failed") return false;
  return !/ZF-TEST/i.test(`${g.message} ${g.reason ?? ""}`);
}

/** Push + mail to the platform admins (lib/ops/alert.ts), at most once every 6 hours for all of them together. */
function alertNewErrors(groups: ErrorGroup[]): void {
  const n = groups.length;
  const lines = groups.slice(0, 3).map((g) => [g.message, g.reason, g.route].filter(Boolean).join(" · ").slice(0, 140));
  alertOwnerLater({
    key: ALERT_KEY,
    severity: "warning",
    title: n === 1 ? "Nieuwe soort fout op de site" : `${n} nieuwe soorten fouten op de site`,
    detail: `Er ging iets mis dat nog niet eerder voorkwam. Bekijk het in Beheer → Systeem → Foutmeldingen; daar kun je het ook door de Bouwer laten oplossen.\n${lines.join("\n")}${n > 3 ? `\n… en nog ${n - 3}` : ""}`,
    url: "/admin/systeem#fouten",
  });
}

/** Write what was collected. One flush at a time; failures stay quiet (the console still has the line). */
export async function flushJournal(now = Date.now()): Promise<void> {
  if (state.flushing) return state.flushing;
  const batch = [...pending.values()];
  pending.clear();
  if (state.dropped > 0) {
    const iso = new Date(now).toISOString();
    batch.push({ id: OVERFLOW_ID, level: "warn", message: "Te veel verschillende meldingen tegelijk: deze zijn alleen geteld", reason: null, route: null, count: state.dropped, firstAt: iso, lastAt: iso, samples: [] });
    state.dropped = 0;
  }
  if (batch.length === 0) return;
  state.flushing = (async () => {
    const fresh: ErrorGroup[] = [];
    for (const add of batch) {
      try {
        const old = await kvGet<ErrorGroup>(KEY(add.id));
        if (!old) {
          state.createdSincePrune += 1;
          if (worthAlerting(add)) fresh.push(add);
        }
        await kvSet(KEY(add.id), merge(old, add));
      } catch {
        // the database is what's broken; logging that here would only loop
      }
    }
    if (fresh.length) alertNewErrors(fresh);
    // dezelfde batch ook naar een eigen GlitchTip, als die is ingesteld (stil bij fouten)
    void stuurNaarGlitchtip(batch).catch(() => undefined);
    if (now - state.lastPrune >= PRUNE_EVERY_MS || state.createdSincePrune >= PRUNE_AFTER_NEW) await pruneJournal(now).catch(() => undefined);
  })().finally(() => {
    state.flushing = null;
  });
  return state.flushing;
}

/** Drop groups not seen for 30 days, and keep at most the 400 most recent. */
export async function pruneJournal(now = Date.now()): Promise<number> {
  state.lastPrune = now;
  state.createdSincePrune = 0;
  const groups = await listErrorGroups(5000);
  const cutoff = now - KEEP_DAYS * 86_400_000;
  const fresh = groups.filter((g) => Date.parse(g.lastAt) >= cutoff);
  const drop = [...groups.filter((g) => Date.parse(g.lastAt) < cutoff), ...fresh.slice(MAX_GROUPS)];
  for (const g of drop) await kvDelete(KEY(g.id)).catch(() => undefined);
  return drop.length;
}

// --- lezen en opruimen (Admin → Systeem → Foutmeldingen) ------------------------

const isGroup = (g: unknown): g is ErrorGroup => {
  const x = g as Partial<ErrorGroup> | null;
  return Boolean(x && typeof x.id === "string" && typeof x.message === "string" && typeof x.count === "number" && typeof x.lastAt === "string");
};

/** Newest first. */
export async function listErrorGroups(limit = 500): Promise<ErrorGroup[]> {
  const rows = await kvListValues<ErrorGroup>(PREFIX, Math.max(limit, MAX_GROUPS * 2)).catch(() => []);
  return rows
    .filter(isGroup)
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit);
}

/** "Opgelost": the group goes; if it happens again it comes back as new. */
export async function clearErrorGroups(ids: string[] | "alles"): Promise<number> {
  const targets = ids === "alles" ? (await listErrorGroups(5000)).map((g) => g.id) : ids.filter(isErrorGroupId);
  for (const id of targets) await kvDelete(KEY(id));
  return targets.length;
}

// --- aanzetten -------------------------------------------------------------------

const IGNORED_DIGEST = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

/** instrumentation.ts onRequestError: a page, server action or route that threw. Only the route pattern is kept. */
export function recordRequestError(err: unknown, request: { method: string }, context: { routePath: string; routeType: string }): void {
  const digest = typeof (err as { digest?: unknown } | null)?.digest === "string" ? (err as { digest: string }).digest : "";
  if (IGNORED_DIGEST.test(digest)) return;
  logger.error(`unhandled ${context.routeType} error`, { route: `${request.method} ${context.routePath}`, error: err, ...(digest ? { digest } : {}) });
}

/** Called once per server start (instrumentation.ts). Keeps messages only in production. */
export function startErrorJournal(): void {
  if (state.started) return;
  state.started = true;
  // a bare 500 used to leave no trace at all in routes without withAuth
  setUnexpectedErrorReporter((err) => logger.error("unexpected server error", { error: err }));
  if (env.NODE_ENV !== "production") return;
  setLogSink((level, message, context) => journal(level, message, context));
  setInterval(() => void flushJournal(), FLUSH_MS).unref?.();
  logger.info("error journal started");
}
