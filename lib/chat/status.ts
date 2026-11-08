import { prisma } from "@/lib/prisma";

export type UserStatus = "online" | "offline" | "away" | "busy";

export async function setUserStatus(userId: string, status: UserStatus) {
  return await prisma.userStatus.upsert({
    where: { userId },
    update: { status, updatedAt: new Date() },
    create: { userId, status },
  });
}

export async function getUserStatus(userId: string) {
  return await prisma.userStatus.findUnique({
    where: { userId },
  });
}

export async function getOnlineUsers() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  return await prisma.userStatus.findMany({
    where: {
      status: "online",
      updatedAt: { gte: fiveMinutesAgo },
    },
  });
}
