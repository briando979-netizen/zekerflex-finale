import { prisma } from "@/lib/prisma";

export async function editMessage(messageId: string, newContent: string) {
  return await prisma.message.update({
    where: { id: messageId },
    data: {
      content: newContent,
      editedAt: new Date(),
    },
  });
}

export async function deleteMessage(messageId: string) {
  return await prisma.message.update({
    where: { id: messageId },
    data: {
      content: "[Verwijderd]",
      deletedAt: new Date(),
    },
  });
}

export async function getMessageHistory(messageId: string) {
  return await prisma.messageEdit.findMany({
    where: { messageId },
    orderBy: { createdAt: "desc" },
  });
}
