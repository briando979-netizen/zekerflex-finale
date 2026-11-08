import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

interface PayrollCalculation {
  employeeId: string;
  baseSalary: number; // cents
  deductions: {
    incomeTax: number;
    socialSecurity: number;
    healthInsurance: number;
    otherDeductions: number;
  };
  grossSalary: number;
  netSalary: number;
  currency: string;
}

export async function calculatePayroll(
  tenantId: string,
  employeeId: string,
  period: { startDate: Date; endDate: Date }
): Promise<PayrollCalculation> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee || employee.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }

  const salary = await prisma.salarySetup.findUnique({
    where: { employeeId },
  });

  if (!salary) {
    throw AppError.validation("No salary setup for employee");
  }

  const grossSalary = salary.baseSalary;
  const taxRate = salary.taxRate || 0.20; // Default 20%
  const socialSecurityRate = salary.socialSecurityRate || 0.12;

  const incomeTax = Math.round(grossSalary * taxRate);
  const socialSecurity = Math.round(grossSalary * socialSecurityRate);
  const healthInsurance = salary.healthInsuranceCents || 0;
  const otherDeductions = salary.otherDeductionsCents || 0;

  const totalDeductions = incomeTax + socialSecurity + healthInsurance + otherDeductions;
  const netSalary = grossSalary - totalDeductions;

  return {
    employeeId,
    baseSalary: grossSalary,
    deductions: {
      incomeTax,
      socialSecurity,
      healthInsurance,
      otherDeductions,
    },
    grossSalary,
    netSalary,
    currency: salary.currency || "EUR",
  };
}

export async function generateSalarySlip(
  tenantId: string,
  employeeId: string,
  period: { startDate: Date; endDate: Date }
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee || employee.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }

  const calculation = await calculatePayroll(tenantId, employeeId, period);

  const slip = await prisma.salarySlip.create({
    data: {
      employeeId,
      tenantId,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      grossSalary: calculation.grossSalary,
      netSalary: calculation.netSalary,
      deductions: JSON.stringify(calculation.deductions),
      currency: calculation.currency,
      generatedAt: new Date(),
    },
  });

  return slip;
}

export async function runPayroll(
  tenantId: string,
  period: { startDate: Date; endDate: Date }
) {
  const employees = await prisma.employee.findMany({
    where: { tenantId, status: "ACTIVE" },
  });

  const slips = await Promise.all(
    employees.map((emp) => generateSalarySlip(tenantId, emp.id, period))
  );

  return {
    period,
    totalEmployees: employees.length,
    slips,
    generatedAt: new Date(),
  };
}
