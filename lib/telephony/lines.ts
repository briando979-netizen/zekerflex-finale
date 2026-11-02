import { randomUUID } from "node:crypto";
import { z } from "zod";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { alertOwner } from "@/lib/ops/alert";
import { normalizeNumber } from "@/lib/telephony/consent";
import {
  ANSWER_AT,
  BUNDLES,
  DEFAULT_PRICING,
  NEEDS_OWN_NUMBER,
  NUMBER_TYPES,
  OPTIONS,
  SHOW_ON,
  quote,
  selectedOptions,
  type AnswerAt,
  type NumberKind,
  type OptionId,
  type Pricing,
  type Quote,
  type Selection,
  type ShowOn,
} from "@/lib/telephony/plans";

// ---------------------------------------------------------------------------
// Aanvragen voor een ZekerFlex-lijn (catalogus en prijzen: plans.ts). Een
// opdrachtgever vraagt aan voor zijn bedrijf, een flexkracht voor zichzelf.
// Er wordt hier niets gekocht en niets afgeschreven: een beheerder zet de lijn
// klaar (Admin → Telefonie) en pas dan volgt betalen.
//   key "phone-line:<id>"    → PhoneLine
//   key "telefonie:pricing" → Pricing (afwijkingen van DEFAULT_PRICING)
// ---------------------------------------------------------------------------

export type LineScope = "bedrijf" | "persoonlijk";
export type LineStatus = "aangevraagd" | "in_behandeling" | "actief" | "geannuleerd";
export const LINE_STATUSES: readonly LineStatus[] = ["aangevraagd", "in_behandeling", "actief", "geannuleerd"];

export interface PhoneLine {
  id: string;
  scope: LineScope;
  tenantId: string | null;
  orgName: string | null;
  userId: string;
  requesterName: string;
  requesterEmail: string;
  selection: Selection;
  answerAt: AnswerAt[];
  showOn: ShowOn[];
  /** het nummer dat de klant houdt of overzet */
  ownNumber: string | null;
  /** zijn eigen telefoon, voor doorschakelen */
  forwardTo: string | null;
  /** stad of netnummer, voor een lokaal nummer */
  region: string | null;
  note: string | null;
  quote: Quote;
  status: LineStatus;
  /** het nummer dat ZekerFlex toewijst */
  number: string | null;
  adminNote: string | null;
  history: { at: string; status: LineStatus; by: string }[];
  createdAt: string;
}

const lineKey = (id: string) => `phone-line:${id}`;
const PRICING_KEY = "telefonie:pricing";

const ids = <T extends string>(list: readonly { id: T }[]) => list.map((x) => x.id) as [T, ...T[]];
const PHONE_HINT = "Vul een geldig telefoonnummer in, bijvoorbeeld 06 12345678.";
const phone = z
  .string()
  .trim()
  .max(30)
  // eerst op letters controleren: normalizeNumber gooit ze weg, en dan was "bel me" stil een leeg veld
  .refine((v) => /^[\d\s+()./-]*$/.test(v), PHONE_HINT)
  .transform((v) => (v ? normalizeNumber(v) : ""))
  .refine((v) => v === "" || /^\+\d{9,15}$/.test(v), PHONE_HINT);

export const requestSchema = z.object({
  scope: z.enum(["bedrijf", "persoonlijk"]),
  kind: z.enum(ids(NUMBER_TYPES)),
  bundle: z.enum(ids(BUNDLES)).nullable(),
  options: z.array(z.enum(ids(OPTIONS))).max(OPTIONS.length),
  answerAt: z.array(z.enum(ids(ANSWER_AT))).max(ANSWER_AT.length),
  showOn: z.array(z.enum(ids(SHOW_ON))).max(SHOW_ON.length),
  ownNumber: phone.optional(),
  forwardTo: phone.optional(),
  region: z.string().trim().max(60).optional(),
  note: z.string().trim().max(600).optional(),
});
export type LineRequestInput = z.infer<typeof requestSchema>;

