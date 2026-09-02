import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Demo requests from opdrachtgevers ("Vraag een demo aan"). Filesystem only:
//   storage/demo/<ts>-<id>.json
// No database, no Redis, no external scheduler.
// ---------------------------------------------------------------------------

function dir(): string {
  return join(process.cwd(), "storage", "demo");
}

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
  await mkdir(dir(), { recursive: true });
  await writeFile(join(dir(), `${at.replace(/[:.]/g, "-")}-${id}.json`), JSON.stringify(rec, null, 2), "utf8");
  return rec;
}

export async function getDemoRequest(id: string): Promise<DemoRequest | null> {
  if (!/^[a-f0-9-]{6,20}$/.test(id) || !existsSync(dir())) return null;
  const files = (await readdir(dir())).filter((f) => f.endsWith(`-${id}.json`));
  if (!files[0]) return null;
  try {
    return JSON.parse(await readFile(join(dir(), files[0]), "utf8")) as DemoRequest;
  } catch {
    return null;
  }
}

export async function listDemoRequests(limit = 200): Promise<DemoRequest[]> {
  if (!existsSync(dir())) return [];
  const files = (await readdir(dir()))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);
  const out: DemoRequest[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(dir(), f), "utf8")) as DemoRequest);
    } catch {
      /* skip */
    }
  }
  return out;
}
