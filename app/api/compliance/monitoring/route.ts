import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal, requireRole } from '@/lib/auth';
import {
  getAuditTrail,
  monitorCompliance,
  flagComplianceIssue,
  generateComplianceReport
} from '@/lib/compliance/monitoring';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get('type') || 'audit-trail';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

    if (type === 'audit-trail') {
      const trail = await getAuditTrail(principal.userId, limit);
      return NextResponse.json({ auditTrail: trail });
    }

    if (type === 'platform-wide') {
      await requireRole('PLATFORM_ADMIN');
      const violations = await monitorCompliance();
      return NextResponse.json({ violations });
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
    const { action } = z.object({ action: z.enum(['flag-issue', 'generate-report']) }).parse(body);

    if (action === 'flag-issue') {
      const issueData = z.object({
        issueType: z.string(),
        details: z.string(),
      }).parse(body);

      const issue = await flagComplianceIssue(
        principal.userId,
        issueData.issueType,
        issueData.details
      );

      return NextResponse.json({ issue }, { status: 201 });
    }

    if (action === 'generate-report') {
      await requireRole('PLATFORM_ADMIN');

      const reportData = z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      }).parse(body);

      const report = await generateComplianceReport(
        new Date(reportData.startDate),
        new Date(reportData.endDate)
      );

      return NextResponse.json({ report });
    }

    throw AppError.validation('Invalid action');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
