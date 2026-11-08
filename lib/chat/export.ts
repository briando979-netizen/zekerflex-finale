import { prisma } from "@/lib/prisma";
import { json2csv } from "json2csv";

export async function exportChatHistory(userId: string, conversationWith: string) {
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, recipientId: conversationWith },
        { senderId: conversationWith, recipientId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const data = messages.map((m) => ({
    from: m.senderId,
    to: m.recipientId,
    message: m.content,
    time: m.createdAt,
    read: m.readAt ? "ja" : "nee",
  }));

  try {
    return json2csv({ data });
  } catch {
    return JSON.stringify(data, null, 2);
  }
}
