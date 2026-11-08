import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function createReview(
  tenantId: string,
  employeeId: string,
  data: {
    reviewerIds: string[];
    rating: number; // 1-5
    comments: string;
    goals: string[];
    developmentAreas: string[];
    reviewDate: Date;
  }
) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp || emp.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }

  return await prisma.performanceReview.create({
    data: {
      employeeId,
      tenantId,
      rating: data.rating,
      comments: data.comments,
      goals: JSON.stringify(data.goals),
      developmentAreas: JSON.stringify(data.developmentAreas),
      reviewDate: data.reviewDate,
      reviewers: JSON.stringify(data.reviewerIds),
    },
  });
}

export async function getEmployeeReviews(tenantId: string, employeeId: string) {
  return await prisma.performanceReview.findMany({
    where: { tenantId, employeeId },
    orderBy: { reviewDate: "desc" },
  });
}

export async function setGoals(
  tenantId: string,
  employeeId: string,
  goals: {
    title: string;
    description: string;
    dueDate: Date;
    priority: "LOW" | "MEDIUM" | "HIGH";
  }[]
) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp || emp.tenantId !== tenantId) {
    throw AppError.notFound("Employee not found");
  }

  return await Promise.all(
    goals.map((goal) =>
      prisma.employeeGoal.create({
        data: {
          employeeId,
          tenantId,
          title: goal.title,
          description: goal.description,
          dueDate: goal.dueDate,
          priority: goal.priority,
          status: "ACTIVE",
        },
      })
    )
  );
}

export async function trackProgress(
  tenantId: string,
  employeeId: string,
  goalId: string,
  progressUpdate: { percentage: number; notes: string }
) {
  const goal = await prisma.employeeGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.tenantId !== tenantId) {
    throw AppError.notFound("Goal not found");
  }

  return await prisma.employeeGoal.update({
    where: { id: goalId },
    data: {
      progress: progressUpdate.percentage,
      lastUpdated: new Date(),
      notes: progressUpdate.notes,
    },
  });
}

export async function get360Feedback(tenantId: string, employeeId: string) {
  return await prisma.feedback.findMany({
    where: { tenantId, employeeId },
    orderBy: { createdAt: "desc" },
  });
}
