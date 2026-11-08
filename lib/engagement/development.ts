import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const createLearningPathSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  targetRole: z.string().optional(),
  duration: z.number().optional(),
  skills: z.array(z.string()).optional().default([]),
});

export const createMentorshipSchema = z.object({
  mentorId: z.string(),
  menteeId: z.string(),
  objectives: z.string().optional(),
  endDate: z.date().optional(),
});

export type CreateLearningPathInput = z.infer<typeof createLearningPathSchema>;
export type CreateMentorshipInput = z.infer<typeof createMentorshipSchema>;

/**
 * Create a learning path with courses.
 */
export async function createLearningPath(
  tenantId: string,
  input: CreateLearningPathInput,
  courses: Array<{
    title: string;
    provider?: string;
    url?: string;
    duration?: number;
    skillsGained?: string[];
  }>
) {
  const path = await prisma.learningPath.create({
    data: {
      tenantId,
      name: input.name,
      description: input.description,
      targetRole: input.targetRole,
      duration: input.duration,
      skills: input.skills,
      courses: {
        create: courses.map((c, idx) => ({
          title: c.title,
          provider: c.provider,
          url: c.url,
          duration: c.duration,
          skillsGained: c.skillsGained ?? [],
          order: idx,
        })),
      },
    },
    include: { courses: true },
  });

  return path;
}

/**
 * Enroll an employee in a learning path.
 */
export async function enrollInLearningPath(pathId: string, employeeId: string) {
  const enrollment = await prisma.learningEnrollment.upsert({
    where: { pathId_employeeId: { pathId, employeeId } },
    create: { pathId, employeeId, enrolledAt: new Date() },
    update: { enrolledAt: new Date() },
  });

  return enrollment;
}

/**
 * Update learning progress.
 */
export async function updateLearningProgress(
  enrollmentId: string,
  progress: number,
  completed?: boolean
) {
  const enrollment = await prisma.learningEnrollment.update({
    where: { id: enrollmentId },
    data: {
      progress,
      completedAt: completed ? new Date() : null,
    },
  });

  return enrollment;
}

/**
 * Get employee learning progress.
 */
export async function getEmployeeLearningProgress(employeeId: string) {
  const enrollments = await prisma.learningEnrollment.findMany({
    where: { employeeId },
    include: { path: { include: { courses: true } } },
  });

  return enrollments.map((e) => ({
    pathId: e.pathId,
    pathName: e.path.name,
    enrolledAt: e.enrolledAt,
    progress: e.progress,
    completedAt: e.completedAt,
    courseCount: e.path.courses.length,
    skills: e.path.skills,
  }));
}

/**
 * Create a mentorship match.
 */
export async function createMentorshipMatch(
  tenantId: string,
  input: CreateMentorshipInput
) {
  const match = await prisma.mentorshipMatch.create({
    data: {
      tenantId,
      mentorId: input.mentorId,
      menteeId: input.menteeId,
      objectives: input.objectives,
      endDate: input.endDate,
      status: "active",
    },
  });

  return match;
}

/**
 * Record a mentorship meeting.
 */
export async function recordMentorshipMeeting(matchId: string) {
  const match = await prisma.mentorshipMatch.update({
    where: { id: matchId },
    data: {
      meetingsCount: { increment: 1 },
      lastMeetingAt: new Date(),
    },
  });

  return match;
}

/**
 * Get mentorship matches for an employee.
 */
export async function getMentorshipMatches(employeeId: string) {
  const asMentor = await prisma.mentorshipMatch.findMany({
    where: { mentorId: employeeId, status: "active" },
  });

  const asmentee = await prisma.mentorshipMatch.findMany({
    where: { menteeId: employeeId, status: "active" },
  });

  return { asMentor, asmentee };
}

/**
 * Create or update succession plan for a role.
 */
