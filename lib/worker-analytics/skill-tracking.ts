import { prisma } from '@/lib/prisma';

export interface SkillProgress {
  workerId: string;
  skillName: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';
  certifications: string[];
  yearsExperience: number;
  endorsements: number;
}

export async function getWorkerSkills(workerId: string): Promise<SkillProgress[]> {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId: workerId },
    include: { skills: true },
  });

  if (!freelancer) return [];

  return freelancer.skills.map(s => ({
    workerId,
    skillName: s.naam,
    level: s.niveau as 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT',
    certifications: s.gecertificeerd ? [s.vervaltDatum?.toString() || 'Active'] : [],
    yearsExperience: calculateYearsExperience(s.createdAt),
    endorsements: 0,
  }));
}

function calculateYearsExperience(startDate: Date): number {
  const now = new Date();
  return Math.floor((now.getTime() - startDate.getTime()) / (365 * 24 * 60 * 60 * 1000));
}

export async function addSkillToWorker(workerId: string, skillName: string, level: string): Promise<void> {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId: workerId },
  });

  if (freelancer) {
    await prisma.freelancerSkill.create({
      data: {
        freelancerId: freelancer.id,
        naam: skillName,
        niveau: level as any,
        gecertificeerd: false,
      },
    });
  }
}
