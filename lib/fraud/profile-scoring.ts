import { prisma } from "@/lib/prisma";

export interface ProfileRiskScore {
  userId: string;
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  factors: string[];
  lastUpdated: Date;
}

export async function calculateProfileRisk(userId: string): Promise<ProfileRiskScore> {
  let score = 0;
  const factors: string[] = [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { freelancerProfile: true },
  });

  if (!user) throw new Error("User not found");

  // Check account age
  const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (accountAgeDays < 7) {
    score += 25;
    factors.push("New account (< 7 days)");
  }

  // Check profile completeness
  if (user.freelancerProfile) {
    const profileFields = [user.freelancerProfile.bio, user.freelancerProfile.photo].filter(Boolean).length;
    if (profileFields < 2) {
      score += 15;
      factors.push("Incomplete profile");
    }
  }

  // Check verification status
  if (!user.emailVerified) {
    score += 20;
    factors.push("Email not verified");
  }

  // Anomaly detection patterns
  const recentShifts = await prisma.shift.count({
    where: {
      assignments: { some: { workerId: userId } },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  if (recentShifts > 50) {
    score += 20;
    factors.push("Unusually high shift activity");
  }

  const level = score < 20 ? "LOW" : score < 40 ? "MEDIUM" : score < 70 ? "HIGH" : "CRITICAL";

  return { userId, score: Math.min(100, score), level, factors, lastUpdated: new Date() };
}

export async function scoreAllProfiles(): Promise<void> {
  const users = await prisma.user.findMany({ where: { role: "FREELANCER" } });
  for (const user of users) {
    const risk = await calculateProfileRisk(user.id);
    await prisma.fraudRiskProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, score: risk.score, level: risk.level, factors: risk.factors },
      update: { score: risk.score, level: risk.level, factors: risk.factors, updatedAt: new Date() },
    });
  }
}
