import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Replacement requests on the filesystem — non-destructive. A freelancer who
// can't make a shift asks for a substitute; the request is logged here and
// e-mailed to ops. A human (or a later job) reassigns. Nothing touches the
// ShiftAssignment / ReplacementRequest tables.
//   storage/replacements/<id>.json
// ---------------------------------------------------------------------------

export interface ReplacementRequest {
  id: string;
  at: string;
  userId: string;
  freelancerName: string;
  assignmentId: string;
  shiftId: string;
  shiftTitle: string;
  branch: string;
  startsAt: string;
  note: string;
  status: "open" | "resolved";
}

function dir(): string {
  return join(process.cwd(), "storage", "replacements");
}

export async function createReplacementRequest(
  input: Omit<ReplacementRequest, "id" | "at" | "status">,
): Promise<ReplacementRequest> {
  await mkdir(dir(), { recursive: true });
  const rec: ReplacementRequest = {
    id: randomUUID().slice(0, 12),
    at: new Date().toISOString(),
    status: "open",
    ...input,
  };
  await writeFile(join(dir(), `${rec.id}.json`), JSON.stringify(rec, null, 2), "utf8");
  return rec;
}

export async function listReplacementRequests(limit = 100): Promise<ReplacementRequest[]> {
  if (!existsSync(dir())) return [];
  const files = (await readdir(dir())).filter((f) => f.endsWith(".json"));
  const out: ReplacementRequest[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(dir(), f), "utf8")) as ReplacementRequest);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export async function openReplacementForAssignment(userId: string, assignmentId: string): Promise<boolean> {
  const all = await listReplacementRequests(500);
  return all.some((r) => r.userId === userId && r.assignmentId === assignmentId && r.status === "open");
}
