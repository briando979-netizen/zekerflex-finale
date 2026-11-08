import { prisma } from "@/lib/prisma";
import { ComplianceFramework, ComplianceStatus } from "@prisma/client";
import type { ComplianceFrameworkStatus } from "./types";

export async function initializeFramework(
  tenantId: string,
  framework: ComplianceFramework,
  standards: string[]
): Promise<void> {
  const existing = await prisma.complianceFrameworkDefinition.findFirst({
    where: { tenantId, framework }
  });

  if (existing) return;

  await prisma.complianceFrameworkDefinition.create({
    data: {
      tenantId,
      framework,
      name: `${framework} Compliance`,
      standards,
      controls: {
        create: getControlsForFramework(framework).map(c => ({
          controlId: c.id,
          controlName: c.name,
          description: c.description,
          objective: c.objective,
          testProcedure: c.testProcedure
        }))
      }
    }
  });
}

export async function getFrameworkStatus(
  tenantId: string,
  framework: ComplianceFramework
): Promise<ComplianceFrameworkStatus | null> {
  const frameworkDef = await prisma.complianceFrameworkDefinition.findFirst({
    where: { tenantId, framework },
    include: { controls: { include: { checkResults: true } } }
  });

  if (!frameworkDef) return null;

  const total = frameworkDef.controls.length;
  const compliant = frameworkDef.controls.filter(
    c => c.status === ComplianceStatus.COMPLIANT
  ).length;

  const lastCheck = Math.max(
    ...frameworkDef.controls.map(c => c.lastCheckedAt?.getTime() ?? 0)
  );

  return {
    frameworkId: frameworkDef.id,
    framework: frameworkDef.framework,
    name: frameworkDef.name,
    controlsTotal: total,
    controlsCompliant: compliant,
    lastCheckedAt: lastCheck > 0 ? new Date(lastCheck) : null,
    compliancePercentage: total > 0 ? Math.round((compliant / total) * 100) : 0,
    status: compliant === total ? ComplianceStatus.COMPLIANT : ComplianceStatus.IN_PROGRESS
  };
}

export async function listFrameworks(tenantId: string): Promise<ComplianceFrameworkStatus[]> {
  const frameworks = await prisma.complianceFrameworkDefinition.findMany({
    where: { tenantId, isActive: true },
    include: { controls: { include: { checkResults: true } } }
  });

  return frameworks.map(fw => {
    const total = fw.controls.length;
    const compliant = fw.controls.filter(c => c.status === ComplianceStatus.COMPLIANT).length;
    const lastCheck = Math.max(
      ...fw.controls.map(c => c.lastCheckedAt?.getTime() ?? 0)
    );

    return {
      frameworkId: fw.id,
      framework: fw.framework,
      name: fw.name,
      controlsTotal: total,
      controlsCompliant: compliant,
      lastCheckedAt: lastCheck > 0 ? new Date(lastCheck) : null,
      compliancePercentage: total > 0 ? Math.round((compliant / total) * 100) : 0,
      status: compliant === total ? ComplianceStatus.COMPLIANT : ComplianceStatus.IN_PROGRESS
    };
  });
}

export async function updateControlStatus(
  controlId: string,
  status: ComplianceStatus,
  evidence: string | null,
  performedBy: string | null
): Promise<void> {
  const control = await prisma.complianceControl.findUnique({ where: { id: controlId } });
  if (!control) throw new Error("Control not found");

  await prisma.complianceControl.update({
    where: { id: controlId },
    data: {
      status,
      lastCheckedAt: new Date(),
      nextCheckDate: calculateNextCheckDate(status),
      checkResults: {
        create: {
          checkDate: new Date(),
          status,
          evidence,
          performedBy
        }
      }
    }
  });
}

