import { prisma } from "@/lib/prisma";

export async function getCompetencyMatrix(roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
  });

  if (!role) return null;

  const requiredSkills = JSON.parse(role.requiredSkills || "[]");
  const skills = await prisma.skill.findMany({
    where: { id: { in: requiredSkills } },
  });

  return { role, skills };
}

export async function getUserCompetencyGaps(userId: string, roleId: string) {
  const [user, matrix] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { skills: true } }),
    getCompetencyMatrix(roleId),
  ]);

  if (!user || !matrix) return null;

  const userSkillIds = user.skills.map(s => s.skillId);
  const gaps = matrix.skills.filter(s => !userSkillIds.includes(s.id));

  return {
    user,
    role: matrix.role,
    totalRequired: matrix.skills.length,
    acquired: matrix.skills.length - gaps.length,
    gaps,
  };
}

export async function createDevelopmentPlan(userId: string, roleId: string) {
  const gaps = await getUserCompetencyGaps(userId, roleId);
  if (!gaps) return null;

  const recommendations = gaps.gaps.map(skill => ({
    skillId: skill.id,
    currentLevel: "BEGINNER",
    targetLevel: "INTERMEDIATE",
    priority: "HIGH",
  }));

  return prisma.developmentPlan.create({
    data: {
      userId,
      roleId,
      targetRole: gaps.role.name,
      recommendations: JSON.stringify(recommendations),
      createdAt: new Date(),
      dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    },
  });
}

export async function trackProgress(userId: string, planId: string) {
  const plan = await prisma.developmentPlan.findUnique({
    where: { id: planId },
  });

  if (!plan) return null;

  const recommendations = JSON.parse(plan.recommendations);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { skills: true },
  });

  const progress = recommendations.map((rec: any) => {
    const userSkill = user?.skills.find(s => s.skillId === rec.skillId);
    return {
      skill: rec.skillId,
      target: rec.targetLevel,
      current: userSkill?.level || "NONE",
      complete: userSkill?.level === rec.targetLevel,
    };
  });

  return { plan, progress, completionPercent: (progress.filter((p: any) => p.complete).length / progress.length) * 100 };
}
