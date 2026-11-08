import { ComplianceFramework, ComplianceStatus, AuditFrequency, RiskLevel } from "@prisma/client";

export interface ComplianceFrameworkStatus {
  frameworkId: string;
  framework: ComplianceFramework;
  name: string;
  controlsTotal: number;
  controlsCompliant: number;
  lastCheckedAt: Date | null;
  compliancePercentage: number;
  status: ComplianceStatus;
}

export interface AuditResult {
  auditId: string;
  scheduleId: string;
  executionDate: Date;
  completedDate: Date | null;
  findingsCount: number;
  criticalCount: number;
  status: string;
  overallRating: string | null;
}

export interface RiskMetrics {
  totalRisks: number;
  criticalRisks: number;
  highRisks: number;
  averageRiskScore: number;
  mitigatedCount: number;
  monitoringActive: number;
}

export interface PolicyState {
  policyId: string;
  policyName: string;
  status: string;
  effectiveDate: Date | null;
  reviewDate: Date | null;
  approvalProgress: number;
  approvalsRemaining: number;
}

export interface AttestationStatus {
  attestationId: string;
  certificationName: string;
  issueDate: Date;
  expirationDate: Date;
  daysUntilExpiry: number;
  isExpired: boolean;
  lastValidationDate: Date | null;
  validationResult: string | null;
}

export interface ReportingStatus {
  reportId: string;
  reportType: string;
  reportingPeriod: string;
  dueDate: Date | null;
  status: string;
  filedDate: Date | null;
  alertsCount: number;
  criticalAlertsCount: number;
}

export interface ComplianceDashboard {
  frameworks: ComplianceFrameworkStatus[];
  recentAudits: AuditResult[];
  riskMetrics: RiskMetrics;
  policiesReview: PolicyState[];
  attestationsExpiring: AttestationStatus[];
  reportsDue: ReportingStatus[];
  overallComplianceScore: number;
  lastUpdated: Date;
}
