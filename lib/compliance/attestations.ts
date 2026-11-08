import { prisma } from "@/lib/prisma";
import type { AttestationStatus } from "./types";

export async function registerAttestation(
  tenantId: string,
  certificationName: string,
  issueDate: Date,
  expirationDate: Date,
  certificationNumber: string | null,
  certificationBody: string | null,
  scopeDescription: string | null
): Promise<string> {
  const attestation = await prisma.attestation.create({
    data: {
      tenantId,
      certificationName,
      issueDate,
      expirationDate,
      certificationNumber,
      certificationBody,
      scopeDescription,
      status: "ACTIVE"
    }
  });
  return attestation.id;
}

export async function validateAttestation(
  attestationId: string,
  validationBody: string | null,
  result: string
): Promise<void> {
  await prisma.attestation.update({
    where: { id: attestationId },
    data: {
      validations: {
        create: {
          validationDate: new Date(),
          validationBody,
          result
        }
      }
    }
  });
}

export async function renewAttestation(
  attestationId: string,
  newExpirationDate: Date,
  certificationNumber: string | null
): Promise<void> {
  await prisma.attestation.update({
    where: { id: attestationId },
    data: {
      expirationDate: newExpirationDate,
      issueDate: new Date(),
      certificationNumber,
      status: "ACTIVE"
    }
  });
}

export async function checkExpired(tenantId: string): Promise<AttestationStatus[]> {
  const attestations = await prisma.attestation.findMany({
    where: {
      tenantId,
      expirationDate: {
        lte: new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000)
      }
    },
    include: { validations: { orderBy: { validationDate: "desc" }, take: 1 } }
  });

  return attestations.map(a => {
    const daysUntilExpiry = Math.ceil(
      (a.expirationDate.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000)
    );
    const isExpired = daysUntilExpiry < 0;
    const lastValidation = a.validations[0];

    return {
      attestationId: a.id,
      certificationName: a.certificationName,
      issueDate: a.issueDate,
      expirationDate: a.expirationDate,
      daysUntilExpiry: Math.max(0, daysUntilExpiry),
      isExpired,
      lastValidationDate: lastValidation?.validationDate ?? null,
      validationResult: lastValidation?.result ?? null
    };
  });
}
