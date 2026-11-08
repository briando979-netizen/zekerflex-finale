import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import {
  createLegalDocument,
  signLegalDocument,
  getDocumentSignatures,
  storeAgreement,
  retrieveAgreement,
  generateTermsOfService,
  generatePrivacyPolicy
} from '@/lib/compliance/legal-docs';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get('type') || 'agreement';

    if (type === 'agreement') {
      const agreementType = request.nextUrl.searchParams.get('agreementType');
      if (!agreementType) throw AppError.validation('Agreement type required');

      const agreement = await retrieveAgreement(principal.userId, agreementType);
      return NextResponse.json({ agreement });
    }

    if (type === 'signatures') {
      const documentId = request.nextUrl.searchParams.get('documentId');
      if (!documentId) throw AppError.validation('Document ID required');

      const signatures = await getDocumentSignatures(documentId);
      return NextResponse.json({ signatures });
    }

    if (type === 'template') {
      const template = request.nextUrl.searchParams.get('template') || 'terms';

      if (template === 'terms') {
        const tos = await generateTermsOfService(principal.userId);
        return NextResponse.json({ content: tos });
      }

      if (template === 'privacy') {
        const policy = await generatePrivacyPolicy(principal.userId);
        return NextResponse.json({ content: policy });
      }
    }

    throw AppError.validation('Invalid type');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action } = z.object({ action: z.enum(['create-doc', 'sign-doc', 'store-agreement']) }).parse(body);

    if (action === 'create-doc') {
      const docData = z.object({
        title: z.string(),
        docType: z.enum(['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'SERVICE_AGREEMENT', 'SHIFT_TERMS', 'DISPUTE_RESOLUTION']),
        content: z.string(),
        effectiveDate: z.string().datetime(),
        language: z.string().default('nl'),
      }).parse(body);

      const doc = await createLegalDocument({
        title: docData.title,
        docType: docData.docType,
        content: docData.content,
        effectiveDate: new Date(docData.effectiveDate),
        language: docData.language,
      });

      return NextResponse.json({ document: doc }, { status: 201 });
    }

    if (action === 'sign-doc') {
      const signData = z.object({
        documentId: z.string(),
        signature: z.string(),
        signedAt: z.string().datetime(),
        ipAddress: z.string(),
        userAgent: z.string(),
      }).parse(body);

      const signature = await signLegalDocument(signData.documentId, principal.userId, {
        signature: signData.signature,
        timestamp: new Date(signData.signedAt),
        ipAddress: signData.ipAddress,
        userAgent: signData.userAgent,
      });

      return NextResponse.json({ signature }, { status: 201 });
    }

    if (action === 'store-agreement') {
      const storeData = z.object({
        agreementType: z.string(),
        content: z.string(),
      }).parse(body);

      const agreement = await storeAgreement(
        principal.userId,
        storeData.agreementType,
        storeData.content
      );

      return NextResponse.json({ agreement }, { status: 201 });
    }

    throw AppError.validation('Invalid action');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
