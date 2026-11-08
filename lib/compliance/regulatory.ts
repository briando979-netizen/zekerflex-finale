import { prisma } from '@/lib/prisma';

export interface WttaCompliance {
  maxWorkHours: number;
  minRestDays: number;
  minHourlyRate: number;
  requiresRegistration: boolean;
  requiresInsurance: boolean;
}

export const WTTA_RULES: Record<string, WttaCompliance> = {
  NL: {
    maxWorkHours: 56, // per week average
    minRestDays: 2,
    minHourlyRate: 12.27, // 2024 minimum
    requiresRegistration: true,
    requiresInsurance: true,
  },
};

export const LABOR_LAW_RULES = {
  NL: {
    minimumVacationDays: 20,
    minimumSickLeaveDays: 2,
    overtimeMultiplier: 1.25,
    nightWorkMultiplier: 1.5,
    wokenessAllowance: 2.5, // euros per call-out
  },
};

export async function validateWttaCompliance(freelancerId: string, countryCode: string = 'NL') {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId: freelancerId },
    include: {
      shifts: {
        where: {
          startTime: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          endTime: { lte: new Date() },
        },
      },
    },
  });

  if (!freelancer) throw new Error('Freelancer not found');

  const rules = WTTA_RULES[countryCode];
  const totalHours = freelancer.shifts.reduce((sum, s) => {
    return sum + ((s.endTime.getTime() - s.startTime.getTime()) / (1000 * 60 * 60));
  }, 0);

  const weeklyAverage = totalHours / 1;
  const violations: string[] = [];

  if (weeklyAverage > rules.maxWorkHours) {
    violations.push(`Exceeded max work hours: ${weeklyAverage.toFixed(1)} > ${rules.maxWorkHours}`);
  }

  if ((freelancer.shifts[0]?.hourlyRate || 0) < rules.minHourlyRate) {
    violations.push(`Hourly rate below minimum: €${freelancer.shifts[0]?.hourlyRate} < €${rules.minHourlyRate}`);
  }

  return {
    compliant: violations.length === 0,
    violations,
    weeklyHours: weeklyAverage.toFixed(1),
    requiredMinimumWage: rules.minHourlyRate,
  };
}

export async function calculateLaborLawCompliance(freelancerId: string, countryCode: string = 'NL') {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId: freelancerId },
    include: { shifts: true },
  });

  if (!freelancer) throw new Error('Freelancer not found');

  const rules = LABOR_LAW_RULES[countryCode];
  const shifts = freelancer.shifts;

  const nightShifts = shifts.filter((s) => s.startTime.getHours() >= 20 || s.startTime.getHours() < 6).length;
  const overtimeShifts = shifts.filter((s) => {
    const hours = (s.endTime.getTime() - s.startTime.getTime()) / (1000 * 60 * 60);
    return hours > 8;
  }).length;

  const overtimeCompensation = overtimeShifts * 2 * rules.overtimeMultiplier;
  const nightCompensation = nightShifts * 2 * rules.nightWorkMultiplier;

  return {
    overtimeShifts,
    nightShifts,
    overtimeCompensation: Math.round(overtimeCompensation * 100),
    nightCompensation: Math.round(nightCompensation * 100),
    vacationDaysEarned: Math.ceil((shifts.length * 8) / 5 / 20 * rules.minimumVacationDays),
    wokenessAllowance: Math.round(nightShifts * rules.wokenessAllowance * 100),
  };
}

export async function logComplianceCheck(freelancerId: string, checkType: string, result: boolean) {
  return await prisma.complianceLog.create({
    data: {
      freelancerId,
      checkType,
      result,
      checkedAt: new Date(),
    },
  });
}

export async function getComplianceStatus(freelancerId: string) {
  const logs = await prisma.complianceLog.findMany({
    where: { freelancerId },
    orderBy: { checkedAt: 'desc' },
    take: 10,
  });

  const passedChecks = logs.filter((l) => l.result).length;
  const totalChecks = logs.length;

  return {
    complianceScore: totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0,
    recentChecks: logs,
    status: passedChecks / totalChecks > 0.8 ? 'COMPLIANT' : 'AT_RISK',
  };
}
