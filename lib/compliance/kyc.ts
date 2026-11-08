import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const documentSchema = z.object({
  type: z.enum(['PASSPORT', 'ID_CARD', 'DRIVER_LICENSE']),
  number: z.string(),
  expiryDate: z.string().datetime(),
  verified: z.boolean().default(false),
});

export async function verifyDocument(
  freelancerId: string,
  document: z.infer<typeof documentSchema>,
) {
  const validated = documentSchema.parse(document);

  const result = await prisma.kycDocument.create({
    data: {
      freelancerId,
      type: validated.type,
      documentNumber: validated.number,
      expiryDate: new Date(validated.expiryDate),
      verificationStatus: 'PENDING',
    },
  });

  return result;
}

export async function verifyFaceMatch(
  freelancerId: string,
  faceImageUrl: string,
  documentImageUrl: string,
) {
  const match = await prisma.faceVerification.create({
    data: {
      freelancerId,
      faceImageUrl,
      documentImageUrl,
      matchScore: Math.random() * 100, // Mock ML score
      verified: false,
    },
  });

  return match;
}

export async function getKycStatus(freelancerId: string) {
  const documents = await prisma.kycDocument.findMany({
    where: { freelancerId },
  });

  const faceVerification = await prisma.faceVerification.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' },
  });

  const overallStatus = documents.some((d) => d.verificationStatus === 'APPROVED')
    && faceVerification?.verified
    ? 'APPROVED'
    : 'PENDING';

  return {
    freelancerId,
    documents,
    faceVerification,
    overallStatus,
  };
}
