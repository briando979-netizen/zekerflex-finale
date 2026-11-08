import { prisma } from "@/lib/prisma";

export type MitigationAction = "WARNING" | "SUSPEND_TEMP" | "SUSPEND_PERM" | "INVESTIGATE" | "MONITOR";

export interface MitigationWorkflow {
  userId: string;
  action: MitigationAction;
  reason: string;
  duration?: number;
  createdAt: Date;
  expiresAt?: Date;
}

export async function initiateInvestigation(userId: string, reason: string): Promise<void> {
  const investigation = await prisma.fraudInvestigation.create({
    data: {
      userId,
      status: "PENDING",
      reason,
      startedAt: new Date(),
    },
  });

  await prisma.fraudMitigation.create({
    data: {
      userId,
      action: "INVESTIGATE",
      reason,
    },
  });
}

export async function suspendAccount(userId: string, reason: string, permanent: boolean = false): Promise<void> {
  const expiresAt = permanent ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days default

  await prisma.user.update({
    where: { id: userId },
    data: {
      suspended: true,
      suspensionReason: reason,
    },
  });

  await prisma.fraudMitigation.create({
    data: {
      userId,
      action: permanent ? "SUSPEND_PERM" : "SUSPEND_TEMP",
      reason,
      expiresAt,
    },
  });

  // Notify user
  await prisma.notification.create({
    data: {
      userId,
      title: "Account Suspended",
      body: `Your account has been suspended for ${permanent ? "violating our terms" : "7 days"}: ${reason}`,
      type: "SYSTEM",
    },
  });
}

export async function issueWarning(userId: string, reason: string): Promise<void> {
  await prisma.fraudMitigation.create({
    data: {
      userId,
      action: "WARNING",
      reason,
    },
  });

  const warningCount = await prisma.fraudMitigation.count({
    where: { userId, action: "WARNING" },
  });

  if (warningCount >= 3) {
    await suspendAccount(userId, `${warningCount} warnings issued`, false);
  }
}

export async function enableMonitoring(userId: string, reason: string): Promise<void> {
  await prisma.fraudMitigation.create({
    data: {
      userId,
      action: "MONITOR",
      reason,
    },
  });

  await prisma.fraudMonitoringProfile.upsert({
    where: { userId },
    create: {
      userId,
      isMonitored: true,
      monitoringSince: new Date(),
      reason,
    },
    update: {
      isMonitored: true,
      reason,
    },
  });
}

export async function evaluateAndMitigate(userId: string): Promise<void> {
  const riskProfile = await prisma.fraudRiskProfile.findUnique({ where: { userId } });
  const identityVerification = await prisma.fraudIdentityVerification.findUnique({ where: { userId } });
  const disputeAnalysis = await prisma.fraudDisputeAnalysis.findUnique({ where: { userId } });

  if (!riskProfile) return;

  let action: MitigationAction = "MONITOR";
  let reason = "";

  if (riskProfile.level === "CRITICAL") {
    action = "SUSPEND_PERM";
    reason = `Critical fraud risk: ${riskProfile.factors.join(", ")}`;
  } else if (riskProfile.level === "HIGH") {
    if (identityVerification && !identityVerification.verified) {
      action = "SUSPEND_TEMP";
      reason = `Unverified identity: ${identityVerification.riskFactors.join(", ")}`;
    } else if (disputeAnalysis?.isFraudulent) {
      action = "INVESTIGATE";
      reason = `Fraudulent dispute pattern detected`;
    } else {
      action = "WARNING";
      reason = `High fraud risk detected`;
    }
  } else if (riskProfile.level === "MEDIUM") {
    action = "MONITOR";
    reason = `Medium fraud risk: ${riskProfile.factors.slice(0, 2).join(", ")}`;
  }

  // Execute mitigation
  switch (action) {
    case "SUSPEND_PERM":
      await suspendAccount(userId, reason, true);
      break;
    case "SUSPEND_TEMP":
      await suspendAccount(userId, reason, false);
      break;
    case "INVESTIGATE":
      await initiateInvestigation(userId, reason);
      break;
    case "WARNING":
      await issueWarning(userId, reason);
      break;
    case "MONITOR":
      await enableMonitoring(userId, reason);
      break;
  }
}

export async function unsuspendAccount(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      suspended: false,
      suspensionReason: null,
    },
  });

  await prisma.notification.create({
    data: {
      userId,
      title: "Account Restored",
      body: "Your account suspension has been lifted.",
      type: "SYSTEM",
    },
  });
}

export async function processMitigations(): Promise<void> {
  // Process expired suspensions
  const expiredMitigations = await prisma.fraudMitigation.findMany({
    where: {
      action: "SUSPEND_TEMP",
      expiresAt: { lt: new Date() },
    },
  });

  for (const mitigation of expiredMitigations) {
    await unsuspendAccount(mitigation.userId);
  }
}
