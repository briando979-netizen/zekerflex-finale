import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const attendanceSchema = z.object({
  employeeId: z.string(),
  checkInTime: z.string().datetime(),
  checkOutTime: z.string().datetime().optional(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE"]),
  notes: z.string().optional(),
});

type AttendanceInput = z.infer<typeof attendanceSchema>;

export async function checkIn(tenantId: string, employeeId: string) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp || emp.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }

  return await prisma.attendance.create({
    data: {
      employeeId,
      tenantId,
      checkInTime: new Date(),
      date: new Date().toISOString().split("T")[0],
      status: "PRESENT",
    },
  });
}

export async function checkOut(tenantId: string, employeeId: string) {
  const today = new Date().toISOString().split("T")[0];
  const record = await prisma.attendance.findFirst({
    where: { employeeId, tenantId, date: today },
  });

  if (!record) {
    throw AppError.notFound("No check-in record found");
  }

  return await prisma.attendance.update({
    where: { id: record.id },
    data: { checkOutTime: new Date() },
  });
}

export async function recordAttendance(tenantId: string, data: AttendanceInput) {
  const validated = attendanceSchema.parse(data);
  const emp = await prisma.employee.findUnique({
    where: { id: validated.employeeId },
  });

  if (!emp || emp.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }

  return await prisma.attendance.create({
    data: {
      ...validated,
      tenantId,
      checkInTime: new Date(validated.checkInTime),
      checkOutTime: validated.checkOutTime ? new Date(validated.checkOutTime) : null,
      date: new Date(validated.checkInTime).toISOString().split("T")[0],
    },
  });
}

export async function getAttendanceReport(
  tenantId: string,
  startDate: Date,
  endDate: Date
) {
  const records = await prisma.attendance.findMany({
    where: {
      tenantId,
      checkInTime: { gte: startDate, lte: endDate },
    },
    include: { employee: true },
    orderBy: { checkInTime: "desc" },
  });

  const summary: Record<string, Record<string, number>> = {};

  for (const record of records) {
    if (!summary[record.employeeId]) {
      summary[record.employeeId] = {
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        HALF_DAY: 0,
        LEAVE: 0,
      };
    }
    summary[record.employeeId][record.status]++;
  }

  return { records, summary };
}
