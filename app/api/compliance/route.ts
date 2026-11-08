import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as kyc from "@/lib/compliance/kyc";
import * as certs from "@/lib/compliance/certifications";
import * as tracking from "@/lib/compliance/tracking";
import * as fraud from "@/lib/compliance/fraud";
import * as identity from "@/lib/compliance/identity";
import * as docs from "@/lib/compliance/documentation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const action = request.nextUrl.searchParams.get("action") || "status";

    switch (action) {
      case "kyc":
        return NextResponse.json(await kyc.getKycStatus(principal.userId));
      case "certs":
        return NextResponse.json(await certs.getCertifications(principal.userId));
      case "compliance":
        return NextResponse.json(await tracking.trackCompliance(principal.userId));
      case "fraud":
        return NextResponse.json(await fraud.getFraudStatus(principal.userId));
      case "identity":
        return NextResponse.json(await identity.getIdentityStatus(principal.userId));
      case "documents":
        return NextResponse.json(await docs.getDocuments(principal.userId));
      default:
        return NextResponse.json({
          kyc: await kyc.getKycStatus(principal.userId),
          compliance: await tracking.trackCompliance(principal.userId),
          fraud: await fraud.getFraudStatus(principal.userId),
          identity: await identity.getIdentityStatus(principal.userId),
        });
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const action = request.nextUrl.searchParams.get("action");

    switch (action) {
      case "verify-document":
        return NextResponse.json(
          await kyc.verifyDocument(principal.userId, body),
          { status: 201 },
        );
      case "add-cert":
        return NextResponse.json(
          await certs.addCertification(principal.userId, body),
          { status: 201 },
        );
      case "setup-mfa":
        return NextResponse.json(
          await identity.setupMultiFactorAuth(
            principal.userId,
            body.email,
            body.phone,
          ),
          { status: 201 },
        );
      case "upload-tax":
        return NextResponse.json(
          await docs.uploadTaxForm(principal.userId, body.formType, body.documentUrl),
          { status: 201 },
        );
      case "flag-fraud":
        return NextResponse.json(
          await fraud.flagProfile(principal.userId, body.reason),
          { status: 201 },
        );
      default:
        throw AppError.validation("Unknown action");
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
