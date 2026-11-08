import { prisma } from "@/lib/prisma";

export interface BehaviorAnomaly {
  userId: string;
  type: "COLLUSION" | "FAKE_BOOKING" | "SUSPICIOUS_PATTERN" | "RAPID_ACCEPTANCE";
  severity: "LOW" | "MEDIUM" | "HIGH";
  details: string;
  detectedAt: Date;
}

export async function detectCollusion(userId: string): Promise<BehaviorAnomaly[]> {
  const anomalies: BehaviorAnomaly[] = [];

  // Check if same worker accepts from same employer repeatedly in short timeframe
  const assignments = await prisma.assignment.findMany({
    where: { workerId: userId },
    include: { shift: { include: { employerId: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const employerCounts: Record<string, number> = {};
  const timegaps: number[] = [];

  for (let i = 0; i < assignments.length - 1; i++) {
    const current = assignments[i].createdAt;
    const next = assignments[i + 1].createdAt;
    const gap = (current.getTime() - next.getTime()) / (1000 * 60);
    timegaps.push(gap);
  }

  const avgGap = timegaps.length > 0 ? timegaps.reduce((a, b) => a + b) / timegaps.length : 0;
  if (timegaps.some((g) => g < 5)) {
    anomalies.push({
      userId,
      type: "COLLUSION",
      severity: "HIGH",
      details: `Rapid consecutive assignments detected (gap ${Math.round(avgGap)}min)`,
      detectedAt: new Date(),
    });
  }

  // Check for employer favoritism
  for (const a of assignments) {
    employerCounts[a.shift.employerId] = (employerCounts[a.shift.employerId] ?? 0) + 1;
  }

  const favoredEmployers = Object.entries(employerCounts).filter(([, count]) => count > 15);
  if (favoredEmployers.length > 0) {
    anomalies.push({
      userId,
      type: "COLLUSION",
      severity: "MEDIUM",
      details: `Excessive assignments from same employer(s): ${favoredEmployers.map(([id]) => id).join(", ")}`,
      detectedAt: new Date(),
    });
  }

  return anomalies;
}

export async function detectFakeBookings(userId: string): Promise<BehaviorAnomaly[]> {
  const anomalies: BehaviorAnomaly[] = [];

  const assignments = await prisma.assignment.findMany({
    where: { workerId: userId },
    include: { shift: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Check cancellation rate
  const cancelledCount = await prisma.assignment.count({
    where: { workerId: userId, status: "CANCELLED" },
  });
  const cancellationRate = (cancelledCount / Math.max(assignments.length, 1)) * 100;

  if (cancellationRate > 40) {
    anomalies.push({
      userId,
      type: "FAKE_BOOKING",
      severity: "HIGH",
      details: `High cancellation rate: ${Math.round(cancellationRate)}%`,
      detectedAt: new Date(),
    });
  }

  // Check no-show pattern
  const noShows = await prisma.assignment.count({
    where: { workerId: userId, status: "NO_SHOW" },
  });
  if (noShows > 5) {
    anomalies.push({
      userId,
      type: "FAKE_BOOKING",
      severity: "HIGH",
      details: `${noShows} no-show incidents recorded`,
      detectedAt: new Date(),
    });
  }

  return anomalies;
}

export async function detectSuspiciousPatterns(userId: string): Promise<BehaviorAnomaly[]> {
  const anomalies: BehaviorAnomaly[] = [];

  const shifts = await prisma.assignment.findMany({
    where: { workerId: userId },
    take: 100,
  });

  // Rapid shift switching
  const shiftTypes = new Map<string, number>();
  for (const shift of shifts) {
    const key = `${shift.createdAt.toDateString()}`;
    shiftTypes.set(key, (shiftTypes.get(key) ?? 0) + 1);
  }

  const maxPerDay = Math.max(...Array.from(shiftTypes.values()));
  if (maxPerDay > 8) {
    anomalies.push({
      userId,
      type: "SUSPICIOUS_PATTERN",
      severity: "MEDIUM",
      details: `Unusually high shift frequency: ${maxPerDay} shifts/day`,
      detectedAt: new Date(),
    });
  }

  return anomalies;
}

export async function analyzeWorkerBehavior(userId: string): Promise<BehaviorAnomaly[]> {
  const allAnomalies = [
    ...(await detectCollusion(userId)),
    ...(await detectFakeBookings(userId)),
    ...(await detectSuspiciousPatterns(userId)),
  ];

  for (const anomaly of allAnomalies) {
    await prisma.fraudBehaviorAnomaly.create({ data: anomaly });
  }

  return allAnomalies;
}
