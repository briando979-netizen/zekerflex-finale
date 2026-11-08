import { prisma } from "@/lib/prisma";

export type NotificationType = "shift_available" | "shift_accepted" | "shift_completed" | "message" | "payment" | "booking";

export async function sendNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        data: data ? JSON.stringify(data) : null,
        read: false,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushTokens: true, locale: true },
    });

    if (user?.pushTokens?.length) {
      for (const token of user.pushTokens) {
        await sendPushNotification(token, title, body, data);
      }
    }
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
}

async function sendPushNotification(token: string, title: string, body: string, data?: Record<string, string>) {
  try {
    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${process.env.FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: token,
        notification: { title, body },
        data: data || {},
      }),
    });

    if (!response.ok) {
      console.error("FCM error:", await response.text());
    }
  } catch (err) {
    console.error("Failed to send push:", err);
  }
}

export async function getNotifications(userId: string, limit = 20) {
  return await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markAsRead(notificationId: string) {
  return await prisma.notification.update({
    where: { id: notificationId },
    data: { read: true, readAt: new Date() },
  });
}
