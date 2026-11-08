import { z } from "zod";
import type { TrainingStatus, CertificationStatus, QualityStandardFramework } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// Schemas
export const ComplianceTrainingSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(1000).optional(),
  category: z.enum(["security", "privacy", "quality", "safety"]),
  framework: z.enum([
    "ISO_9001",
    "ISO_14001",
    "ISO_27001",
    "ISO_45001",
    "SOC2",
    "GDPR",
    "HIPAA",
    "CUSTOM",
  ]).optional(),
  contentUrl: z.string().url().optional(),
  duration: z.number().int().min(1).optional(),
});

export const TrainingEnrollmentSchema = z.object({
  courseId: z.string().cuid(),
  userId: z.string(),
  dueDate: z.date().optional(),
});

export const CertificationSchema = z.object({
  userId: z.string(),
  certificationName: z.string(),
  issuer: z.string(),
  certificateNumber: z.string().optional(),
  issuedDate: z.date(),
  expiryDate: z.date().optional(),
  documentUrl: z.string().url().optional(),
  verificationUrl: z.string().url().optional(),
});

export type ComplianceTrainingInput = z.infer<typeof ComplianceTrainingSchema>;
export type TrainingEnrollmentInput = z.infer<typeof TrainingEnrollmentSchema>;
export type CertificationInput = z.infer<typeof CertificationSchema>;

/**
 * Create a compliance training course
 */
export async function createTrainingCourse(
  input: ComplianceTrainingInput
): Promise<{
  id: string;
  title: string;
  category: string;
}> {
  try {
    const validated = ComplianceTrainingSchema.parse(input);

    const course = await prisma.complianceTraining.create({
      data: {
        title: validated.title,
        description: validated.description || "",
        category: validated.category,
        framework: validated.framework,
        contentUrl: validated.contentUrl,
        duration: validated.duration,
      },
      select: { id: true, title: true, category: true },
    });

    logger.info("Training course created", {
      courseId: course.id,
      category: validated.category,
    });

    return course;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid training course input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Enroll user in training
 */
export async function enrollUserInTraining(
  input: TrainingEnrollmentInput
): Promise<{
  id: string;
  status: TrainingStatus;
  dueDate: Date | null;
}> {
  try {
    const validated = TrainingEnrollmentSchema.parse(input);

    // Check if already enrolled
    const existing = await prisma.trainingEnrollment.findUnique({
      where: { courseId_userId: { courseId: validated.courseId, userId: validated.userId } },
    });

    if (existing) {
      throw new AppError("conflict", "User is already enrolled in this course");
    }

    const enrollment = await prisma.trainingEnrollment.create({
      data: {
        courseId: validated.courseId,
        userId: validated.userId,
        dueDate: validated.dueDate,
        status: "ASSIGNED",
      },
      select: { id: true, status: true, dueDate: true },
    });

    logger.info("User enrolled in training", {
      enrollmentId: enrollment.id,
      userId: validated.userId,
      courseId: validated.courseId,
    });

    return enrollment;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid enrollment input", { details: err.errors });
    }
    if (err instanceof AppError) throw err;
    throw new AppError("internal", "Failed to enroll user");
  }
}

/**
 * Mark training as in progress
 */
export async function startTraining(enrollmentId: string): Promise<{
  id: string;
  status: TrainingStatus;
  startedAt: Date;
}> {
  try {
    const updated = await prisma.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
      select: { id: true, status: true, startedAt: true },
    });

    logger.info("Training started", { enrollmentId });
    return updated;
  } catch (err) {
    if ((err as any).code === "P2025") {
      throw new AppError("not_found", "Enrollment not found");
    }
    throw new AppError("internal", "Failed to start training");
  }
}

/**
 * Complete training
 */
export async function completeTraining(
  enrollmentId: string,
  score?: number
): Promise<{
  id: string;
  status: TrainingStatus;
  completedAt: Date;
}> {
  try {
    if (score !== undefined && (score < 0 || score > 100)) {
      throw new AppError("validation", "Score must be between 0 and 100");
    }

    const updated = await prisma.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        score,
      },
      select: { id: true, status: true, completedAt: true },
    });

    logger.info("Training completed", { enrollmentId, score });
    return updated;
  } catch (err) {
    if ((err as any).code === "P2025") {
      throw new AppError("not_found", "Enrollment not found");
    }
    if (err instanceof AppError) throw err;
    throw new AppError("internal", "Failed to complete training");
  }
}

/**
 * Get training status for user
 */
export async function getUserTrainingStatus(userId: string) {
  try {
    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { userId },
      include: { course: true },
      orderBy: { dueDate: "asc" },
    });

    const stats = {
      total: enrollments.length,
      completed: enrollments.filter((e) => e.status === "COMPLETED").length,
      inProgress: enrollments.filter((e) => e.status === "IN_PROGRESS").length,
      assigned: enrollments.filter((e) => e.status === "ASSIGNED").length,
      overdue: enrollments.filter((e) => e.status === "OVERDUE").length,
      expired: enrollments.filter((e) => e.status === "EXPIRED").length,
    };

    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    // Find overdue trainings
    const overdue = enrollments.filter(
      (e) => e.dueDate && e.dueDate < new Date() && e.status !== "COMPLETED" && e.status !== "EXPIRED"
    );

    return {
      stats,
      completionRate,
      overdue: overdue.map((e) => ({ id: e.id, title: e.course.title, dueDate: e.dueDate })),
      enrollments: enrollments.map((e) => ({
        id: e.id,
        title: e.course.title,
        category: e.course.category,
        status: e.status,
        dueDate: e.dueDate,
        completedAt: e.completedAt,
        score: e.score,
      })),
    };
  } catch (err) {
    logger.error("Failed to get training status", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve training status");
  }
}

