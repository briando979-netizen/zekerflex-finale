import { CronParser } from "cron-parser";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { generateReportPdf } from "./export";

export const ScheduleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  cronExpression: z.string(),
  timezone: z.string().default("Europe/Amsterdam"),
  emailRecipients: z.array(z.string().email()),
  format: z.array(z.enum(["pdf", "xlsx", "csv", "html"])),
  subject: z.string().default("Scheduled Report"),
  includeChart: z.boolean().default(true),
});

export type ReportSchedule = z.infer<typeof ScheduleSchema>;

// Parse cron expression and get next execution time
export function getNextExecutionTime(
  cronExpression: string,
  timezone: string = "Europe/Amsterdam"
): Date {
  try {
    const interval = new CronParser(cronExpression, {
      tz: timezone,
    });
    return interval.next().toDate();
  } catch (err) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }
}

// Create scheduled report
export async function createScheduledReport(
  tenantId: string,
  userId: string,
  reportId: string,
  schedule: ReportSchedule
) {
  const validated = ScheduleSchema.parse(schedule);

  // Validate cron expression
  const nextExecution = getNextExecutionTime(
    validated.cronExpression,
    validated.timezone
  );

  try {
    const scheduled = await prisma.reportSchedule?.create?.({
      data: {
        tenantId,
        reportId,
        createdByUserId: userId,
        name: validated.name,
        description: validated.description,
        cronExpression: validated.cronExpression,
        timezone: validated.timezone,
        emailRecipients: validated.emailRecipients,
        format: validated.format,
        subject: validated.subject,
        includeChart: validated.includeChart,
        nextExecutedAt: nextExecution,
        isActive: true,
      },
    });

    return scheduled;
  } catch (err) {
    console.error("Failed to create scheduled report:", err);
    throw err;
  }
}

// Execute scheduled report
export async function executeScheduledReport(scheduleId: string) {
  try {
    const schedule = await prisma.reportSchedule?.findUnique?.({
      where: { id: scheduleId },
      include: { report: true },
    });

    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    if (!schedule.isActive) {
      return { success: false, message: "Schedule is inactive" };
    }

    // Generate report in requested formats
    const reportPath = await generateReportPdf(schedule.reportId);

    // Send email to recipients
    if (schedule.emailRecipients.length > 0) {
      await sendMail({
        to: schedule.emailRecipients,
        subject: schedule.subject || "Scheduled Report",
        html: `
          <h2>${schedule.name}</h2>
          <p>${schedule.description || ""}</p>
          <p>Report generated at ${new Date().toLocaleString()}</p>
        `,
        attachments: schedule.format.includes("pdf")
          ? [
              {
                filename: `report-${new Date().toISOString().split("T")[0]}.pdf`,
                path: reportPath,
                contentType: "application/pdf",
              },
            ]
          : [],
      });
    }

    // Update schedule execution tracking
    const nextExecution = getNextExecutionTime(
      schedule.cronExpression,
      schedule.timezone
    );

    await prisma.reportSchedule?.update?.({
      where: { id: scheduleId },
      data: {
        lastExecutedAt: new Date(),
        nextExecutedAt: nextExecution,
        executionCount: { increment: 1 },
        lastErrorAt: null,
        lastErrorMsg: null,
      },
    });

    return { success: true, message: "Report executed successfully" };
  } catch (err) {
    console.error("Failed to execute scheduled report:", err);

    // Update error tracking
    await prisma.reportSchedule?.update?.({
      where: { id: scheduleId },
      data: {
        lastErrorAt: new Date(),
        lastErrorMsg: String(err),
      },
    });

    return { success: false, message: String(err) };
  }
}

// Get overdue schedules (should have executed but haven't)
export async function getOverdueSchedules() {
  try {
    const schedules = await prisma.reportSchedule?.findMany?.({
      where: {
        isActive: true,
        nextExecutedAt: {
          lt: new Date(),
        },
      },
      take: 100,
    });

    return schedules || [];
  } catch (err) {
    console.error("Failed to get overdue schedules:", err);
    return [];
  }
}

// Disable schedule
export async function disableSchedule(scheduleId: string) {
  try {
    await prisma.reportSchedule?.update?.({
      where: { id: scheduleId },
      data: { isActive: false },
    });
    return { success: true };
  } catch (err) {
    console.error("Failed to disable schedule:", err);
    throw err;
  }
}

// Get schedule details
export async function getScheduleDetails(scheduleId: string) {
  try {
    const schedule = await prisma.reportSchedule?.findUnique?.({
      where: { id: scheduleId },
      include: { report: true, createdByUser: true },
    });
    return schedule;
  } catch (err) {
    console.error("Failed to get schedule details:", err);
    throw err;
  }
}
