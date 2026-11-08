import { prisma } from '@/lib/prisma';

export const queryOptimizations = {
  select: { minimal: true, nested: false },
  batchSize: 100,
  timeout: 30000,
};

export const indexManagement = {
  create: [
    `CREATE INDEX CONCURRENTLY idx_shift_company_status ON "Shift"("companyId", "status") WHERE "cancelledAt" IS NULL`,
    `CREATE INDEX CONCURRENTLY idx_assignment_shift_status ON "Assignment"("shiftId", "status")`,
    `CREATE INDEX CONCURRENTLY idx_freelancer_verified_created ON "FreelancerProfile"("verified", "createdAt" DESC)`,
    `CREATE INDEX CONCURRENTLY idx_user_email_deleted ON "User"("email") WHERE "deletedAt" IS NULL`,
  ],
  analyze: `ANALYZE;`,
};

export const partitionStrategy = {
  shifts: { column: 'createdAt', interval: 'MONTH' },
  assignments: { column: 'createdAt', interval: 'MONTH' },
  auditLog: { column: 'createdAt', interval: 'MONTH' },
};

export const queryCache = new Map<string, { data: any; expires: number }>();

export const cachedQuery = async (key: string, query: () => Promise<any>, ttl = 300000) => {
  const cached = queryCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  const data = await query();
  queryCache.set(key, { data, expires: Date.now() + ttl });
  return data;
};

export const readReplica = {
  enabled: true,
  routes: [
    { pattern: /analytics|metrics|reports/, replica: 'READ_REPLICA_1' },
    { pattern: /dashboard|profile/, replica: 'READ_REPLICA_2' },
  ],
};

export const denormalization = {
  shifts: { cache: ['companyName', 'companyRating', 'assignmentCount'] },
  assignments: { cache: ['shiftTitle', 'freelancerRating', 'status'] },
};

export const replication = {
  strategy: 'logical',
  lag_threshold: 1000,
  monitoring: true,
};
