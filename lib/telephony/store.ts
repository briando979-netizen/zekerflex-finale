import { randomUUID } from "node:crypto";
import { kvGet, kvSet, kvListValues } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Belgeschiedenis (ZekerFlex AI-beller). Postgres-backed via KeyValueStore,
// key "call:<id>" — zelfde patroon als de demo-afspraken. Elke oproep houdt
// een tekst-transcript bij (wat de AI zei + wat de beller zei) plus, voor
// uitgaande oproepen, een opname-URL van Twilio.
// ---------------------------------------------------------------------------

const key = (id: string) => `call:${id}`;

export type CallDirection = "outbound" | "inbound";
export type CallStatus = "queued" | "ringing" | "in-progress" | "completed" | "failed" | "busy" | "no-answer" | "mock";

export interface CallTurn {
  at: string;
  who: "ai" | "beller";
  text: string;
}

/** Gestructureerde uitkomst van een gesprek (door de AI uit het transcript gehaald). */
export interface CallOutcome {
  interested: boolean;
  kind: "werkgever" | "werknemer" | "melding" | "support" | "anders";
  contactName?: string;
  company?: string;
  callbackNote?: string;
  summary: string;
}

export interface CallRecord {
  id: string;
  at: string;
  direction: CallDirection;
  toNumber: string;
  fromNumber: string;
  status: CallStatus;
  /** Welk script/doel (bv. "intro-horeca"). */
  script: string;
  leadId?: string;
  providerCallId?: string;
  recordingUrl?: string;
  /** Gekozen taal (IVR) — stuurt stem, spraakherkenning en AI-taal. */
  lang?: "nl" | "en";
  /** Gekozen afdeling in het keuzemenu (toets). */
  dept?: string;
  transcript: CallTurn[];
  /** Uitkomst na afloop: interesse, naam/bedrijf, terugbelnotitie, samenvatting. */
  outcome?: CallOutcome;
  updatedAt: string;
}

export async function createCall(input: {
  direction: CallDirection;
  toNumber: string;
  fromNumber: string;
  status: CallStatus;
  script: string;
  leadId?: string | undefined;
  providerCallId?: string | undefined;
}): Promise<CallRecord> {
  const id = randomUUID().slice(0, 12);
  const now = new Date().toISOString();
  const rec: CallRecord = {
    id,
    at: now,
    updatedAt: now,
    transcript: [],
    direction: input.direction,
    toNumber: input.toNumber,
    fromNumber: input.fromNumber,
    status: input.status,
    script: input.script,
    ...(input.leadId ? { leadId: input.leadId } : {}),
    ...(input.providerCallId ? { providerCallId: input.providerCallId } : {}),
  };
  await kvSet(key(id), rec);
  return rec;
}

export async function getCall(id: string): Promise<CallRecord | null> {
  if (!/^[a-f0-9-]{6,20}$/.test(id)) return null;
  return kvGet<CallRecord>(key(id));
}

export async function patchCall(id: string, patch: Partial<Omit<CallRecord, "id" | "at">>): Promise<CallRecord | null> {
  const rec = await getCall(id);
  if (!rec) return null;
  const next: CallRecord = { ...rec, ...patch, updatedAt: new Date().toISOString() };
  await kvSet(key(id), next);
  return next;
}

export async function addTurn(id: string, who: CallTurn["who"], text: string): Promise<CallRecord | null> {
  const rec = await getCall(id);
  if (!rec) return null;
  rec.transcript.push({ at: new Date().toISOString(), who, text });
  rec.updatedAt = new Date().toISOString();
  await kvSet(key(id), rec);
  return rec;
}

export async function listCalls(limit = 100): Promise<CallRecord[]> {
  const all = await kvListValues<CallRecord>("call:", limit * 2);
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