/**
 * Register a certification
 */
export async function registerCertification(
  input: CertificationInput
): Promise<{
  id: string;
  certificationName: string;
  status: CertificationStatus;
  expiryDate: Date | null;
}> {
  try {
    const validated = CertificationSchema.parse(input);

    const certification = await prisma.certification.create({
      data: {
        userId: validated.userId,
        certificationName: validated.certificationName,
        issuer: validated.issuer,
        certificateNumber: validated.certificateNumber,
        issuedDate: validated.issuedDate,
        expiryDate: validated.expiryDate,
        documentUrl: validated.documentUrl,
        verificationUrl: validated.verificationUrl,
        status: validated.expiryDate && validated.expiryDate < new Date() ? "EXPIRED" : "ACTIVE",
      },
      select: {
        id: true,
        certificationName: true,
        status: true,
        expiryDate: true,
      },
    });

    logger.info("Certification registered", {
      certificationId: certification.id,
      userId: validated.userId,
    });

    return certification;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid certification input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Get user certifications
 */
export async function getUserCertifications(userId: string) {
  try {
    const certifications = await prisma.certification.findMany({
      where: { userId },
      orderBy: { expiryDate: "asc" },
      select: {
        id: true,
        certificationName: true,
        issuer: true,
        issuedDate: true,
        expiryDate: true,
        status: true,
        documentUrl: true,
        verificationUrl: true,
      },
    });

    const active = certifications.filter((c) => c.status === "ACTIVE");
    const expiringSoon = active.filter((c) => {
      if (!c.expiryDate) return false;
      const daysUntilExpiry = Math.ceil(
        (c.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    });
    const expired = certifications.filter((c) => c.status === "EXPIRED");

    return {
      total: certifications.length,
      active: active.length,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
      certifications,
      alerts: {
        expiringSoon: expiringSoon.map((c) => ({
          id: c.id,
          name: c.certificationName,
          expiryDate: c.expiryDate,
        })),
        expired: expired.map((c) => ({
          id: c.id,
          name: c.certificationName,
        })),
      },
    };
  } catch (err) {
    logger.error("Failed to get certifications", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve certifications");
  }
}

/**
 * Get training compliance report
 */
export async function getTrainingComplianceReport() {
  try {
    const [allEnrollments, allUsers] = await Promise.all([
      prisma.trainingEnrollment.findMany({
        select: { userId: true, status: true },
      }),
      prisma.user.count(),
    ]);

    const userTrainingMap = new Map<string, TrainingStatus[]>();
    for (const enrollment of allEnrollments) {
      if (!userTrainingMap.has(enrollment.userId)) {
        userTrainingMap.set(enrollment.userId, []);
      }
      userTrainingMap.get(enrollment.userId)!.push(enrollment.status);
    }

    const stats = {
      totalUsers: allUsers,
      trainingAssigned: userTrainingMap.size,
      completionRate: allEnrollments.length > 0
        ? Math.round(
            (allEnrollments.filter((e) => e.status === "COMPLETED").length / allEnrollments.length) * 100
          )
        : 0,
      byStatus: {
        assigned: allEnrollments.filter((e) => e.status === "ASSIGNED").length,
        inProgress: allEnrollments.filter((e) => e.status === "IN_PROGRESS").length,
        completed: allEnrollments.filter((e) => e.status === "COMPLETED").length,
        overdue: allEnrollments.filter((e) => e.status === "OVERDUE").length,
        expired: allEnrollments.filter((e) => e.status === "EXPIRED").length,
      },
    };

    const courses = await prisma.complianceTraining.findMany({
      include: {
        enrollments: {
          select: { status: true },
        },
      },
    });

    const courseStats = courses.map((course) => ({
      id: course.id,
      title: course.title,
      category: course.category,
      enrolled: course.enrollments.length,
      completed: course.enrollments.filter((e) => e.status === "COMPLETED").length,
    }));

    return { stats, courseStats };
  } catch (err) {
    logger.error("Failed to get training compliance report", { error: (err as Error).message });
    throw new AppError("internal", "Failed to generate training report");
  }
}

/**
 * Get expiring certifications
 */
export async function getExpiringCertifications(daysUntilExpiry = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysUntilExpiry);

    const expiringSoon = await prisma.certification.findMany({
      where: {
        expiryDate: {
          gte: new Date(),
          lte: cutoffDate,
        },
        status: "ACTIVE",
      },
      orderBy: { expiryDate: "asc" },
      select: {
        id: true,
        userId: true,
        certificationName: true,
        issuer: true,
        expiryDate: true,
      },
    });

    return {
      total: expiringSoon.length,
      daysWindow: daysUntilExpiry,
      certifications: expiringSoon.map((c) => ({
        ...c,
        daysUntilExpiry: Math.ceil(
          (c.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        ),
      })),
    };
  } catch (err) {
    logger.error("Failed to get expiring certifications", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve expiring certifications");
  }
}

/**
 * Bulk enroll users in training
 */
export async function bulkEnrollUsers(
  courseId: string,
  userIds: string[],
  dueDate?: Date
): Promise<{
  success: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  try {
    const errors: Array<{ userId: string; error: string }> = [];
    let success = 0;

    for (const userId of userIds) {
      try {
        await enrollUserInTraining({
          courseId,
          userId,
          dueDate,
        });
        success++;
      } catch (err) {
        errors.push({
          userId,
          error: (err as Error).message,
        });
      }
    }

    logger.info("Bulk enrollment completed", { courseId, success, failed: errors.length });

    return { success, failed: errors.length, errors };
  } catch (err) {
    logger.error("Failed to perform bulk enrollment", { error: (err as Error).message });
    throw new AppError("internal", "Failed to perform bulk enrollment");
  }
}