/** Prijzen zoals ze nu gelden: de standaard, met de aanpassingen van de eigenaar erover. */
export async function getPricing(): Promise<Pricing> {
  const saved = (await kvGet<Partial<Pricing>>(PRICING_KEY).catch(() => null)) ?? {};
  return {
    lineCents: saved.lineCents ?? DEFAULT_PRICING.lineCents,
    numberCents: { ...DEFAULT_PRICING.numberCents, ...(saved.numberCents ?? {}) },
    optionCents: { ...DEFAULT_PRICING.optionCents, ...(saved.optionCents ?? {}) },
    bundleCents: { ...DEFAULT_PRICING.bundleCents, ...(saved.bundleCents ?? {}) },
    includedMinutes: saved.includedMinutes ?? DEFAULT_PRICING.includedMinutes,
    extraMinuteCents: saved.extraMinuteCents ?? DEFAULT_PRICING.extraMinuteCents,
  };
}

const cents = z.number().int().min(0).max(1_000_000);
export const pricingSchema = z.object({
  lineCents: cents,
  numberCents: z.record(z.enum(ids(NUMBER_TYPES)), cents.nullable()),
  optionCents: z.record(z.enum(ids(OPTIONS)), cents),
  bundleCents: z.record(z.enum(ids(BUNDLES)), cents),
  includedMinutes: z.number().int().min(0).max(100_000),
  extraMinuteCents: cents,
});

export async function savePricing(input: z.infer<typeof pricingSchema>, actorUserId: string): Promise<Pricing> {
  await kvSet(PRICING_KEY, input);
  await recordAudit({ category: "ADMIN", action: "telefonie.pricing.updated", summary: "Prijzen telefonie aangepast", actorUserId, metadata: input });
  return getPricing();
}

/** RFC 2606: .test, .example en .invalid zijn nooit echte klanten (onze testaccounts). */
const isReservedTestEmail = (email: string) => /\.(test|example|invalid|localhost)$/i.test(email.trim());

export interface Requester {
  userId: string;
  name: string;
  email: string;
  tenantId: string | null;
  orgName: string | null;
}

export async function createLineRequest(who: Requester, input: LineRequestInput): Promise<PhoneLine> {
  if (input.scope === "bedrijf" && !who.tenantId) throw AppError.validation("Geen organisatie gekoppeld aan je account.");
  if (NEEDS_OWN_NUMBER.includes(input.kind) && !input.ownNumber) throw AppError.validation("Vul het nummer in dat je wilt houden.");
  if (input.kind === "lokaal" && !input.region) throw AppError.validation("Vul in voor welke stad of welk netnummer je een nummer wilt.");
  const selection: Selection = { kind: input.kind, bundle: input.bundle, options: [] };
  selection.options = [...selectedOptions({ ...selection, options: input.options })];
  const wantsForward = input.answerAt.includes("telefoon") || selection.options.includes("doorschakelen");
  if (wantsForward && !input.forwardTo && !input.ownNumber) throw AppError.validation("Vul in naar welk telefoonnummer we mogen doorschakelen.");

  const now = new Date().toISOString();
  const line: PhoneLine = {
    id: randomUUID().slice(0, 12),
    scope: input.scope,
    tenantId: input.scope === "bedrijf" ? who.tenantId : null,
    orgName: input.scope === "bedrijf" ? who.orgName : null,
    userId: who.userId,
    requesterName: who.name,
    requesterEmail: who.email,
    selection,
    answerAt: [...new Set(input.answerAt)],
    showOn: [...new Set(input.showOn)].filter((s) => input.scope === "bedrijf" || !SHOW_ON.find((o) => o.id === s)?.bedrijfOnly),
    ownNumber: input.ownNumber || null,
    forwardTo: input.forwardTo || null,
    region: input.region || null,
    note: input.note || null,
    // altijd hier berekend, nooit het bedrag uit de browser
    quote: quote(selection, await getPricing()),
    status: "aangevraagd",
    number: null,
    adminNote: null,
    history: [{ at: now, status: "aangevraagd", by: who.name }],
    createdAt: now,
  };
  await kvSet(lineKey(line.id), line);
  await recordAudit({
    category: "SALES",
    action: "telefonie.requested",
    summary: `Telefonie aangevraagd: ${NUMBER_TYPES.find((t) => t.id === line.selection.kind)?.label ?? line.selection.kind}`,
    actorUserId: who.userId,
    targetType: "phone-line",
    targetId: line.id,
  });
  if (!isReservedTestEmail(who.email)) {
    await alertOwner({
      key: "telefonie:new",
      severity: "warning",
      title: "Nieuwe aanvraag telefonie",
      detail: `${line.orgName ?? line.requesterName} vraagt een lijn aan (${line.quote.onRequest ? "nummer op aanvraag" : `${(line.quote.monthlyCents / 100).toFixed(2).replace(".", ",")} euro per maand`}).`,
      url: "/admin/telefonie",
    });
  }
  return line;
}

