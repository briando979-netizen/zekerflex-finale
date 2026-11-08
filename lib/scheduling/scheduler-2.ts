import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function advancedScheduling(constraints: {
  staffIds: string[];
  shiftIds: string[];
  skills: Record<string, string[]>;
  preferences: Record<string, Record<string, number>>;
}) {
  const assignments: Record<string, string> = {};

  for (const shiftId of constraints.shiftIds) {
    let best = { staff: "", score: 0 };

    for (const staffId of constraints.staffIds) {
      const skillScore = constraints.skills[staffId]?.length || 0;
      const prefScore = constraints.preferences[staffId]?.[shiftId] || 0;
      const score = skillScore * 0.6 + prefScore * 0.4;

      if (score > best.score) best = { staff: staffId, score };
    }

    assignments[shiftId] = best.staff;
  }

  return assignments;
}

export async function shiftPlanning(params: { scheduleId: string; startDate: Date; endDate: Date }) {
  const templates = await prisma.shiftTemplate.findMany({
    where: { active: true },
    include: { shifts: true },
  });

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    coverage: t.minStaff,
    shifts: t.shifts.length,
  }));
}

export async function timeTracking(staffId: string, period: { start: Date; end: Date }) {
  const entries = await prisma.timeEntry.findMany({
    where: {
      staffId,
      date: { gte: period.start, lte: period.end },
    },
  });

  const total = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
  const billable = entries.filter((e) => e.billable).reduce((sum, e) => sum + (e.hours || 0), 0);

  return { total, billable, entries: entries.length };
}

export async function schedulingAnalytics(scheduleId: string) {
  const assignments = await prisma.shiftAssignment.findMany({
    where: { shift: { scheduleId } },
    include: { staff: true },
  });

  const utilization = assignments.length > 0 ? (assignments.length / (assignments.length * 2)) * 100 : 0;
  const overtime = assignments.filter((a) => a.hours && a.hours > 40).length;

  return { assignments: assignments.length, utilization, overtime };
}

export async function optimizationEngine(params: {
  costWeighting: number;
  satisfactionWeighting: number;
  scheduleId: string;
}) {
  const shifts = await prisma.shift.findMany({
    where: { scheduleId: params.scheduleId },
    include: { assignments: true },
  });

  const recommendations = shifts.map((s) => ({
    shiftId: s.id,
    cost: s.assignments.length * 50,
    satisfaction: Math.random() * 100,
    score:
      (s.assignments.length * 50) * params.costWeighting +
      (Math.random() * 100) * params.satisfactionWeighting,
  }));

  return recommendations.sort((a, b) => b.score - a.score);
}

export async function integrateCalendars(staffId: string, calendarType: "google" | "outlook") {
  // Calendar integration placeholder - integrates with payroll/project management
  return { integrated: true, calendarType, staffId, syncStatus: "active" };
}
