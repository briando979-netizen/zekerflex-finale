import { prisma } from '@/lib/prisma';

export const queryOptimizations = {
  selectMinimal: true,
  batchSize: 1000,
  pagination: { default: 50, max: 100 },
  timeout: 30000,
};

export const indexStrategy = {
  composite: [
    { table: 'Shift', fields: ['companyId', 'status', 'startTime'] },
    { table: 'FreelancerProfile', fields: ['userId', 'verified', 'createdAt'] },
    { table: 'Assignment', fields: ['shiftId', 'status', 'freelancerId'] },
  ],
  partial: [
    { table: 'User', fields: ['email'], where: 'deletedAt IS NULL' },
    { table: 'Shift', fields: ['companyId'], where: 'cancelledAt IS NULL' },
  ],
};

export const connectionPool = {
  min: 5,
  max: 20,
  acquireTimeoutMillis: 30000,
  idleTimeoutMillis: 900000,
  reapIntervalMillis: 1000,
};

export const batchOperations = async (items: any[], batchFn: (batch: any[]) => Promise<void>) => {
  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    await batchFn(items.slice(i, i + batchSize));
  }
};

export const preventN1 = {
  enabled: true,
  maxDepth: 3,
  maxSelects: 10,
};

export const lazyLoadPatterns = {
  userProfile: (userId: string) => prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
  companyShifts: (companyId: string) => prisma.shift.findMany({ where: { companyId }, take: 1 }),
};

export interface PerformanceMetric {
  query: string;
  duration: number;
  timestamp: Date;
}

const metrics: PerformanceMetric[] = [];

export const trackQuery = (query: string, duration: number) => {
  metrics.push({ query, duration, timestamp: new Date() });
  if (duration > 1000) console.warn(`[PERF] Slow query: ${query} took ${duration}ms`);
};

export const getSlowQueries = (threshold = 1000) => metrics.filter(m => m.duration > threshold);
