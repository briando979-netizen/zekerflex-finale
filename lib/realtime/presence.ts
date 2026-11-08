import { prisma } from "@/lib/prisma";

export interface PresenceUpdate {
  userId: string;
  status: "online" | "away" | "offline" | "in-call";
  lastSeen: Date;
  typing?: string;
  callId?: string;
  device?: "mobile" | "desktop";
}

const presenceCache = new Map<string, PresenceUpdate>();
const presenceListeners = new Set<(update: PresenceUpdate) => void>();

export function subscribePresence(listener: (update: PresenceUpdate) => void) {
  presenceListeners.add(listener);
  return () => presenceListeners.delete(listener);
}

export async function setPresence(userId: string, status: PresenceUpdate["status"], device?: string) {
  const update: PresenceUpdate = {
    userId,
    status,
    lastSeen: new Date(),
    device: device as "mobile" | "desktop" | undefined,
  };

  presenceCache.set(userId, update);
  presenceListeners.forEach((l) => l(update));

  await prisma.userPresence.upsert({
    where: { userId },
    create: { userId, status, device: device ?? "desktop", lastSeen: new Date() },
    update: { status, device: device ?? "desktop", lastSeen: new Date() },
  });
}

export async function setTyping(userId: string, room: string) {
  const update = presenceCache.get(userId);
  if (update) {
    update.typing = room;
    presenceListeners.forEach((l) => l(update));
  }
}

export async function clearTyping(userId: string) {
  const update = presenceCache.get(userId);
  if (update) {
    delete update.typing;
    presenceListeners.forEach((l) => l(update));
  }
}

export function getPresence(userId: string): PresenceUpdate | undefined {
  return presenceCache.get(userId);
}

export function getPresenceForRoom(room: string): PresenceUpdate[] {
  return Array.from(presenceCache.values()).filter((p) => p.status === "online" || p.status === "in-call");
}

export async function loadPresence() {
  const presences = await prisma.userPresence.findMany();
  presences.forEach((p) => {
    presenceCache.set(p.userId, {
      userId: p.userId,
      status: (p.status as any) ?? "offline",
      lastSeen: p.lastSeen,
      device: (p.device as any) ?? "desktop",
    });
  });
}
