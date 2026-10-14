import { prisma } from "@/lib/prisma";
import { chatJson } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// AI Skills Path Generator — personalised learning path per freelancer.
// ---------------------------------------------------------------------------

export interface LearningStep {
  order: number;
  skillOrCert: string;
  action: string;
  estimatedHours: number;
  rateUpliftEurPerHour: number;
  rationale: string;
  priority: "hoog" | "midden" | "laag";
}

export interface SkillsPath {
  freelancerProfileId: string;
  generatedAt: string;
  currentAvgRateEur: number;
  projectedAvgRateEur: number;
  steps: LearningStep[];
  summary: string;
}

const SYSTEM_MSG = `Je bent een carriere-adviseur voor ZZP'ers en flexwerkers in Nederland.
Gegeven de huidige skills en marktdata, genereer een persoonlijk leerpad. Antwoord als JSON:
{"steps":[{"order":1,"skillOrCert":string,"action":string,"estimatedHours":number,"rateUpliftEurPerHour":number,"rationale":string,"priority":"hoog"|"midden"|"laag"}],"summary":string}
Max 5 stappen. Meest impactvolle eerst. Geen em-dashes in de tekst.`;

export async function generateSkillsPath(freelancerProfileId: string): Promise<SkillsPath> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: freelancerProfileId },
    select: {
      userId: true,
      skills: { select: { skill: { select: { name: true } }, rating: true } },
      assignments: {
        where: { shift: { is: {} } },
        select: { shift: { select: { hourlyRateCents: true } }, acceptedAt: true },
        take: 50,
        orderBy: { acceptedAt: "desc" },
      },
    },
  });

  if (!profile) throw new Error(`Freelancer ${freelancerProfileId} niet gevonden`);

  const certs = await prisma.certificate.findMany({
    where: { userId: profile.userId, status: "VALID" },
    select: { type: true },
  });

  const topSkillDemand = await prisma.skill.findMany({
    select: {
      name: true,
      shifts: { where: { status: "OPEN" }, select: { hourlyRateCents: true } },
    },
    take: 20,
  });

  const marketSignals = topSkillDemand
    .filter((s) => s.shifts.length > 0)
    .map((s) => ({
      skill: s.name,
      openShifts: s.shifts.length,
      avgRateEur: Math.round(s.shifts.reduce((a, sh) => a + sh.hourlyRateCents, 0) / s.shifts.length / 100),
    }))
    .sort((a, b) => b.openShifts - a.openShifts)
    .slice(0, 10);

  const currentSkills = profile.skills.map((s) => ({ skill: s.skill.name, rating: s.rating }));
  const currentCerts = certs.map((c) => c.type);
  const avgRate =
    profile.assignments.length > 0
      ? Math.round(profile.assignments.reduce((a, sh) => a + sh.shift.hourlyRateCents, 0) / profile.assignments.length / 100)
      : 14;

  const prompt = `Freelancer: skills=${JSON.stringify(currentSkills)}, certs=${JSON.stringify(currentCerts)}, gemiddeld uurtarief €${avgRate}
Marktdata: ${JSON.stringify(marketSignals)}`;

  let steps: LearningStep[] = [];
  let summary = "";

  try {
    const result = await chatJson<{ steps: LearningStep[]; summary: string }>({
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: prompt },
      ],
      maxTokens: 800,
      purpose: "skills-path",
    });
    steps = result.steps ?? [];
    summary = result.summary ?? "";
  } catch (err) {
    logger.error("skills-path: LLM fout", { err: String(err) });
    summary = "Leerpad tijdelijk niet beschikbaar.";
  }

  const projectedRate = steps.reduce((r, s) => r + (s.rateUpliftEurPerHour ?? 0), avgRate);

  return {
    freelancerProfileId,
    generatedAt: new Date().toISOString(),
    currentAvgRateEur: avgRate,
    projectedAvgRateEur: Math.round(projectedRate * 10) / 10,
    steps,
    summary,
  };
}
