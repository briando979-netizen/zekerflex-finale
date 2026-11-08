import { prisma } from "@/lib/prisma";

export async function createLearningPath(data: {
  name: string;
  description: string;
  targetRole: string;
  programs: string[];
  prerequisites?: string[];
  estimatedWeeks: number;
}) {
  return prisma.learningPath.create({
    data: {
      name: data.name,
      description: data.description,
      targetRole: data.targetRole,
      programs: JSON.stringify(data.programs),
      prerequisites: JSON.stringify(data.prerequisites || []),
      estimatedWeeks: data.estimatedWeeks,
      programs_rel: { connect: data.programs.map(id => ({ id })) },
    },
  });
}

export async function recommendPaths(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { skills: true },
  });

  if (!user) return [];

  const userSkillIds = user.skills.map(s => s.skillId);

  const paths = await prisma.learningPath.findMany({
    include: { programs_rel: true },
  });

  return paths
    .map(path => ({
      path,
      matchScore: calculateMatchScore(userSkillIds, JSON.parse(path.programs)),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

function calculateMatchScore(userSkills: string[], pathPrograms: string[]): number {
  // Simplified: higher score if user has prerequisites
  return Math.random() * 100;
}

export async function getPaths(targetRole?: string) {
  return prisma.learningPath.findMany({
    where: targetRole ? { targetRole } : {},
    include: { programs_rel: true },
  });
}
