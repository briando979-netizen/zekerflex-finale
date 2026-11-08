import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export interface IdentityVerificationResult {
  userId: string;
  verified: boolean;
  duplicateAccounts: string[];
  riskFactors: string[];
  verificationScore: number;
}

export async function hashPersonalData(data: string): Promise<string> {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export async function detectDuplicateAccounts(email: string, phone?: string): Promise<string[]> {
  const duplicates: string[] = [];

  const emailHash = await hashPersonalData(email);
  const usersWithSameEmail = await prisma.user.findMany({
    where: { email },
    select: { id: true },
  });

  if (usersWithSameEmail.length > 1) {
    duplicates.push(...usersWithSameEmail.map((u) => u.id));
  }

  if (phone) {
    const usersWithSamePhone = await prisma.user.findMany({
      where: { phone },
      select: { id: true },
    });

    if (usersWithSamePhone.length > 1) {
      duplicates.push(...usersWithSamePhone.map((u) => u.id));
    }
  }

  return [...new Set(duplicates)];
}

export async function detectFakeProfiles(userId: string): Promise<string[]> {
  const riskFactors: string[] = [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { freelancerProfile: true },
  });

  if (!user) return riskFactors;

  // Check for generic/suspicious names
  const suspiciousNames = ["test", "admin", "user", "demo", "fake"];
  const nameLower = (user.name ?? "").toLowerCase();
  if (suspiciousNames.some((n) => nameLower.includes(n))) {
    riskFactors.push("Suspicious username pattern");
  }

  // Check for generic profile info
  if (user.freelancerProfile?.bio) {
    const bioLower = user.freelancerProfile.bio.toLowerCase();
    if (bioLower.includes("test") || bioLower.length < 10) {
      riskFactors.push("Minimal or test profile description");
    }
  }

  // Check for missing contact verification
  if (!user.emailVerified && !user.phone) {
    riskFactors.push("No verified contact information");
  }

  // Check for newly created account with high activity
  const accountAge = Date.now() - user.createdAt.getTime();
  const dayOld = 24 * 60 * 60 * 1000;
  if (accountAge < 7 * dayOld) {
    const assignments = await prisma.assignment.count({ where: { workerId: userId } });
    if (assignments > 20) {
      riskFactors.push("High activity in new account");
    }
  }

  return riskFactors;
}

export async function verifyIdentity(userId: string): Promise<IdentityVerificationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) throw new Error("User not found");

  const duplicates = await detectDuplicateAccounts(user.email, user.phone ?? undefined);
  const fakeProfileFactors = await detectFakeProfiles(userId);

  const riskFactors: string[] = [];
  let verificationScore = 100;

  if (!user.emailVerified) {
    riskFactors.push("Email not verified");
    verificationScore -= 20;
  }

  if (!user.phone) {
    riskFactors.push("No phone number");
    verificationScore -= 10;
  }

  riskFactors.push(...fakeProfileFactors);
  verificationScore -= fakeProfileFactors.length * 15;

  if (duplicates.length > 1) {
    riskFactors.push(`Duplicate accounts detected: ${duplicates.join(", ")}`);
    verificationScore -= 30;
  }

  const verified = verificationScore >= 70 && duplicates.length <= 1;

  const result: IdentityVerificationResult = {
    userId,
    verified,
    duplicateAccounts: duplicates.filter((d) => d !== userId),
    riskFactors,
    verificationScore: Math.max(0, verificationScore),
  };

  await prisma.fraudIdentityVerification.upsert({
    where: { userId },
    create: result,
    update: result,
  });

  return result;
}

export async function verifyAllIdentities(): Promise<void> {
  const users = await prisma.user.findMany({ where: { role: "FREELANCER" } });
  for (const user of users) {
    await verifyIdentity(user.id);
  }
}
