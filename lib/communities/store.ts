import { randomUUID } from "node:crypto";
import { ensureGroupThread, getGroupThreadByCommunity } from "@/lib/messaging/store";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Communities — user-made groups ("mijn community"). Each community owns one
// group chat thread. Postgres-backed (KeyValueStore, key "community:<id>") —
// was local disk, unreliable on Vercel's serverless functions.
// ---------------------------------------------------------------------------

export type CommunityRole = "owner" | "admin" | "member";

export interface CommunityMember {
  userId: string;
  role: CommunityRole;
  joinedAt: string;
}

export interface CommunityInvite {
  token: string;
  toUserId?: string;
  toEmail?: string;
  invitedBy: string;
  at: string;
  acceptedAt?: string;
}

export interface Community {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: CommunityMember[];
  invites: CommunityInvite[];
  createdAt: string;
  threadId?: string;
}

const key = (id: string) => `community:${id}`;

async function write(c: Community): Promise<void> {
  await kvSet(key(c.id), c);
}

export async function getCommunity(id: string): Promise<Community | null> {
  return kvGet<Community>(key(id.replace(/[^a-z0-9-]/gi, "")));
}

async function allCommunities(): Promise<Community[]> {
  return kvListValues<Community>("community:", 5000);
}

export function isMember(c: Community, userId: string): boolean {
  return c.members.some((m) => m.userId === userId);
}
export function memberRole(c: Community, userId: string): CommunityRole | null {
  return c.members.find((m) => m.userId === userId)?.role ?? null;
}
export function canManage(c: Community, userId: string): boolean {
  const r = memberRole(c, userId);
  return r === "owner" || r === "admin";
}

export async function listCommunitiesForUser(userId: string): Promise<Community[]> {
  return (await allCommunities())
    .filter((c) => isMember(c, userId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createCommunity(
  ownerId: string,
  name: string,
  description = "",
): Promise<Community> {
  const now = new Date().toISOString();
  const c: Community = {
    id: randomUUID().slice(0, 10),
    name: name.trim().slice(0, 80) || "Naamloze community",
    description: description.trim().slice(0, 400),
    ownerId,
    members: [{ userId: ownerId, role: "owner", joinedAt: now }],
    invites: [],
    createdAt: now,
  };
  const thread = await ensureGroupThread(c.id, c.name, ownerId, [ownerId]);
  c.threadId = thread.id;
  await write(c);
  return c;
}

async function syncThread(c: Community): Promise<void> {
  const thread = await ensureGroupThread(
    c.id,
    c.name,
    c.ownerId,
    c.members.map((m) => m.userId),
  );
  if (c.threadId !== thread.id) {
    c.threadId = thread.id;
    await write(c);
  }
}

export async function inviteToCommunity(
  c: Community,
  invitedBy: string,
  target: { userId?: string; email?: string },
): Promise<CommunityInvite> {
  const invite: CommunityInvite = {
    token: randomUUID().slice(0, 16),
    invitedBy,
    at: new Date().toISOString(),
    ...(target.userId ? { toUserId: target.userId } : {}),
    ...(target.email ? { toEmail: target.email.toLowerCase() } : {}),
  };
  c.invites.push(invite);
  await write(c);
  return invite;
}

/** Add a user directly (owner/admin picked them) and keep the group chat in sync. */
export async function addMember(c: Community, userId: string, role: CommunityRole = "member"): Promise<void> {
  if (isMember(c, userId)) return;
  c.members.push({ userId, role, joinedAt: new Date().toISOString() });
  await write(c);
  await syncThread(c);
}

export async function acceptInvite(communityId: string, token: string, userId: string): Promise<Community | null> {
  const c = await getCommunity(communityId);
  if (!c) return null;
  const invite = c.invites.find((i) => i.token === token && !i.acceptedAt);
  if (!invite) return null;
  if (invite.toUserId && invite.toUserId !== userId) return null;
  invite.acceptedAt = new Date().toISOString();
  if (!isMember(c, userId)) c.members.push({ userId, role: "member", joinedAt: invite.acceptedAt });
  await write(c);
  await syncThread(c);
  return c;
}

export async function removeMember(c: Community, userId: string): Promise<void> {
  if (userId === c.ownerId) throw new Error("owner cannot leave; transfer or delete");
  c.members = c.members.filter((m) => m.userId !== userId);
  await write(c);
  await syncThread(c);
}

export async function renameCommunity(c: Community, name: string, description?: string): Promise<Community> {
  c.name = name.trim().slice(0, 80) || c.name;
  if (description !== undefined) c.description = description.trim().slice(0, 400);
  await write(c);
  await syncThread(c);
  return c;
}

export { getGroupThreadByCommunity };
