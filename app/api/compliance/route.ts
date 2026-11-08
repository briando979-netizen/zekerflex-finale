"use server";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import {
  requestDataExport,
  requestDataDeletion,
  getConsentStatus,
  recordConsent,
} from "@/lib/compliance/gdpr-ng";
import {
  createSlaMetric,
  updateSlaValue,
  getSlaStatus,
  getTenantSlaMetrics,
} from "@/lib/compliance/sla";
import {
  assessFraudRisk,
  getFraudStatus,
  calculateFraudScore,
} from "@/lib/compliance/fraud-detection";
import {
  generateMonthlyReport,
  generateQuarterlyReport,
  generateAnnualReport,
  getTaxReports,
  getTaxSummary,
} from "@/lib/compliance/tax-reporting";
import {
  getAuditTrail,
  getAuditSummary,
  generateComplianceReport as generateAuditReport,
} from "@/lib/compliance/audit-trail";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Ongeautoriseerd" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action");
    const tenantId = searchParams.get("tenantId") || session.user?.tenantId;

    if (action === "gdpr:consent-status") {
      const consentStatus = await getConsentStatus(session.user?.id ?? "");
      return NextResponse.json(consentStatus);
    }

    if (action === "sla:metrics") {
      const metrics = await getTenantSlaMetrics(tenantId ?? "");
      return NextResponse.json(metrics);
    }

    if (action === "audit:trail") {
      const logs = await getAuditTrail({
        userId: searchParams.get("userId") ?? undefined,
        limit: parseInt(searchParams.get("limit") ?? "100"),
      });
      return NextResponse.json(logs);
    }

    return NextResponse.json({ error: "Onbekende actie" }, { status: 400 });
  } catch (error) {
    console.error("Compliance API fout:", error);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Ongeautoriseerd" }, { status: 401 });
    }

    const body = await req.json();
    const { action, payload } = body;
    const tenantId = session.user?.tenantId || "";
    const userId = session.user?.id || "";
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");

    if (action === "gdpr:request-export") {
      const result = await requestDataExport(userId, tenantId, ipAddress ?? undefined);
      return NextResponse.json(result, { status: 201 });
    }

    if (action === "fraud:assess") {
      const freelancerId = payload.freelancerId || userId;
      const assessment = await assessFraudRisk(freelancerId);
      return NextResponse.json(assessment);
    }

    if (action === "tax:generate-annual") {
      const report = await generateAnnualReport(payload.freelancerId || userId, tenantId, payload.year);
      return NextResponse.json(report, { status: 201 });
    }

    return NextResponse.json({ error: "Onbekende actie" }, { status: 400 });
  } catch (error) {
    console.error("Compliance API fout:", error);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
