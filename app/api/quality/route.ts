import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as qualityLib from "@/lib/quality/quality";
import * as complianceLib from "@/lib/quality/compliance";
import * as riskLib from "@/lib/quality/risk";
import * as auditLib from "@/lib/quality/audit";
import * as trainingLib from "@/lib/quality/training";
import * as reportingLib from "@/lib/quality/reporting";

export const dynamic = "force-dynamic";

/**
 * GET /api/quality
 * Fetch quality & compliance dashboards based on query parameters
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const section = request.nextUrl.searchParams.get("section");
    const frameworkId = request.nextUrl.searchParams.get("frameworkId");
    const auditId = request.nextUrl.searchParams.get("auditId");
    const userId = request.nextUrl.searchParams.get("userId");

    // Route to appropriate dashboard
    if (section === "quality") {
      const metrics = await reportingLib.getQualityMetricsDashboard();
      return NextResponse.json({ data: metrics });
    } else if (section === "compliance") {
      const dashboard = await reportingLib.getComplianceDashboard();
      return NextResponse.json({ data: dashboard });
    } else if (section === "risk") {
      const dashboard = await reportingLib.getRiskDashboard();
      return NextResponse.json({ data: dashboard });
    } else if (section === "audit") {
      if (auditId) {
        const report = await auditLib.generateAuditReport(auditId);
        return NextResponse.json({ data: report });
      }
      const dashboard = await reportingLib.getAuditDashboard();
      return NextResponse.json({ data: dashboard });
    } else if (section === "training") {
      if (userId) {
        const status = await trainingLib.getUserTrainingStatus(userId);
        return NextResponse.json({ data: status });
      }
      const dashboard = await reportingLib.getTrainingDashboard();
      return NextResponse.json({ data: dashboard });
    } else if (section === "overview") {
      const overview = await reportingLib.getQualityAndComplianceOverview();
      return NextResponse.json({ data: overview });
    } else {
      // Return full overview by default
      const overview = await reportingLib.getQualityAndComplianceOverview();
      return NextResponse.json({ data: overview });
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/quality
 * Create quality/compliance records based on type parameter
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const type = request.nextUrl.searchParams.get("type") || body.type;

    // Quality Management
    if (type === "quality-policy") {
      const policy = await qualityLib.createQualityPolicy(body, principal.userId);
      return NextResponse.json({ data: policy }, { status: 201 });
    } else if (type === "inspection-checklist") {
      const checklist = await qualityLib.createInspectionChecklist(body);
      return NextResponse.json({ data: checklist }, { status: 201 });
    } else if (type === "quality-inspection") {
      const inspection = await qualityLib.scheduleQualityInspection(body);
      return NextResponse.json({ data: inspection }, { status: 201 });
    } else if (type === "non-conformance") {
      const nc = await qualityLib.recordNonConformance(body, body.evidence);
      return NextResponse.json({ data: nc }, { status: 201 });
    } else if (type === "corrective-action") {
      const ca = await qualityLib.createCorrectiveAction(
        body.nonConformanceId,
        body.action,
        new Date(body.targetDate),
        body.assignedTo,
        body.rootCause
      );
      return NextResponse.json({ data: ca }, { status: 201 });
    }

    // Compliance Management
    else if (type === "compliance-framework") {
      const framework = await complianceLib.createComplianceFramework(body);
      return NextResponse.json({ data: framework }, { status: 201 });
    } else if (type === "compliance-control") {
      const control = await complianceLib.createComplianceControl(body, body.standardId);
      return NextResponse.json({ data: control }, { status: 201 });
    } else if (type === "compliance-assessment") {
      body.assessmentDate = new Date(body.assessmentDate);
      const assessment = await complianceLib.recordComplianceAssessment(body);
      return NextResponse.json({ data: assessment }, { status: 201 });
    }

    // Risk Management
    else if (type === "risk-assessment") {
      const riskAssessment = await riskLib.createRiskAssessment(body);
      return NextResponse.json({ data: riskAssessment }, { status: 201 });
    } else if (type === "risk-mitigation") {
      body.targetDate = new Date(body.targetDate);
      const mitigation = await riskLib.recordMitigation(
        body.riskId,
        body.mitigation,
        body.targetDate,
        body.owner
      );
      return NextResponse.json({ data: mitigation }, { status: 201 });
    } else if (type === "root-cause-analysis") {
      const rca = await riskLib.performRootCauseAnalysis(
        body.riskId,
        body.rootCause,
        body.evidence
      );
      return NextResponse.json({ data: rca }, { status: 201 });
    }

    // Audit Management
    else if (type === "audit-schedule") {
      body.auditDate = new Date(body.auditDate);
      const audit = await auditLib.scheduleAudit(body);
      return NextResponse.json({ data: audit }, { status: 201 });
    } else if (type === "audit-finding") {
      const finding = await auditLib.recordAuditFinding(body);
      return NextResponse.json({ data: finding }, { status: 201 });
    } else if (type === "remediation-plan") {
      body.targetDate = new Date(body.targetDate);
      const plan = await auditLib.createRemediationPlan(body, body.assignedTo);
      return NextResponse.json({ data: plan }, { status: 201 });
    }

    // Training & Certification
    else if (type === "training-course") {
      const course = await trainingLib.createTrainingCourse(body);
      return NextResponse.json({ data: course }, { status: 201 });
    } else if (type === "training-enrollment") {
      if (body.dueDate) body.dueDate = new Date(body.dueDate);
      const enrollment = await trainingLib.enrollUserInTraining(body);
      return NextResponse.json({ data: enrollment }, { status: 201 });
    } else if (type === "certification") {
      body.issuedDate = new Date(body.issuedDate);
      if (body.expiryDate) body.expiryDate = new Date(body.expiryDate);
      const certification = await trainingLib.registerCertification(body);
      return NextResponse.json({ data: certification }, { status: 201 });
    } else if (type === "bulk-enrollment") {
      if (body.dueDate) body.dueDate = new Date(body.dueDate);
      const result = await trainingLib.bulkEnrollUsers(
        body.courseId,
        body.userIds,
        body.dueDate
      );
      return NextResponse.json({ data: result }, { status: 201 });
    }

    // Reporting
    else if (type === "compliance-report") {
      const report = await reportingLib.generateComplianceReport(body);
      return NextResponse.json({ data: report }, { status: 201 });
    }

    return NextResponse.json(
      { error: "Unknown operation type" },
      { status: 400 }
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/quality
 * Update quality/compliance records
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const type = request.nextUrl.searchParams.get("type") || body.type;
    const id = body.id || request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID is required" },
        { status: 400 }
      );
    }

    // Quality Management
    if (type === "complete-inspection") {
      const result = await qualityLib.completeInspection(
        id,
        body.findings,
        body.verificationNotes
      );
      return NextResponse.json({ data: result });
    }

    // Compliance Management
    else if (type === "update-control-status") {
      const control = await complianceLib.updateControlStatus(
        id,
        body.status,
        body.notes
      );
      return NextResponse.json({ data: control });
    }

    // Risk Management
    else if (type === "update-risk-status") {
      const risk = await riskLib.updateRiskStatus(
        id,
        body.status,
        body.verification
      );
      return NextResponse.json({ data: risk });
    }

    // Audit Management
    else if (type === "update-audit-status") {
      const audit = await auditLib.updateAuditStatus(
        id,
        body.status,
        body.completionDate ? new Date(body.completionDate) : undefined
      );
      return NextResponse.json({ data: audit });
    } else if (type === "verify-remediation") {
      const finding = await auditLib.verifyRemediation(
        id,
        principal.userId,
        body.notes
      );
      return NextResponse.json({ data: finding });
    }

    // Training & Certification
    else if (type === "start-training") {
      const enrollment = await trainingLib.startTraining(id);
      return NextResponse.json({ data: enrollment });
    } else if (type === "complete-training") {
      const enrollment = await trainingLib.completeTraining(id, body.score);
      return NextResponse.json({ data: enrollment });
    }

    return NextResponse.json(
      { error: "Unknown operation type" },
      { status: 400 }
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * DELETE /api/quality
 * Not typically used for compliance records, but can be used for cleanup
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    // Implement if needed - compliance records usually have soft deletes or archival
    return NextResponse.json(
      { error: "DELETE not implemented for quality records" },
      { status: 405 }
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
