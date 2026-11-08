import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const auditEventSchema = z.object({
  freelancerId: z.string().optional(),
  employerId: z.string().optional(),
  eventType: z.enum([
    'CONTRACT_SIGNED',
    'TAX_DOCUMENT_GENERATED',
    'INSURANCE_FILED',
    'COMPLIANCE_CHECK_FAILED',
    'WAGE_ADJUSTMENT',
    'DISPUTE_FILED',
    'APPEAL_SUBMITTED',
  ]),
  description: z.string(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  metadata: z.record(z.any()).optional(),
});

export async function logAuditEvent(data: z.infer<typeof auditEventSchema>) {
  const validated = auditEventSchema.parse(data);

  return await prisma.auditLog.create({
    data: {
      ...validated,
      timestamp: new Date(),
    },
  });
}

export async function monitorCompliance(frequencyDays: number = 7) {
  const freelancers = await prisma.freelancerProfile.findMany({
    include: { shifts: true, user: true },
  });

  const violations: any[] = [];

  for (const freelancer of freelancers) {
    // Check minimum wage
    const avgWage = freelancer.shifts.length > 0
      ? freelancer.shifts.reduce((sum, s) => sum + (s.hourlyRate || 0), 0) / freelancer.shifts.length
      : 0;

    if (avgWage > 0 && avgWage < 12.27) {
      violations.push({
        freelancerId: freelancer.userId,
        type: 'BELOW_MINIMUM_WAGE',
        currentWage: avgWage,
        minimumWage: 12.27,
      });

      await logAuditEvent({
        freelancerId: freelancer.userId,
        eventType: 'COMPLIANCE_CHECK_FAILED',
        description: `Hourly wage €${avgWage.toFixed(2)} below minimum €12.27`,
        severity: 'CRITICAL',
      });
    }

    // Check max work hours per week
    const weeklyHours = freelancer.shifts
      .filter((s) => s.startTime > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .reduce((sum, s) => sum + ((s.endTime.getTime() - s.startTime.getTime()) / (1000 * 60 * 60)), 0);

    if (weeklyHours > 56) {
      violations.push({
        freelancerId: freelancer.userId,
        type: 'EXCEEDED_WORK_HOURS',
        weeklyHours: weeklyHours.toFixed(1),
        maxHours: 56,
      });

      await logAuditEvent({
        freelancerId: freelancer.userId,
        eventType: 'COMPLIANCE_CHECK_FAILED',
        description: `Weekly hours ${weeklyHours.toFixed(1)} exceed maximum 56`,
        severity: 'WARNING',
      });
    }
  }

  return violations;
}

export async function getAuditTrail(freelancerId: string, limit: number = 50) {
  return await prisma.auditLog.findMany({
    where: { freelancerId },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

export async function flagComplianceIssue(freelancerId: string, issueType: string, details: string) {
  const issue = await prisma.complianceIssue.create({
    data: {
      freelancerId,
      issueType,
      description: details,
      status: 'OPEN',
      flaggedAt: new Date(),
    },
  });

  await logAuditEvent({
    freelancerId,
    eventType: 'COMPLIANCE_CHECK_FAILED',
    description: `${issueType}: ${details}`,
    severity: 'WARNING',
  });

  return issue;
}

export async function resolveComplianceIssue(issueId: string, resolution: string) {
  return await prisma.complianceIssue.update({
    where: { id: issueId },
    data: {
      status: 'RESOLVED',
      resolution,
      resolvedAt: new Date(),
    },
  });
}

export async function generateComplianceReport(startDate: Date, endDate: Date) {
  const events = await prisma.auditLog.findMany({
    where: {
      timestamp: { gte: startDate, lte: endDate },
    },
    orderBy: { timestamp: 'desc' },
  });

  const criticalEvents = events.filter((e) => e.severity === 'CRITICAL');
  const warningEvents = events.filter((e) => e.severity === 'WARNING');

  return {
    period: { startDate, endDate },
    totalEvents: events.length,
    criticalIssues: criticalEvents.length,
    warnings: warningEvents.length,
    complianceRate: events.length > 0
      ? ((events.length - criticalEvents.length) / events.length) * 100
      : 100,
    events,
  };
}
