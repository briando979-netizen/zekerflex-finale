import { prisma } from "@/lib/prisma";

export async function createTemplate(userId: string, title: string, content: string) {
  return await prisma.chatTemplate.create({
    data: { userId, title, content },
  });
}

export async function getTemplates(userId: string) {
  return await prisma.chatTemplate.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function useTemplate(templateId: string) {
  return await prisma.chatTemplate.update({
    where: { id: templateId },
    data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
  });
}

export async function deleteTemplate(templateId: string) {
  return await prisma.chatTemplate.delete({
    where: { id: templateId },
  });
}
