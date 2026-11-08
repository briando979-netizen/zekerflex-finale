import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const employeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  department: z.string(),
  position: z.string(),
  hireDate: z.string().datetime(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),
  manager: z.string().optional(),
  emergencyContact: z.object({
    name: z.string(),
    phone: z.string(),
    relation: z.string(),
  }).optional(),
});

type EmployeeInput = z.infer<typeof employeeSchema>;

export async function createEmployee(tenantId: string, data: EmployeeInput) {
  const validated = employeeSchema.parse(data);
  return await prisma.employee.create({
    data: {
      ...validated,
      tenantId,
      hireDate: new Date(validated.hireDate),
      emergencyContact: validated.emergencyContact ? JSON.stringify(validated.emergencyContact) : null,
    },
  });
}

export async function getEmployees(tenantId: string) {
  return await prisma.employee.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getEmployee(tenantId: string, employeeId: string) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!emp || emp.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }
  return emp;
}

export async function updateEmployee(tenantId: string, employeeId: string, data: Partial<EmployeeInput>) {
  const emp = await getEmployee(tenantId, employeeId);
  const validated = employeeSchema.partial().parse(data);
  return await prisma.employee.update({
    where: { id: employeeId },
    data: {
      ...validated,
      hireDate: validated.hireDate ? new Date(validated.hireDate) : undefined,
      emergencyContact: validated.emergencyContact ? JSON.stringify(validated.emergencyContact) : undefined,
    },
  });
}

export async function deleteEmployee(tenantId: string, employeeId: string) {
  const emp = await getEmployee(tenantId, employeeId);
  return await prisma.employee.delete({ where: { id: employeeId } });
}

export async function getHeadcount(tenantId: string) {
  return await prisma.employee.count({ where: { tenantId, status: "ACTIVE" } });
}

export async function getEmployeesByDepartment(tenantId: string, department: string) {
  return await prisma.employee.findMany({
    where: { tenantId, department, status: "ACTIVE" },
    orderBy: { lastName: "asc" },
  });
}
