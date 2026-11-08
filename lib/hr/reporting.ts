import { prisma } from "@/lib/prisma";

interface HRMetrics {
  totalHeadcount: number;
  activeEmployees: number;
  newHires: number;
  terminations: number;
  turnoverRate: number;
  averageTenure: number;
  departmentBreakdown: Record<string, number>;
  employmentTypeBreakdown: Record<string, number>;
}

export async function getHRMetrics(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<HRMetrics> {
  const allEmployees = await prisma.employee.findMany({
    where: { tenantId },
  });

  const active = allEmployees.filter((e) => e.status === "ACTIVE");
  const newHires = allEmployees.filter(
    (e) => new Date(e.hireDate) >= startDate && new Date(e.hireDate) <= endDate
  );
  const terminated = allEmployees.filter(
    (e) => e.status === "TERMINATED" && e.terminationDate
  );

  const deptBreakdown: Record<string, number> = {};
  const typeBreakdown: Record<string, number> = {};

  for (const emp of active) {
    deptBreakdown[emp.department] = (deptBreakdown[emp.department] || 0) + 1;
    typeBreakdown[emp.employmentType] = (typeBreakdown[emp.employmentType] || 0) + 1;
  }

  const avgTenure =
    active.length > 0
      ? Math.round(
          active.reduce((sum, e) => {
            const tenure = (Date.now() - new Date(e.hireDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
            return sum + tenure;
          }, 0) / active.length
        )
      : 0;

  const turnover = allEmployees.length > 0 ? terminated.length / allEmployees.length : 0;

  return {
    totalHeadcount: allEmployees.length,
    activeEmployees: active.length,
    newHires: newHires.length,
    terminations: terminated.length,
    turnoverRate: Math.round(turnover * 100),
    averageTenure: avgTenure,
    departmentBreakdown: deptBreakdown,
    employmentTypeBreakdown: typeBreakdown,
  };
}

export async function getCompensationReport(tenantId: string) {
  const salaries = await prisma.salarySetup.findMany({
    where: { employee: { tenantId } },
    include: { employee: true },
  });

  const totalPayroll = salaries.reduce((sum, s) => sum + s.baseSalary, 0);
  const avgSalary = salaries.length > 0 ? Math.round(totalPayroll / salaries.length) : 0;
  const minSalary = salaries.length > 0 ? Math.min(...salaries.map((s) => s.baseSalary)) : 0;
  const maxSalary = salaries.length > 0 ? Math.max(...salaries.map((s) => s.baseSalary)) : 0;

  return {
    totalPayroll,
    avgSalary,
    minSalary,
    maxSalary,
    employeeCount: salaries.length,
    byDepartment: groupByDepartment(salaries),
  };
}

function groupByDepartment(
  salaries: any[]
): Record<string, { count: number; total: number; avg: number }> {
  const grouped: Record<string, number[]> = {};

  for (const s of salaries) {
    const dept = s.employee.department;
    if (!grouped[dept]) grouped[dept] = [];
    grouped[dept].push(s.baseSalary);
  }

  const result: Record<string, { count: number; total: number; avg: number }> = {};
  for (const [dept, salaries] of Object.entries(grouped)) {
    const total = salaries.reduce((a, b) => a + b, 0);
    result[dept] = {
      count: salaries.length,
      total,
      avg: Math.round(total / salaries.length),
    };
  }

  return result;
}

export async function getLeaveAnalysis(tenantId: string) {
  const records = await prisma.attendance.findMany({
    where: { tenantId, status: "LEAVE" },
  });

  const byEmployee: Record<string, number> = {};
  for (const r of records) {
    byEmployee[r.employeeId] = (byEmployee[r.employeeId] || 0) + 1;
  }

  return { totalLeaveRecords: records.length, byEmployee };
}

export async function generateComplianceReport(tenantId: string) {
  const allDocs = await prisma.complianceDocument.findMany({
    where: { tenantId },
  });

  const pending = allDocs.filter((d) => d.status === "PENDING");
  const expired = allDocs.filter((d) => d.status === "EXPIRED");
  const acknowledged = allDocs.filter((d) => d.status === "ACKNOWLEDGED");

  return {
    totalDocuments: allDocs.length,
    pending: pending.length,
    acknowledged: acknowledged.length,
    expired: expired.length,
    complianceRate: Math.round(
      ((acknowledged.length + expired.length) / allDocs.length) * 100
    ),
  };
}
