import { prisma } from '@/lib/prisma';

export interface ActivityLog {
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export async function logActivity(log: ActivityLog) {
  return prisma.activityLog.create({
    data: {
      userId: log.userId,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      metadata: log.metadata,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: log.timestamp,
    },
  });
}

export async function getActivityHistory(userId: string, limit = 50, offset = 0) {
  return prisma.activityLog.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    take: limit,
    skip: offset,
  });
}

export async function trackLogin(userId: string, ipAddress: string, userAgent: string, deviceName?: string) {
  await logActivity({
    userId,
    action: 'LOGIN',
    resource: 'auth',
    resourceId: userId,
    metadata: { deviceName },
    ipAddress,
    userAgent,
    timestamp: new Date(),
  });

  return prisma.userDevice.upsert({
    where: { userId_deviceName: { userId, deviceName: deviceName || 'unknown' } },
    create: { userId, deviceName: deviceName || 'unknown', lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
  });
}

export async function getLastSeen(userId: string) {
  const lastLogin = await prisma.activityLog.findFirst({
    where: { userId, action: 'LOGIN' },
    orderBy: { timestamp: 'desc' },
  });

  return lastLogin?.timestamp || null;
}

export async function getDevices(userId: string) {
  return prisma.userDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
  });
}

export async function getActivityStats(userId: string) {
  const logs = await prisma.activityLog.findMany({
    where: { userId },
    take: 1000,
  });

  const grouped = logs.reduce((acc, log) => {
    acc[log.action] = (acc[log.action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalActions: logs.length,
    actionBreakdown: grouped,
    lastActivity: logs[0]?.timestamp || null,
  };
}
