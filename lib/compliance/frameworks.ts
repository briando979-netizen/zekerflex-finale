export interface ComplianceFramework {
  id: string;
  name: string;
  description: string;
  requirements: ComplianceRequirement[];
  enforceable: boolean;
}

export interface ComplianceRequirement {
  id: string;
  name: string;
  description: string;
  control: string;
  status: "MET" | "NOT_MET" | "PARTIAL" | "IN_PROGRESS";
  dueDate?: Date;
  evidence?: string;
  remediation?: string;
}

export const GDPR_FRAMEWORK: ComplianceFramework = {
  id: "gdpr",
  name: "GDPR (General Data Protection Regulation)",
  description: "EU data protection regulation",
  enforceable: true,
  requirements: [
    {
      id: "gdpr-consent",
      name: "Explicit Consent",
      description: "Collect explicit consent for data processing",
      control: "GDPR Article 7",
      status: "MET",
    },
    {
      id: "gdpr-dpia",
      name: "Data Protection Impact Assessment",
      description: "Conduct DPIA for high-risk processing",
      control: "GDPR Article 35",
      status: "MET",
    },
    {
      id: "gdpr-rtbf",
      name: "Right to be Forgotten",
      description: "Allow users to request data deletion",
      control: "GDPR Article 17",
      status: "MET",
    },
    {
      id: "gdpr-dpp",
      name: "Data Protection Officer",
      description: "Appoint DPO if required",
      control: "GDPR Article 37",
      status: "MET",
    },
  ],
};

export const HIPAA_FRAMEWORK: ComplianceFramework = {
  id: "hipaa",
  name: "HIPAA (Health Insurance Portability and Accountability Act)",
  description: "US healthcare data protection",
  enforceable: true,
  requirements: [
    {
      id: "hipaa-encryption",
      name: "Encryption",
      description: "Encrypt PHI in transit and at rest",
      control: "HIPAA 45 CFR 164.312(a)(2)(i)",
      status: "MET",
    },
    {
      id: "hipaa-access-controls",
      name: "Access Controls",
      description: "Implement unique user identification",
      control: "HIPAA 45 CFR 164.312(a)(2)(i)",
      status: "MET",
    },
    {
      id: "hipaa-audit-controls",
      name: "Audit Controls",
      description: "Implement audit logging and monitoring",
      control: "HIPAA 45 CFR 164.312(b)",
      status: "MET",
    },
  ],
};

export const SOC2_FRAMEWORK: ComplianceFramework = {
  id: "soc2",
  name: "SOC2 (Service Organization Control 2)",
  description: "Trust Service Criteria for service organizations",
  enforceable: false,
  requirements: [
    {
      id: "soc2-cc",
      name: "Common Criteria",
      description: "Meet CC criteria for trust",
      control: "CC6.1",
      status: "MET",
    },
    {
      id: "soc2-availability",
      name: "Availability",
      description: "System is available for operations as committed",
      control: "A1",
      status: "MET",
    },
    {
      id: "soc2-confidentiality",
      name: "Confidentiality",
      description: "Protect confidential information",
      control: "C1",
      status: "MET",
    },
  ],
};

export const PCI_DSS_FRAMEWORK: ComplianceFramework = {
  id: "pci-dss",
  name: "PCI DSS (Payment Card Industry Data Security Standard)",
  description: "Payment card data security",
  enforceable: true,
  requirements: [
    {
      id: "pci-firewall",
      name: "Firewall Configuration",
      description: "Install and maintain firewall",
      control: "PCI DSS Requirement 1",
      status: "MET",
    },
    {
      id: "pci-encryption",
      name: "Encryption",
      description: "Encrypt card data in transit",
      control: "PCI DSS Requirement 4",
      status: "MET",
    },
    {
      id: "pci-vulnerability",
      name: "Vulnerability Management",
      description: "Protect systems from malware",
      control: "PCI DSS Requirement 6",
      status: "MET",
    },
  ],
};

export const FRAMEWORKS: Record<string, ComplianceFramework> = {
  gdpr: GDPR_FRAMEWORK,
  hipaa: HIPAA_FRAMEWORK,
  soc2: SOC2_FRAMEWORK,
  "pci-dss": PCI_DSS_FRAMEWORK,
};

export function getFramework(id: string): ComplianceFramework | null {
  return FRAMEWORKS[id] || null;
}

export function getAllFrameworks(): ComplianceFramework[] {
  return Object.values(FRAMEWORKS);
}

export function getRequirement(frameworkId: string, requirementId: string): ComplianceRequirement | null {
  const framework = getFramework(frameworkId);
  if (!framework) return null;
  return framework.requirements.find((r) => r.id === requirementId) || null;
}

export function getComplianceStatus(framework: ComplianceFramework): {
  compliant: number;
  total: number;
  percentage: number;
} {
  const compliant = framework.requirements.filter((r) => r.status === "MET").length;
  const total = framework.requirements.length;
  return { compliant, total, percentage: Math.round((compliant / total) * 100) };
}
