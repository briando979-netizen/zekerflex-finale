import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const certSchema = z.object({
  name: z.string(),
  issuer: z.string(),
  expiryDate: z.string().datetime().optional(),
  documentUrl: z.string(),
});

export async function addCertification(
  freelancerId: string,
  cert: z.infer<typeof certSchema>,
) {
  const validated = certSchema.parse(cert);

  const result = await prisma.certification.create({
    data: {
      freelancerId,
      name: validated.name,
      issuer: validated.issuer,
      expiryDate: validated.expiryDate ? new Date(validated.expiryDate) : null,
      documentUrl: validated.documentUrl,
      verificationStatus: 'PENDING',
    },
  });

  return result;
}

export async function verifyCertification(certificationId: string, approved: boolean) {
  const result = await prisma.certification.update({
    where: { id: certificationId },
    data: {
      verificationStatus: approved ? 'APPROVED' : 'REJECTED',
    },
  });

  return result;
}

export async function getCertifications(freelancerId: string) {
  return await prisma.certification.findMany({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getBackgroundCheckStatus(freelancerId: string) {
  const check = await prisma.backgroundCheck.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' },
  });

  return check;
}

export async function requestBackgroundCheck(freelancerId: string, checkType: string) {
  const result = await prisma.backgroundCheck.create({
    data: {
      freelancerId,
      checkType,
      status: 'REQUESTED',
    },
  });

  return result;
}
