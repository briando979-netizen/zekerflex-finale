import { prisma } from '@/lib/prisma';

export async function trackCompliance(freelancerId: string) {
  const kyc = await prisma.kycDocument.findMany({
    where: { freelancerId },
  });

  const certs = await prisma.certification.findMany({
    where: { freelancerId },
  });

  const backgroundCheck = await prisma.backgroundCheck.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' },
  });

  const taxStatus = await prisma.taxDocument.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' },
  });

  const insurance = await prisma.insuranceDocument.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' },
  });

  const wttaStatus = await prisma.wttaCompliance.findFirst({
    where: { freelancerId },
  });

  const complianceScore = calculateComplianceScore({
    kyc: kyc.length > 0,
    certs: certs.length > 0,
    backgroundCheck: backgroundCheck?.status === 'APPROVED',
    taxStatus: taxStatus?.verified ?? false,
    insurance: insurance?.verified ?? false,
    wtta: wttaStatus?.compliant ?? false,
  });

  return {
    freelancerId,
    kyc,
    certs,
    backgroundCheck,
    taxStatus,
    insurance,
    wttaStatus,
    complianceScore,
    canWork: complianceScore >= 70,
  };
}

function calculateComplianceScore(factors: Record<string, boolean>): number {
  const passed = Object.values(factors).filter((v) => v).length;
  const total = Object.keys(factors).length;
  return Math.round((passed / total) * 100);
}

export async function updateWttaCompliance(
  freelancerId: string,
  compliant: boolean,
  registrationNumber?: string,
) {
  const result = await prisma.wttaCompliance.upsert({
    where: { freelancerId },
    create: {
      freelancerId,
      compliant,
      wttaRegistration: registrationNumber,
    },
    update: {
      compliant,
      wttaRegistration: registrationNumber,
    },
  });

  return result;
}

export async function checkComplianceExpiry(freelancerId: string) {
  const now = new Date();
  const expiring = await prisma.certification.findMany({
    where: {
      freelancerId,
      expiryDate: {
        lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    },
  });

  return expiring;
}
