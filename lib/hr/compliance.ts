import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function trackCompliance(
  tenantId: string,
  employeeId: string,
  data: {
    documentType: string; // "CONTRACT", "NDA", "POLICY", "TRAINING", "CERT"
    documentUrl: string;
    expiryDate?: Date;
    status: "PENDING" | "ACKNOWLEDGED" | "EXPIRED";
  }
) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp || emp.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }

  return await prisma.complianceDocument.create({
    data: {
      employeeId,
      tenantId,
      documentType: data.documentType,
      documentUrl: data.documentUrl,
      expiryDate: data.expiryDate,
      status: data.status,
      acknowledgedAt: data.status === "ACKNOWLEDGED" ? new Date() : null,
    },
  });
}

export async function getComplianceStatus(tenantId: string, employeeId: string) {
  const docs = await prisma.complianceDocument.findMany({
    where: { tenantId, employeeId },
  });

  const overdue = docs.filter(
    (d) => d.expiryDate && d.expiryDate < new Date() && d.status !== "EXPIRED"
  );

  return { documents: docs, overdueCount: overdue.length };
}

export async function recordTraining(
  tenantId: string,
  employeeId: string,
  data: {
    courseName: string;
    provider: string;
    completionDate: Date;
    certificate: string;
  }
) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp || emp.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }

  return await prisma.training.create({
    data: {
      employeeId,
      tenantId,
      courseName: data.courseName,
      provider: data.provider,
      completionDate: data.completionDate,
      certificate: data.certificate,
    },
  });
}

export async function recordBackgroundCheck(
  tenantId: string,
  employeeId: string,
  data: {
    checkType: string;
    status: "PENDING" | "APPROVED" | "FLAGGED";
    notes: string;
  }
) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp || emp.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }

  return await prisma.backgroundCheck.create({
    data: {
      employeeId,
      tenantId,
      checkType: data.checkType,
      status: data.status,
      notes: data.notes,
      checkedAt: new Date(),
    },
  });
}

export async function getComplianceAuditTrail(tenantId: string) {
  return await prisma.auditLog.findMany({
    where: {
      tenantId,
      category: "COMPLIANCE",
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}
