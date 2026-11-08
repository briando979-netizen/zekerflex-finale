import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import crypto from 'crypto';

const mfaSchema = z.object({
  email: z.string().email(),
  phone: z.string(),
  backupCodes: z.array(z.string()),
});

export async function setupMultiFactorAuth(freelancerId: string, email: string, phone: string) {
  const backupCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString('hex'),
  );

  const result = await prisma.multiFactorAuth.create({
    data: {
      freelancerId,
      email,
      phone,
      backupCodes,
      enabled: true,
    },
  });

  return {
    ...result,
    backupCodes, // Only show once
  };
}

export async function verifyMfaCode(
  freelancerId: string,
  code: string,
): Promise<{ valid: boolean; message: string }> {
  const mfa = await prisma.multiFactorAuth.findUnique({
    where: { freelancerId },
  });

  if (!mfa?.enabled) {
    return { valid: false, message: 'MFA not enabled' };
  }

  if (mfa.backupCodes.includes(code)) {
    await prisma.multiFactorAuth.update({
      where: { freelancerId },
      data: {
        backupCodes: mfa.backupCodes.filter((c) => c !== code),
      },
    });
    return { valid: true, message: 'MFA verified' };
  }

  return { valid: false, message: 'Invalid MFA code' };
}

export async function verifyGovernmentId(
  freelancerId: string,
  idNumber: string,
  idType: string,
) {
  const verification = await prisma.governmentIdVerification.create({
    data: {
      freelancerId,
      idNumber,
      idType,
      verificationStatus: 'PENDING',
    },
  });

  return verification;
}

export async function getIdentityStatus(freelancerId: string) {
  const mfa = await prisma.multiFactorAuth.findUnique({
    where: { freelancerId },
  });

  const govId = await prisma.governmentIdVerification.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' },
  });

  const emailVerified = await prisma.emailVerification.findFirst({
    where: { freelancerId },
  });

  const phoneVerified = await prisma.phoneVerification.findFirst({
    where: { freelancerId },
  });

  return {
    freelancerId,
    mfaEnabled: mfa?.enabled ?? false,
    governmentIdVerified: govId?.verificationStatus === 'APPROVED',
    emailVerified: emailVerified?.verified ?? false,
    phoneVerified: phoneVerified?.verified ?? false,
    identityScore: calculateIdentityScore({
      mfa: mfa?.enabled ?? false,
      govId: govId?.verificationStatus === 'APPROVED',
      email: emailVerified?.verified ?? false,
      phone: phoneVerified?.verified ?? false,
    }),
  };
}

function calculateIdentityScore(factors: Record<string, boolean>): number {
  const verified = Object.values(factors).filter((v) => v).length;
  return Math.round((verified / Object.keys(factors).length) * 100);
}

export async function lockIdentity(freelancerId: string, reason: string) {
  const result = await prisma.identityLock.create({
    data: {
      freelancerId,
      reason,
      locked: true,
    },
  });

  return result;
}