export async function getLine(id: string): Promise<PhoneLine | null> {
  return kvGet<PhoneLine>(lineKey(id)).catch(() => null);
}

export async function listLines(): Promise<PhoneLine[]> {
  const all = await kvListValues<PhoneLine>("phone-line:", 5000).catch(() => []);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** De lijnen van een bedrijf (alle aanvragers) of van één persoon. */
export async function linesOf(scope: LineScope, ownerId: string): Promise<PhoneLine[]> {
  return (await listLines()).filter((l) => l.scope === scope && (scope === "bedrijf" ? l.tenantId === ownerId : l.userId === ownerId));
}

export async function cancelLineRequest(id: string, scope: LineScope, ownerId: string, by: string): Promise<PhoneLine> {
  const line = await getLine(id);
  const mine = line && line.scope === scope && (scope === "bedrijf" ? line.tenantId === ownerId : line.userId === ownerId);
  if (!line || !mine) throw AppError.notFound("Aanvraag niet gevonden");
  if (line.status !== "aangevraagd") throw AppError.validation("Deze aanvraag is al in behandeling; neem contact op om hem te stoppen.");
  return setLineStatus(line, "geannuleerd", by);
}

async function setLineStatus(line: PhoneLine, status: LineStatus, by: string, patch: Partial<Pick<PhoneLine, "number" | "adminNote">> = {}): Promise<PhoneLine> {
  const next: PhoneLine = {
    ...line,
    ...patch,
    status,
    history: line.status === status ? line.history : [...line.history, { at: new Date().toISOString(), status, by }],
  };
  await kvSet(lineKey(line.id), next);
  return next;
}

export const adminUpdateSchema = z.object({
  id: z.string().min(1).max(40),
  status: z.enum(["aangevraagd", "in_behandeling", "actief", "geannuleerd"]),
  number: phone.optional(),
  adminNote: z.string().trim().max(1000).optional(),
});

export async function adminUpdateLine(input: z.infer<typeof adminUpdateSchema>, actor: { userId: string; name: string }): Promise<PhoneLine> {
  const line = await getLine(input.id);
  if (!line) throw AppError.notFound("Aanvraag niet gevonden");
  if (input.status === "actief" && !(input.number || line.number)) throw AppError.validation("Vul het nummer in dat je hebt toegewezen.");
  const next = await setLineStatus(line, input.status, actor.name, {
    ...(input.number !== undefined ? { number: input.number || null } : {}),
    ...(input.adminNote !== undefined ? { adminNote: input.adminNote || null } : {}),
  });
  await recordAudit({
    category: "ADMIN",
    action: "telefonie.updated",
    summary: `Telefonie-aanvraag ${line.id}: ${line.status} → ${next.status}`,
    actorUserId: actor.userId,
    targetType: "phone-line",
    targetId: line.id,
  });
  return next;
}

export type { NumberKind, OptionId };
