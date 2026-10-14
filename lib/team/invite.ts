import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { kvGet, kvSet, kvListValues } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Teamuitnodiging: een HQ_ADMIN nodigt een collega uit voor hun EIGEN,
// bestaande tenant (in tegenstelling tot lib/sales/invite.ts, dat een geheel
// nieuw bedrijfsaccount opstart). De JWT draagt de uitnodiging zelf (zoals
// het sales-patroon) maar wordt aangevuld met een KV-rij (TeamInviteRecord)
// zodat openstaande uitnodigingen in /werkgever/team gelist en ingetrokken
// kunnen worden — een losse JWT kan dat niet.
// ---------------------------------------------------------------------------

const ISSUER = "zekerflex.team-invite";
const TTL_DAYS = 14;
const PREFIX = "team-invite:";

export const INVITABLE_ROLES = ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export type TeamInviteStatus = "pending" | "revoked" | "accepted";

export interface TeamInviteRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  role: InvitableRole;
  branchIds: string[];
  invitedByUserId: string;
  invitedByName: string;
  createdAt: string;
  status: TeamInviteStatus;
}

function key(tenantId: string, id: string): string {
  return `${PREFIX}${tenantId}:${id}`;
}

function signingKey(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export interface TeamInviteTokenPayload {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  role: InvitableRole;
  branchIds: string[];
  invitedByName: string;
}

export async function createTeamInvite(input: {
  tenantId: string;
  tenantName: string;
  email: string;
  role: InvitableRole;
  branchIds: string[];
  invitedByUserId: string;
  invitedByName: string;
}): Promise<{ record: TeamInviteRecord; token: string }> {
  const id = randomUUID().slice(0, 12);
  const record: TeamInviteRecord = {
    id,
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    email: input.email.toLowerCase().trim(),
    role: input.role,
    branchIds: input.branchIds,
    invitedByUserId: input.invitedByUserId,
    invitedByName: input.invitedByName,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await kvSet(key(input.tenantId, id), record);

  const token = await new SignJWT({
    id,
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    email: record.email,
    role: input.role,
    branchIds: input.branchIds,
    invitedByName: input.invitedByName,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(`${TTL_DAYS}d`)
    .sign(signingKey());

  return { record, token };
}

export async function verifyTeamInviteToken(token: string): Promise<TeamInviteTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER });
    if (
      typeof payload.id !== "string" ||
      typeof payload.tenantId !== "string" ||
      typeof payload.tenantName !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      !(INVITABLE_ROLES as readonly string[]).includes(payload.role)
    ) {
      return null;
    }
    return {
      id: payload.id,
      tenantId: payload.tenantId,
      tenantName: payload.tenantName,
      email: payload.email,
      role: payload.role as InvitableRole,
      branchIds: Array.isArray(payload.branchIds) ? (payload.branchIds as string[]) : [],
      invitedByName: typeof payload.invitedByName === "string" ? payload.invitedByName : "je collega",
    };
  } catch {
    return null;
  }
}

export async function getTeamInvite(tenantId: string, id: string): Promise<TeamInviteRecord | null> {
  return kvGet<TeamInviteRecord>(key(tenantId, id));
}

export async function listPendingTeamInvites(tenantId: string): Promise<TeamInviteRecord[]> {
  const all = await kvListValues<TeamInviteRecord>(`${PREFIX}${tenantId}:`);
  return all.filter((r) => r.status === "pending");
}

export async function revokeTeamInvite(tenantId: string, id: string): Promise<void> {
  const record = await getTeamInvite(tenantId, id);
  if (!record) return;
  await kvSet(key(tenantId, id), { ...record, status: "revoked" });
}

export async function markTeamInviteAccepted(tenantId: string, id: string): Promise<void> {
  const record = await getTeamInvite(tenantId, id);
  if (!record) return;
  await kvSet(key(tenantId, id), { ...record, status: "accepted" });
}

export function teamInviteUrl(token: string): string {
  return `${env.APP_BASE_URL.replace(/\/+$/, "")}/uitnodiging/team?token=${encodeURIComponent(token)}`;
}
