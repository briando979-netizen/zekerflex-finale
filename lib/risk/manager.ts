import { prisma } from "@/lib/prisma";

export type RiskSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RiskStatus = "OPEN" | "IN_PROGRESS" | "MITIGATED" | "ACCEPTED" | "RESOLVED";

export interface RiskAssessment {
  id: string;
  title: string;
  description: string;
  category: string;
  likelihood: number; // 1-5
  impact: number; // 1-5
  severity: RiskSeverity;
  score: number; // 1-25
  status: RiskStatus;
  owner?: string;
  mitigationStrategy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class RiskManager {
  static calculateSeverity(likelihood: number, impact: number): RiskSeverity {
    const score = likelihood * impact;

    if (score >= 20) return "CRITICAL";
    if (score >= 12) return "HIGH";
    if (score >= 6) return "MEDIUM";
    return "LOW";
  }

  static async createRiskAssessment(
    assessment: Omit<RiskAssessment, "id" | "score" | "severity" | "createdAt" | "updatedAt">
  ): Promise<RiskAssessment> {
    const severity = this.calculateSeverity(assessment.likelihood, assessment.impact);
    const score = assessment.likelihood * assessment.impact;

    return prisma.riskAssessment.create({
      data: {
        title: assessment.title,
        description: assessment.description,
        category: assessment.category,
        likelihood: assessment.likelihood,
        impact: assessment.impact,
        severity,
        score,
        status: assessment.status,
        owner: assessment.owner,
        mitigationStrategy: assessment.mitigationStrategy,
      },
    });
  }

  static async updateRiskStatus(assessmentId: string, status: RiskStatus, mitigation?: string): Promise<void> {
    await prisma.riskAssessment.update({
      where: { id: assessmentId },
      data: {
        status,
        mitigationStrategy: mitigation,
        updatedAt: new Date(),
      },
    });
  }

  static async detectAnomalies(): Promise<RiskAssessment[]> {
    // Detect anomalies from audit logs
    const risks: RiskAssessment[] = [];

    // Check for repeated failed logins
    const failedLogins = await prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        action: "LOGIN",
        status: "FAILURE",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      _count: { id: true },
    });

    for (const login of failedLogins) {
      if (login._count.id > 5) {
        risks.push({
          id: `anomaly-login-${login.userId}`,
          title: "Repeated Failed Login Attempts",
          description: `User ${login.userId} has ${login._count.id} failed login attempts in 24h`,
          category: "SECURITY",
          likelihood: 4,
          impact: 3,
          severity: "HIGH",
          score: 12,
          status: "OPEN",
          owner: "security",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Check for unusual data access patterns
    const dataAccess = await prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        action: "READ",
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
      _count: { id: true },
    });

    for (const access of dataAccess) {
      if (access._count.id > 1000) {
        risks.push({
          id: `anomaly-access-${access.userId}`,
          title: "Unusual Data Access Volume",
          description: `User ${access.userId} accessed ${access._count.id} records in 1 hour`,
          category: "DATA_EXFILTRATION",
          likelihood: 3,
          impact: 4,
          severity: "HIGH",
          score: 12,
          status: "OPEN",
          owner: "security",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return risks;
  }

  static async getComplianceGaps(framework: string): Promise<string[]> {
    const gaps: string[] = [];

    // Check specific compliance gaps
    if (framework === "GDPR") {
      // Check GDPR gaps
      const consentRecords = await prisma.gdprConsent.count();
      if (consentRecords === 0) gaps.push("No GDPR consent tracking found");

      const dpa = await prisma.user.findFirst({
        where: { role: "DPA" },
      });
      if (!dpa) gaps.push("No Data Protection Officer appointed");
    }

    if (framework === "HIPAA") {
      const encryptedCount = await prisma.data.count({
        where: { encrypted: true },
      });
      const totalCount = await prisma.data.count();
      if (encryptedCount < totalCount * 0.95) gaps.push("Not all PHI is encrypted (95% required)");
    }

    if (framework === "SOC2") {
      const auditLogs = await prisma.auditLog.count();
      if (auditLogs === 0) gaps.push("No audit logging configured");
    }

    if (framework === "PCI_DSS") {
      const firewallActive = true; // Check actual firewall status
      if (!firewallActive) gaps.push("Firewall is not active");
    }

    return gaps;
  }

  static async generateRiskReport(severity?: RiskSeverity): Promise<string> {
    const where = severity ? { severity } : {};
    const assessments = await prisma.riskAssessment.findMany({ where });

    const bySeverity = assessments.reduce(
      (acc, risk) => {
        acc[risk.severity] = (acc[risk.severity] || 0) + 1;
        return acc;
      },
      {} as Record<RiskSeverity, number>
    );

    const report = `
# Risk Assessment Report
Generated: ${new Date().toISOString()}

## Summary
- Total Risks: ${assessments.length}
- CRITICAL: ${bySeverity.CRITICAL || 0}
- HIGH: ${bySeverity.HIGH || 0}
- MEDIUM: ${bySeverity.MEDIUM || 0}
- LOW: ${bySeverity.LOW || 0}

## Open Risks (by Status)
${assessments
  .filter((r) => r.status === "OPEN")
  .map(
    (risk) => `
### ${risk.title}
- Severity: ${risk.severity}
- Likelihood: ${risk.likelihood}/5
- Impact: ${risk.impact}/5
- Score: ${risk.score}/25
- Category: ${risk.category}
- Description: ${risk.description}
- Mitigation: ${risk.mitigationStrategy || "Not defined"}
  `
  )
  .join("\n")}

## Mitigated Risks
${assessments.filter((r) => r.status === "MITIGATED").length} risks have been mitigated.

## Compliance Gaps
- GDPR: Check gaps
- HIPAA: Check gaps
- SOC2: Check gaps
- PCI DSS: Check gaps
    `;

    return report;
  }

  static async incidentTracker(incidentId: string, severity: RiskSeverity, description: string): Promise<void> {
    await prisma.incident.create({
      data: {
        incidentId,
        severity,
        description,
        reportedAt: new Date(),
        status: "OPEN",
      },
    });
  }
}
