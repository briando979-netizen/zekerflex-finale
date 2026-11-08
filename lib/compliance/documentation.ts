import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const docSchema = z.object({
  type: z.enum(['CONTRACT', 'TAX_FORM', 'INSURANCE', 'NDA', 'AGREEMENT']),
  documentUrl: z.string(),
  signedAt: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional(),
});

export async function generateContract(
  freelancerId: string,
  contractType: string,
  terms: Record<string, unknown>,
) {
  const contract = await prisma.complianceDocument.create({
    data: {
      freelancerId,
      type: 'CONTRACT',
      documentType: contractType,
      documentUrl: `/contracts/${freelancerId}/${Date.now()}.pdf`,
      terms: JSON.stringify(terms),
      status: 'GENERATED',
    },
  });

  return contract;
}

export async function signDocument(
  freelancerId: string,
  documentId: string,
  signature: string,
) {
  const result = await prisma.complianceDocument.update({
    where: { id: documentId },
    data: {
      signature,
      signedAt: new Date(),
      status: 'SIGNED',
    },
  });

  return result;
}

export async function uploadTaxForm(
  freelancerId: string,
  formType: string,
  documentUrl: string,
) {
  const result = await prisma.complianceDocument.create({
    data: {
      freelancerId,
      type: 'TAX_FORM',
      documentType: formType,
      documentUrl,
      status: 'PENDING_REVIEW',
    },
  });

  return result;
}

export async function uploadInsuranceDocument(
  freelancerId: string,
  insuranceType: string,
  documentUrl: string,
  expiryDate: string,
) {
  const result = await prisma.insuranceDocument.create({
    data: {
      freelancerId,
      insuranceType,
      documentUrl,
      expiryDate: new Date(expiryDate),
      verified: false,
    },
  });

  return result;
}

export async function getDocuments(freelancerId: string, type?: string) {
  const where = type ? { freelancerId, type } : { freelancerId };

  const documents = await prisma.complianceDocument.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return documents;
}

export async function verifyDocument(documentId: string, approved: boolean) {
  const result = await prisma.complianceDocument.update({
    where: { id: documentId },
    data: {
      status: approved ? 'APPROVED' : 'REJECTED',
      verifiedAt: new Date(),
    },
  });

  return result;
}

export async function checkDocumentExpiry(freelancerId: string) {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const expiringDocs = await prisma.complianceDocument.findMany({
    where: {
      freelancerId,
      expiryDate: {
        lte: thirtyDaysFromNow,
        gte: now,
      },
    },
  });

  const insurance = await prisma.insuranceDocument.findMany({
    where: {
      freelancerId,
      expiryDate: {
        lte: thirtyDaysFromNow,
        gte: now,
      },
    },
  });

  return {
    expiringDocs,
    expiringInsurance: insurance,
  };
}