function getControlsForFramework(framework: ComplianceFramework): Array<{
  id: string;
  name: string;
  description: string;
  objective: string;
  testProcedure: string;
}> {
  const controls: Record<ComplianceFramework, typeof controls> = {
    GDPR: [
      {
        id: "GDPR-1",
        name: "Data Processing Agreements",
        description: "Ensure DPAs are in place with all processors",
        objective: "Contractual protection for personal data",
        testProcedure: "Review DPA copies and verify signatures"
      },
      {
        id: "GDPR-2",
        name: "Privacy by Design",
        description: "Implement privacy-first design principles",
        objective: "Protect personal data from collection",
        testProcedure: "Audit system architecture and policies"
      },
      {
        id: "GDPR-3",
        name: "Data Subject Rights",
        description: "Enable access, rectification, erasure requests",
        objective: "Fulfill data subject obligations",
        testProcedure: "Test data export and deletion processes"
      }
    ],
    ISO27001: [
      {
        id: "ISO-1",
        name: "Information Security Policy",
        description: "Documented information security policy",
        objective: "Establish security governance",
        testProcedure: "Review policy document and approvals"
      },
      {
        id: "ISO-2",
        name: "Access Control",
        description: "Implement role-based access control",
        objective: "Restrict unauthorized system access",
        testProcedure: "Audit access lists and permissions"
      },
      {
        id: "ISO-3",
        name: "Incident Management",
        description: "Incident detection and response procedures",
        objective: "Minimize impact of security incidents",
        testProcedure: "Test incident response plan"
      }
    ],
    SOC2: [
      {
        id: "SOC2-1",
        name: "Security Program",
        description: "Comprehensive security program in place",
        objective: "Protect systems from unauthorized access",
        testProcedure: "Review and test security controls"
      },
      {
        id: "SOC2-2",
        name: "Change Management",
        description: "Controlled system change procedures",
        objective: "Prevent unauthorized modifications",
        testProcedure: "Audit change logs and approvals"
      },
      {
        id: "SOC2-3",
        name: "System Availability",
        description: "Maintain system availability and performance",
        objective: "Ensure operational resilience",
        testProcedure: "Review uptime metrics and backups"
      }
    ],
    NEN_7510: [
      {
        id: "NEN-1",
        name: "Information Governance",
        description: "Healthcare information governance",
        objective: "Protect patient data",
        testProcedure: "Review governance documentation"
      },
      {
        id: "NEN-2",
        name: "Risk Management",
        description: "Healthcare-specific risk assessments",
        objective: "Identify and mitigate healthcare risks",
        testProcedure: "Review risk register"
      },
      {
        id: "NEN-3",
        name: "Compliance Monitoring",
        description: "Ongoing compliance verification",
        objective: "Maintain healthcare standards",
        testProcedure: "Test monitoring procedures"
      }
    ],
    CCPA: [
      {
        id: "CCPA-1",
        name: "Consumer Rights",
        description: "Honor CCPA data subject rights",
        objective: "Fulfill California privacy law",
        testProcedure: "Test consumer request fulfillment"
      },
      {
        id: "CCPA-2",
        name: "Opt-Out Mechanism",
        description: "Implement sale opt-out functionality",
        objective: "Allow data sale prohibition",
        testProcedure: "Test opt-out process"
      },
      {
        id: "CCPA-3",
        name: "Notice Requirements",
        description: "Display required privacy notices",
        objective: "Inform consumers of data practices",
        testProcedure: "Verify privacy notices"
      }
    ],
    HIPAA: [
      {
        id: "HIPAA-1",
        name: "Protected Health Information",
        description: "Safeguard PHI data",
        objective: "Prevent unauthorized PHI access",
        testProcedure: "Audit PHI storage and transmission"
      },
      {
        id: "HIPAA-2",
        name: "Breach Notification",
        description: "Report PHI breaches within 60 days",
        objective: "Fulfill breach notification requirements",
        testProcedure: "Test breach notification process"
      },
      {
        id: "HIPAA-3",
        name: "Audit Controls",
        description: "Log and monitor PHI access",
        objective: "Detect unauthorized PHI access",
        testProcedure: "Review audit logs"
      }
    ],
    AVG: [
      {
        id: "AVG-1",
        name: "Rechtmatige grondslag",
        description: "Rechtmatige basis voor gegevensverwerking",
        objective: "Voldoen aan AVG verplichtingen",
        testProcedure: "Controleer verwerkingsbasis"
      },
      {
        id: "AVG-2",
        name: "Transparantie",
        description: "Transparante privacyverklaringen",
        objective: "Gegevenssujetten informeren",
        testProcedure: "Controleer privacybeleid"
      },
      {
        id: "AVG-3",
        name: "Gegevensveiligheid",
        description: "Veiligheidsmaatregelen gegevens",
        objective: "Bescherm persoonsgegevens",
        testProcedure: "Controleer beveiligingsmaatregelen"
      }
    ],
    CUSTOM: []
  };

  return controls[framework] ?? [];
}

function calculateNextCheckDate(status: ComplianceStatus): Date {
  const nextDate = new Date();
  if (status === ComplianceStatus.COMPLIANT) {
    nextDate.setDate(nextDate.getDate() + 90);
  } else {
    nextDate.setDate(nextDate.getDate() + 30);
  }
  return nextDate;
}
