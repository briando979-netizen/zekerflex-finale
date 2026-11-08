import type { RegionCode } from "@/lib/i18n/global/detector";
import { getRegionalConfig } from "@/lib/regions/config";

export interface ComplianceRequirement {
  id: string;
  name: string;
  description: string;
  required: boolean;
  checklist: string[];
}

export const COMPLIANCE_FRAMEWORKS: Record<string, ComplianceRequirement> = {
  GDPR: {
    id: "GDPR",
    name: "General Data Protection Regulation",
    description: "EU data protection regulation",
    required: true,
    checklist: [
      "Right to access",
      "Right to be forgotten",
      "Data portability",
      "Consent management",
      "Privacy policy",
      "Data processing agreements",
      "DPA (Data Processing Agreement)",
      "User consent tracking",
      "Cookie consent",
      "Data breach notification (72h)",
    ],
  },
  CCPA: {
    id: "CCPA",
    name: "California Consumer Privacy Act",
    description: "California data protection law",
    required: true,
    checklist: [
      "Right to know",
      "Right to delete",
      "Right to opt-out",
      "Privacy policy",
      "Do Not Sell notice",
      "Consumer rights requests",
      "Non-discrimination",
      "Data minimization",
    ],
  },
  LGPD: {
    id: "LGPD",
    name: "Lei Geral de Proteção de Dados",
    description: "Brazilian data protection law",
    required: true,
    checklist: [
      "Legitimate purpose",
      "Data minimization",
      "Transparency",
      "User rights",
      "Data deletion",
      "Security measures",
      "Incident notification",
      "Privacy policy",
    ],
  },
  SOC2: {
    id: "SOC2",
    name: "SOC 2 Compliance",
    description: "Service Organization Control compliance",
    required: false,
    checklist: [
      "Access controls",
      "Logical security",
      "Data integrity",
      "Availability controls",
      "Confidentiality controls",
      "Privacy controls",
      "Audit trails",
      "Incident response",
    ],
  },
  ISO27001: {
    id: "ISO27001",
    name: "ISO 27001 Certification",
    description: "Information security management",
    required: false,
    checklist: [
      "Information security policy",
      "Access control",
      "Cryptography",
      "Physical security",
      "Incident management",
      "Business continuity",
      "Supplier relations",
      "Compliance monitoring",
    ],
  },
};

export function getRequiredCompliance(region: RegionCode): ComplianceRequirement[] {
  const config = getRegionalConfig(region);
  const requirements: ComplianceRequirement[] = [];

  if (config.gdprEnabled) {
    requirements.push(COMPLIANCE_FRAMEWORKS.GDPR);
  }

  if (config.ccpaEnabled) {
    requirements.push(COMPLIANCE_FRAMEWORKS.CCPA);
  }

  if (region === "BR") {
    requirements.push(COMPLIANCE_FRAMEWORKS.LGPD);
  }

  return requirements;
}

export class ComplianceManager {
  private region: RegionCode;

  constructor(region: RegionCode) {
    this.region = region;
  }

  canStore(dataType: string): boolean {
    const config = getRegionalConfig(this.region);

    if (dataType === "sensitive" && config.gdprEnabled) {
      return false;
    }

    return true;
  }

  getDataRetentionDays(dataType: string): number {
    const config = getRegionalConfig(this.region);

    if (config.gdprEnabled) {
      switch (dataType) {
        case "logs":
          return 90;
        case "analytics":
          return 365;
        case "sensitive":
          return 30;
        default:
          return 2555;
      }
    }

    return 2555;
  }

  shouldEncrypt(dataType: string): boolean {
    return true;
  }

  requiresConsent(dataType: string): boolean {
    const config = getRegionalConfig(this.region);

    if (config.gdprEnabled || config.ccpaEnabled) {
      return dataType === "marketing" || dataType === "analytics" || dataType === "tracking";
    }

    return false;
  }

  getPrivacyNoticeUrl(): string {
    return `/privacy/${this.region.toLowerCase()}`;
  }

  getTermsUrl(): string {
    return `/terms/${this.region.toLowerCase()}`;
  }

  getCookieNoticeRequired(): boolean {
    const config = getRegionalConfig(this.region);
    return config.gdprEnabled || config.ccpaEnabled;
  }
}

export function getComplianceManager(region: RegionCode): ComplianceManager {
  return new ComplianceManager(region);
}
