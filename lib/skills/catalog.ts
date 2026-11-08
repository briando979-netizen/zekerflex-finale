import { prisma } from "@/lib/prisma";
import { z } from "zod";

const skillSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  description: z.string().optional(),
  levels: z.array(z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"])),
  certifiable: z.boolean().default(false),
});

export async function createSkill(data: z.infer<typeof skillSchema>) {
  const validated = skillSchema.parse(data);
  return prisma.skill.create({
    data: {
      ...validated,
      levels: JSON.stringify(validated.levels),
    },
  });
}

export async function getSkills(category?: string) {
  return prisma.skill.findMany({
    where: category ? { category } : {},
    orderBy: { name: "asc" },
  });
}

export async function getUserSkills(userId: string) {
  return prisma.userSkill.findMany({
    where: { userId },
    include: { skill: true },
  });
}

export async function assignSkillToUser(userId: string, skillId: string, level: string) {
  return prisma.userSkill.upsert({
    where: { userId_skillId: { userId, skillId } },
    create: { userId, skillId, level },
    update: { level },
  });
}