export async function updateSuccessionPlan(
  tenantId: string,
  role: string,
  successors: Array<{
    employeeId: string;
    readinessLevel: "ready-now" | "ready-6-months" | "ready-1-year" | "developing";
    developmentNeeds?: string[];
  }>
) {
  const plan = await prisma.successionPlan.upsert({
    where: { tenantId_role: { tenantId, role } },
    create: {
      tenantId,
      role,
      successors: JSON.stringify(successors),
    },
    update: {
      successors: JSON.stringify(successors),
      updatedAt: new Date(),
    },
  });

  return plan;
}

/**
 * Get succession plans for a tenant.
 */
export async function getSuccessionPlans(tenantId: string) {
  const plans = await prisma.successionPlan.findMany({
    where: { tenantId },
  });

  return plans.map((p) => ({
    ...p,
    successors: typeof p.successors === "string" ? JSON.parse(p.successors) : p.successors,
  }));
}

/**
 * Get skills mapping for an employee.
 */
export async function getEmployeeSkillsMapping(employeeId: string) {
  const enrollments = await prisma.learningEnrollment.findMany({
    where: { employeeId, completedAt: { not: null } },
    include: { path: true },
  });

  const skills = new Set<string>();
  enrollments.forEach((e) => {
    e.path.skills.forEach((s) => skills.add(s));
  });

  const recognitions = await prisma.recognition.findMany({
    where: { recipientId: employeeId },
  });

  // Extract skill areas from recognition categories
  recognitions.forEach((r) => {
    skills.add(r.category);
  });

  return {
    employeeId,
    skills: Array.from(skills),
    completedPaths: enrollments.length,
    certificationsCount: enrollments.filter((e) => e.completedAt).length,
  };
}

/**
 * Recommend learning paths based on role and skills gap.
 */
export async function recommendLearningPaths(
  tenantId: string,
  employeeId: string,
  targetRole: string
) {
  const skillsMapping = await getEmployeeSkillsMapping(employeeId);

  const recommendations = await prisma.learningPath.findMany({
    where: {
      tenantId,
      targetRole,
    },
  });

  // Filter paths where employee doesn't have all required skills
  const relevantPaths = recommendations.filter((path) => {
    const hasAllSkills = path.skills.every((s) => skillsMapping.skills.includes(s));
    return !hasAllSkills;
  });

  return relevantPaths;
}

/**
 * Calculate readiness score for a promotion.
 */
export async function calculatePromotionReadiness(
  employeeId: string,
  targetRole: string
): Promise<{ score: number; readyForPromotion: boolean; gaps: string[] }> {
  let score = 50;
  const gaps: string[] = [];

  // Skills assessment
  const skills = await getEmployeeSkillsMapping(employeeId);
  if (skills.certificationsCount >= 3) {
    score += 15;
  } else {
    gaps.push("Incomplete certifications");
  }

  // Performance feedback
  const feedback = await prisma.feedbackSession.findMany({
    where: { recipientId: employeeId },
    orderBy: { completedAt: "desc" },
    take: 5,
  });

  const positiveRatio = feedback.filter((f) => f.sentiment === "positive").length / feedback.length;
  if (positiveRatio >= 0.8) {
    score += 20;
  } else {
    gaps.push("Mixed performance feedback");
  }

  // Recognition and influence
  const recognitionCount = await prisma.recognition.count({
    where: { recipientId: employeeId },
  });

  if (recognitionCount >= 5) {
    score += 15;
  } else {
    gaps.push("Limited peer recognition");
  }

  // Goal achievement
  const completedGoals = await prisma.employeeGoalProgress.findMany({
    where: { employeeId, status: "completed" },
  });

  if (completedGoals.length >= 3) {
    score += 15;
  } else {
    gaps.push("Not enough completed goals");
  }

  // Engagement level
  const engagement = await prisma.engagementScore.findFirst({
    where: { employeeId },
    orderBy: { lastUpdated: "desc" },
  });

  if (engagement && engagement.score >= 70) {
    score += 10;
  } else {
    gaps.push("Lower than expected engagement");
  }

  score = Math.min(score, 100);

  return {
    score,
    readyForPromotion: score >= 75,
    gaps,
  };
}
