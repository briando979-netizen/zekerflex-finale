import { prisma } from "@/lib/prisma";

export type DeliveryChannel = "SMS" | "PUSH" | "EMAIL";

interface NotificationPreferences {
  smsEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  doNotDisturbStart?: number; // hour 0-23
  doNotDisturbEnd?: number;
  frequencyCapPerDay: number;
}

export async function getPreferences(userId: string, tenantId: string): Promise<NotificationPreferences> {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });

  return (
    prefs || {
      smsEnabled: true,
      pushEnabled: true,
      emailEnabled: true,
      frequencyCapPerDay: 10,
    }
  );
}

export async function updatePreferences(userId: string, tenantId: string, prefs: Partial<NotificationPreferences>) {
  return prisma.notificationPreference.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId, ...prefs },
    update: prefs,
  });
}

export async function selectChannels(userId: string, tenantId: string): Promise<DeliveryChannel[]> {
  const prefs = await getPreferences(userId, tenantId);
  const channels: DeliveryChannel[] = [];

  if (prefs.smsEnabled) channels.push("SMS");
  if (prefs.pushEnabled) channels.push("PUSH");
  if (prefs.emailEnabled) channels.push("EMAIL");

  return channels;
}

export async function isInDoNotDisturb(userId: string, tenantId: string): Promise<boolean> {
  const prefs = await getPreferences(userId, tenantId);
  if (!prefs.doNotDisturbStart || !prefs.doNotDisturbEnd) return false;

  const now = new Date();
  const hour = now.getHours();

  if (prefs.doNotDisturbStart <= prefs.doNotDisturbEnd) {
    return hour >= prefs.doNotDisturbStart && hour < prefs.doNotDisturbEnd;
  } else {
    return hour >= prefs.doNotDisturbStart || hour < prefs.doNotDisturbEnd;
  }
}

export async function checkFrequencyCap(userId: string, tenantId: string): Promise<boolean> {
  const prefs = await getPreferences(userId, tenantId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await prisma.notificationLog.count({
    where: {
      userId,
      tenantId,
      createdAt: { gte: today },
    },
  });

  return count < prefs.frequencyCapPerDay;
}

export async function canDeliver(userId: string, tenantId: string, channel: DeliveryChannel): Promise<boolean> {
  const prefs = await getPreferences(userId, tenantId);

  const enabled = {
    SMS: prefs.smsEnabled,
    PUSH: prefs.pushEnabled,
    EMAIL: prefs.emailEnabled,
  }[channel];

  if (!enabled) return false;

  const inDnd = await isInDoNotDisturb(userId, tenantId);
  if (inDnd) return false;

  const withinCap = await checkFrequencyCap(userId, tenantId);
  if (!withinCap) return false;

  return true;
}

export async function logNotification(userId: string, tenantId: string, channel: DeliveryChannel, content: string) {
  return prisma.notificationLog.create({
    data: {
      userId,
      tenantId,
      channel,
      content,
      deliveredAt: new Date(),
    },
  });
}

export async function trackBounce(userId: string, tenantId: string, channel: DeliveryChannel, reason: string) {
  await prisma.notificationBounce.create({
    data: {
      userId,
      tenantId,
      channel,
      reason,
      bouncedAt: new Date(),
    },
  });

  if (channel === "SMS") {
    await prisma.notificationPreference.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { smsEnabled: false },
    });
  }
}

export async function getDeliveryMetrics(tenantId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logs = await prisma.notificationLog.findMany({
    where: { tenantId, createdAt: { gte: today } },
  });

  const bounces = await prisma.notificationBounce.findMany({
    where: { tenantId, bouncedAt: { gte: today } },
  });

  return {
    totalSent: logs.length,
    smsSent: logs.filter((l) => l.channel === "SMS").length,
    pushSent: logs.filter((l) => l.channel === "PUSH").length,
    emailSent: logs.filter((l) => l.channel === "EMAIL").length,
    bounceRate: bounces.length / (logs.length || 1),
    bouncesByChannel: {
      SMS: bounces.filter((b) => b.channel === "SMS").length,
      PUSH: bounces.filter((b) => b.channel === "PUSH").length,
      EMAIL: bounces.filter((b) => b.channel === "EMAIL").length,
    },
  };
}
