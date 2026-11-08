import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/ops/logger";
import { kv } from "@/lib/kv";

interface FraudSignal {
  userId: string;
  riskScore: number;
  signals: string[];
  action: "allow" | "review" | "block";
}

export async function detectFraud(userId: string, action: string, metadata: any): Promise<FraudSignal> {
  try {
    const signals: string[] = [];
    let riskScore = 0;

    // Velocity checks
    const recentActions = await checkVelocity(userId);
    if (recentActions > 10) {
      signals.push("high_velocity");
      riskScore += 0.3;
    }

    // Geographic anomalies
    const geoRisk = await checkGeographic(userId, metadata.location);
    if (geoRisk > 0.5) {
      signals.push("geographic_anomaly");
      riskScore += 0.3;
    }

    // Behavioral analysis
    const behaviorRisk = await checkBehavior(userId);
    if (behaviorRisk > 0.5) {
      signals.push("behavior_anomaly");
      riskScore += 0.2;
    }

    // Account takeover indicators
    const takeoverRisk = await checkAccountTakeover(userId);
    if (takeoverRisk > 0.5) {
      signals.push("account_takeover_risk");
      riskScore += 0.4;
    }

    // Transaction patterns
    if (action === "payment") {
      const txRisk = await checkTransactionPattern(userId, metadata.amount);
      if (txRisk > 0.5) {
        signals.push("suspicious_transaction");
        riskScore += 0.2;
      }
    }

    riskScore = Math.min(1, riskScore);

    const fraudSignal: FraudSignal = {
      userId,
      riskScore,
      signals,
      action: riskScore > 0.7 ? "block" : riskScore > 0.4 ? "review" : "allow",
    };

    if (fraudSignal.action !== "allow") {
      await logFraudSignal(fraudSignal);
    }

    return fraudSignal;
  } catch (err) {
    logger.error("Fraud detection failed", { userId, err });
    return { userId, riskScore: 0, signals: [], action: "allow" };
  }
}

async function checkVelocity(userId: string): Promise<number> {
  const key = `fraud:velocity:${userId}`;
  const count = await kv.incr(key);
  await kv.expire(key, 3600);
  return count;
}

async function checkGeographic(userId: string, location: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 0;

  const lastLocation = user.lastLocation;
  if (!lastLocation || lastLocation === location) return 0;

  // Distance calculation (simplified)
  return Math.random() * 0.5;
}

async function checkBehavior(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 0;

  const daysSinceCreation = (Date.now() - (user.createdAt?.getTime() ?? 0)) / 86400000;
  if (daysSinceCreation < 7) return 0.3; // New account risk

  return 0;
}

async function checkAccountTakeover(userId: string): Promise<number> {
  const key = `fraud:login:${userId}`;
  const loginAttempts = await kv.incr(key);
  await kv.expire(key, 300);

  if (loginAttempts > 5) return 0.8;
  return 0;
}

async function checkTransactionPattern(userId: string, amount: number): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 0;

  const avgTransaction = 50;
  const deviation = Math.abs(amount - avgTransaction) / avgTransaction;

  return Math.min(1, deviation / 5);
}

async function logFraudSignal(signal: FraudSignal): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: signal.userId,
      action: `fraud_detected_${signal.action}`,
      details: { signals: signal.signals, score: signal.riskScore },
    },
  });
}

export async function getFragRiskScore(userId: string): Promise<number> {
  const signal = await detectFraud(userId, "check", {});
  return signal.riskScore;
}
