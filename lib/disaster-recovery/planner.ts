import { prisma } from "@/lib/prisma";

export interface DRPlan {
  id: string;
  name: string;
  description: string;
  rto: number; // minutes
  rpo: number; // minutes
  objectives: string[];
  procedures: DRProcedure[];
  contacts: DRContact[];
  lastReviewedAt: Date;
  reviewCycle: number; // days
}

export interface DRProcedure {
  id: string;
  title: string;
  steps: string[];
  responsibleTeam: string;
  estimatedTime: number; // minutes
  criticalityLevel: "critical" | "high" | "medium" | "low";
  dependsOn?: string[]; // procedure IDs
}

export interface DRContact {
  name: string;
  role: string;
  email: string;
  phone: string;
  availability: "24x7" | "business_hours" | "on_call";
}

export interface DRDrill {
  id: string;
  planId: string;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: "scheduled" | "in_progress" | "completed" | "failed";
  proceduresExecuted: string[];
  issuesFound: string[];
  successRate: number; // percentage
  feedback: string;
}

export const DRPlanner = {
  async createPlan(plan: Omit<DRPlan, "id" | "lastReviewedAt">): Promise<DRPlan> {
    const drPlan: DRPlan = {
      ...plan,
      id: `plan-${Date.now()}`,
      lastReviewedAt: new Date(),
    };

    await prisma.kv.create({
      data: {
        key: `dr:plan:${drPlan.id}`,
        value: JSON.stringify(drPlan),
      },
    });

    return drPlan;
  },

  async getPlan(id: string): Promise<DRPlan | null> {
    const stored = await prisma.kv.findUnique({
      where: { key: `dr:plan:${id}` },
    });
    return stored ? JSON.parse(stored.value) : null;
  },

  async updatePlan(id: string, updates: Partial<DRPlan>): Promise<DRPlan> {
    const plan = await this.getPlan(id);
    if (!plan) throw new Error(`Plan ${id} not found`);

    const updated = {
      ...plan,
      ...updates,
      lastReviewedAt: new Date(),
    };

    await prisma.kv.update({
      where: { key: `dr:plan:${id}` },
      data: { value: JSON.stringify(updated) },
    });

    return updated;
  },

  async listPlans(): Promise<DRPlan[]> {
    const keys = await prisma.kv.findMany({
      where: { key: { startsWith: "dr:plan:" } },
    });

    return keys.map((k) => JSON.parse(k.value));
  },

  async createDrill(planId: string): Promise<DRDrill> {
    const drill: DRDrill = {
      id: `drill-${Date.now()}`,
      planId,
      scheduledAt: new Date(),
      status: "scheduled",
      proceduresExecuted: [],
      issuesFound: [],
      successRate: 0,
      feedback: "",
    };

    await prisma.kv.create({
      data: {
        key: `dr:drill:${drill.id}`,
        value: JSON.stringify(drill),
      },
    });

    return drill;
  },

  async getDrill(id: string): Promise<DRDrill | null> {
    const stored = await prisma.kv.findUnique({
      where: { key: `dr:drill:${id}` },
    });
    return stored ? JSON.parse(stored.value) : null;
  },

  async updateDrill(id: string, updates: Partial<DRDrill>): Promise<DRDrill> {
    const drill = await this.getDrill(id);
    if (!drill) throw new Error(`Drill ${id} not found`);

    const updated = {
      ...drill,
      ...updates,
    };

    await prisma.kv.update({
      where: { key: `dr:drill:${id}` },
      data: { value: JSON.stringify(updated) },
    });

    return updated;
  },

  async listDrills(planId: string): Promise<DRDrill[]> {
    const keys = await prisma.kv.findMany({
      where: { key: { startsWith: "dr:drill:" } },
    });

    const drills = keys.map((k) => JSON.parse(k.value));
    return drills.filter((d) => d.planId === planId);
  },

  async generateDRDocumentation(planId: string): Promise<string> {
    const plan = await this.getPlan(planId);
    if (!plan) throw new Error("Plan not found");

    const doc = `
# Disaster Recovery Plan: ${plan.name}

## Overview
${plan.description}

## Recovery Objectives
- RTO (Recovery Time Objective): ${plan.rto} minutes
- RPO (Recovery Point Objective): ${plan.rpo} minutes

## Key Objectives
${plan.objectives.map((o) => `- ${o}`).join("\n")}

## Recovery Procedures

${plan.procedures
  .map(
    (p) => `
### ${p.title}
- **Responsible Team**: ${p.responsibleTeam}
- **Estimated Time**: ${p.estimatedTime} minutes
- **Criticality**: ${p.criticalityLevel}

Steps:
${p.steps.map((s) => `${p.steps.indexOf(s) + 1}. ${s}`).join("\n")}
`
  )
  .join("\n")}

## Contacts
${plan.contacts
  .map(
    (c) => `
- ${c.name} (${c.role})
  - Email: ${c.email}
  - Phone: ${c.phone}
  - Availability: ${c.availability}
`
  )
  .join("\n")}

Last Reviewed: ${plan.lastReviewedAt.toISOString()}
`;

    return doc;
  },

  async getDRStats() {
    const plans = await this.listPlans();
    const allDrills = await Promise.all(
      plans.map((p) => this.listDrills(p.id))
    );

    const drills = allDrills.flat();

    return {
      totalPlans: plans.length,
      averageRTO: plans.length ? plans.reduce((sum, p) => sum + p.rto, 0) / plans.length : 0,
      averageRPO: plans.length ? plans.reduce((sum, p) => sum + p.rpo, 0) / plans.length : 0,
      totalDrills: drills.length,
      completedDrills: drills.filter((d) => d.status === "completed").length,
      failedDrills: drills.filter((d) => d.status === "failed").length,
      averageSuccessRate: drills.length
        ? drills.reduce((sum, d) => sum + d.successRate, 0) / drills.length
        : 0,
      plansNeedingReview: plans.filter(
        (p) => Date.now() - p.lastReviewedAt.getTime() > p.reviewCycle * 24 * 60 * 60 * 1000
      ).length,
    };
  },
};
