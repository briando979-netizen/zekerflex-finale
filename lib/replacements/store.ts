import { randomUUID } from "node:crypto";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Replacement requests — Postgres-backed (KeyValueStore, key
// "replacement:<id>") — was local disk, unreliable on Vercel's serverless
// functions. A freelancer who can't make a shift asks for a substitute; the
// request is logged here and e-mailed to ops. Other freelancers can respond
// ("ik neem het over"); the original picks one and — only then — the
// assignment is actually reassigned in the database (see
// lib/replacements/reassign.ts).
// ---------------------------------------------------------------------------

export interface ReplacementResponse {
  userId: string;
  name: string;
  at: string;
  note: string;
}

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
  status: "open" | "resolved" | "cancelled";
  responses: ReplacementResponse[];
  /** userId of the freelancer who took it over, once resolved */
  substituteUserId?: string;
  substituteName?: string;
  resolvedAt?: string;
}

const key = (id: string) => `replacement:${id}`;

function normalise(raw: Partial<ReplacementRequest>): ReplacementRequest {
  return {
    id: raw.id ?? "",
    at: raw.at ?? new Date(0).toISOString(),
    userId: raw.userId ?? "",
    freelancerName: raw.freelancerName ?? "",
    assignmentId: raw.assignmentId ?? "",
    shiftId: raw.shiftId ?? "",
    shiftTitle: raw.shiftTitle ?? "",
    branch: raw.branch ?? "",
    startsAt: raw.startsAt ?? new Date(0).toISOString(),
    note: raw.note ?? "",
    status: raw.status ?? "open",
    responses: Array.isArray(raw.responses) ? raw.responses : [],
    ...(raw.substituteUserId ? { substituteUserId: raw.substituteUserId } : {}),
    ...(raw.substituteName ? { substituteName: raw.substituteName } : {}),
    ...(raw.resolvedAt ? { resolvedAt: raw.resolvedAt } : {}),
  };
}

async function write(rec: ReplacementRequest): Promise<ReplacementRequest> {
  await kvSet(key(rec.id), rec);
  return rec;
}

export async function createReplacementRequest(
  input: Omit<ReplacementRequest, "id" | "at" | "status" | "responses">,
): Promise<ReplacementRequest> {
  return write(
    normalise({
      ...input,
      id: randomUUID().slice(0, 12),
      at: new Date().toISOString(),
      status: "open",
      responses: [],
    }),
  );
}

export async function listReplacementRequests(limit = 100): Promise<ReplacementRequest[]> {
  const rows = await kvListValues<Partial<ReplacementRequest>>("replacement:", 2000);
  return rows.map(normalise).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export async function getReplacementRequest(id: string): Promise<ReplacementRequest | null> {
  const raw = await kvGet<Partial<ReplacementRequest>>(key(id.replace(/[^a-zA-Z0-9_-]/g, "")));
  return raw ? normalise(raw) : null;
}

/** The single open request covering a given shift, if any. */
export async function getOpenRequestForShift(shiftId: string): Promise<ReplacementRequest | null> {
  const all = await listReplacementRequests(500);
  return all.find((r) => r.shiftId === shiftId && r.status === "open") ?? null;
}

export async function openReplacementForAssignment(userId: string, assignmentId: string): Promise<boolean> {
  const all = await listReplacementRequests(500);
  return all.some((r) => r.userId === userId && r.assignmentId === assignmentId && r.status === "open");
}

/** Requests raised by this freelancer (any status), newest first. */
export async function listMyReplacementRequests(userId: string): Promise<ReplacementRequest[]> {
  return (await listReplacementRequests(500)).filter((r) => r.userId === userId);
}

/** Append a takeover response to the open request for `shiftId`. Idempotent per user. */
export async function addReplacementResponse(
  shiftId: string,
  responder: { userId: string; name: string; note?: string },
): Promise<ReplacementRequest | null> {
  const req = await getOpenRequestForShift(shiftId);
  if (!req) return null;
  if (req.userId === responder.userId) return req;
  const existing = req.responses.find((r) => r.userId === responder.userId);
  if (existing) {
    existing.note = (responder.note ?? "").slice(0, 400);
    existing.at = new Date().toISOString();
  } else {
    req.responses.push({
      userId: responder.userId,
      name: responder.name,
      at: new Date().toISOString(),
      note: (responder.note ?? "").slice(0, 400),
    });
  }
  return write(req);
}

export async function withdrawReplacementResponse(
  shiftId: string,
  userId: string,
): Promise<ReplacementRequest | null> {
  const req = await getOpenRequestForShift(shiftId);
  if (!req) return null;
  req.responses = req.responses.filter((r) => r.userId !== userId);
  return write(req);
}

export async function markReplacementResolved(
  id: string,
  substitute: { userId: string; name: string },
): Promise<ReplacementRequest | null> {
  const req = await getReplacementRequest(id);
  if (!req) return null;
  req.status = "resolved";
  req.substituteUserId = substitute.userId;
  req.substituteName = substitute.name;
  req.resolvedAt = new Date().toISOString();
  return write(req);
}

export async function cancelReplacementRequest(id: string): Promise<ReplacementRequest | null> {
  const req = await getReplacementRequest(id);
  if (!req) return null;
  req.status = "cancelled";
  return write(req);
}
