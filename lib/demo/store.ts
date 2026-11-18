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
  /** "demo" (platformrondleiding, standaard) of "call" (belafspraak — we bellen je op). */
  kind?: "demo" | "call";
  /** Waar het over gaat — vrije korte omschrijving van de bezoeker. */
  topic?: string;
}

export async function saveDemoRequest(input: Omit<DemoRequest, "id" | "at">): Promise<DemoRequest> {
  const id = randomUUID().slice(0, 12);
  const at = new Date().toISOString();
  const rec: DemoRequest = { id, at, ...input };
  await kvSet(key(id), rec);
  // de eigenaar melden (lib/ops/melder.ts): los ingeladen en niet afgewacht, zonder naam, bedrijf of e-mail (die staan bij Sales);
  // aanvragen met een testadres slaan we over
  void Promise.all([import("@/lib/mail/test-adres"), import("@/lib/ops/melder")])
    .then(([{ isReservedTestAddress }, { meldGebeurtenis }]) =>
      isReservedTestAddress(rec.email) ? undefined : meldGebeurtenis({ soort: "demo", titel: rec.kind === "call" ? "Belafspraak ingepland" : "Demo ingepland", detail: `Op ${rec.date} om ${rec.time}`, url: "/admin/sales" }),
    )
    .catch(() => undefined);
  return rec;
}

export async function getDemoRequest(id: string): Promise<DemoRequest | null> {
  if (!/^[a-f0-9-]{6,20}$/.test(id)) return null;
  return kvGet<DemoRequest>(key(id));
}

export async function listDemoRequests(limit = 200): Promise<DemoRequest[]> {
  return kvListValues<DemoRequest>("demo:", limit);
}
