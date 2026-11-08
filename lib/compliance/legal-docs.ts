import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import crypto from 'crypto';

export const legalDocSchema = z.object({
  title: z.string(),
  docType: z.enum(['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'SERVICE_AGREEMENT', 'SHIFT_TERMS', 'DISPUTE_RESOLUTION']),
  content: z.string(),
  version: z.number().default(1),
  effectiveDate: z.date(),
  language: z.string().default('nl'),
});

export async function createLegalDocument(data: z.infer<typeof legalDocSchema>) {
  const validated = legalDocSchema.parse(data);
  const contentHash = crypto.createHash('sha256').update(validated.content).digest('hex');

  return await prisma.legalDocument.create({
    data: {
      ...validated,
      contentHash,
      status: 'ACTIVE',
    },
  });
}

export async function signLegalDocument(
  documentId: string,
  freelancerId: string,
  signatureData: {
    signature: string;
    timestamp: Date;
    ipAddress: string;
    userAgent: string;
  }
) {
  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
  });

  if (!doc) throw new Error('Document not found');

  return await prisma.documentSignature.create({
    data: {
      documentId,
      freelancerId,
      signature: signatureData.signature,
      signedAt: signatureData.timestamp,
      ipAddress: signatureData.ipAddress,
      userAgent: signatureData.userAgent,
    },
  });
}

export async function getDocumentSignatures(documentId: string) {
  return await prisma.documentSignature.findMany({
    where: { documentId },
    include: { freelancer: { include: { user: true } } },
    orderBy: { signedAt: 'desc' },
  });
}

export async function storeAgreement(freelancerId: string, agreementType: string, content: string) {
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');

  return await prisma.storedAgreement.create({
    data: {
      freelancerId,
      agreementType,
      content,
      contentHash,
      storedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
    },
  });
}

export async function retrieveAgreement(freelancerId: string, agreementType: string) {
  return await prisma.storedAgreement.findFirst({
    where: {
      freelancerId,
      agreementType,
      expiresAt: { gt: new Date() },
    },
    orderBy: { storedAt: 'desc' },
  });
}

export async function verifyDocumentIntegrity(documentId: string): Promise<boolean> {
  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
  });

  if (!doc) return false;

  const currentHash = crypto.createHash('sha256').update(doc.content).digest('hex');
  return currentHash === doc.contentHash;
}

export async function archiveDocument(documentId: string, reason: string) {
  return await prisma.legalDocument.update({
    where: { id: documentId },
    data: {
      status: 'ARCHIVED',
      archivedAt: new Date(),
      archiveReason: reason,
    },
  });
}

export async function generateTermsOfService(companyId: string, locale: string = 'nl-NL'): Promise<string> {
  const company = await prisma.tenant.findUnique({
    where: { id: companyId },
  });

  if (!company) throw new Error('Company not found');

  const termsTemplate = {
    'nl-NL': `# Algemene Voorwaarden

## 1. Definities
- "Platform" verwijst naar de ZekerFlex marktplaats
- "Gebruiker" is iedereen die zich registreert op het Platform
- "Klus" is een werkgelegenheid gepost door een Werkgever

## 2. Acceptatie
Door gebruik van het Platform accepteert u deze voorwaarden volledig.

## 3. Geschillen
Geschillen worden opgelost via arbitrage in Amsterdam, Nederland.

## 4. Aansprakelijkheid
Het Platform is niet aansprakelijk voor indirecte schade.

## 5. Toepasbaar Recht
Deze voorwaarden worden beheerst door Nederlands recht.`,
    'en-US': `# Terms of Service

## 1. Definitions
- "Platform" refers to the ZekerFlex marketplace
- "User" means anyone registered on the Platform
- "Shift" means work posted by an Employer

## 2. Acceptance
By using the Platform, you fully accept these terms.

## 3. Disputes
Disputes shall be resolved through arbitration in Amsterdam, Netherlands.

## 4. Liability
The Platform is not liable for indirect damages.

## 5. Governing Law
These terms are governed by Dutch law.`,
  };

  return termsTemplate[locale as keyof typeof termsTemplate] || termsTemplate['nl-NL'];
}

export async function generatePrivacyPolicy(companyId: string): Promise<string> {
  return `# Privacy Policy

## 1. Data Collection
We collect personal data necessary for the provision of services.

## 2. Data Processing
Data is processed in accordance with GDPR requirements.

## 3. Data Retention
Personal data is retained for 7 years as required by law.

## 4. User Rights
You have the right to access, correct, and delete your personal data.

## 5. Cookies
We use cookies to improve user experience.`;
}
