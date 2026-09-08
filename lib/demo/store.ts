import { randomUUID } from "node:crypto";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Demo requests from opdrachtgevers ("Vraag een demo aan"). Postgres-backed
// (KeyValueStore, key "demo:<id>") — was local disk, unreliable on Vercel.
// ---------------------------------------------------------------------------

const key = (id: string) => `demo:${id}`;

export interface DemoRequest {
  id: string;
  at: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone?: string;
  /** ISO date, e.g. 2026-09-09 */
  date: string;
  /** HH:MM, 24h */
  time: string;
  note?: string;
}

export async function saveDemoRequest(input: Omit<DemoRequest, "id" | "at">): Promise<DemoRequest> {
  const id = randomUUID().slice(0, 12);
  const at = new Date().toISOString();
  const rec: DemoRequest = { id, at, ...input };
  await kvSet(key(id), rec);
  return rec;
}

export async function getDemoRequest(id: string): Promise<DemoRequest | null> {
  if (!/^[a-f0-9-]{6,20}$/.test(id)) return null;
  return kvGet<DemoRequest>(key(id));
}

export async function listDemoRequests(limit = 200): Promise<DemoRequest[]> {
  return kvListValues<DemoRequest>("demo:", limit);
}
