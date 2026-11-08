/**
 * TypeScript type definitions for the deployment system
 */

export interface TestResult {
  pass: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  coverage: number;
}

export interface LintResult {
  errors: number;
  warnings: number;
  success: boolean;
}

export interface BuildResult {
  success: boolean;
  duration: number;
  artifactSize?: number;
  output?: string;
}

export interface PipelineResult {
  success: boolean;
  stages: Array<{ name: string; success: boolean; duration: number }>;
  totalDuration: number;
  timestamp: Date;
}

export interface HealthMetrics {
  responseTime: number;
  errorRate: number;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: Date;
}

export interface DeploymentReport {
  status: "success" | "failure";
  timestamp: Date;
  duration: number;
  stages: Array<{ name: string; success: boolean }>;
  message: string;
}

export interface Alert {
  id: string;
  level: "info" | "warning" | "critical";
  title: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

export interface DeploymentTemplate {
  id: string;
  name: string;
  branch: string;
  environment: "development" | "staging" | "production";
  steps: Array<{ name: string; command: string; timeout: number }>;
}

export interface Insight {
  id: string;
  type: "performance" | "reliability" | "security" | "optimization";
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  recommendation: string;
  impact: number;
}

export interface SLAMetrics {
  uptime: number;
  deploymentSuccessRate: number;
  avgBuildTime: number;
  avgTestTime: number;
  avgResponseTime: number;
  period: string;
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  actor: string;
  resource: string;
  result: "success" | "failure";
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}

export interface DeploymentComparison {
  deploymentA: { version: string; timestamp: Date };
  deploymentB: { version: string; timestamp: Date };
  diffs: Array<{ field: string; oldValue: any; newValue: any }>;
  metrics: {
    buildTimeDiff: number;
    bundleSizeDiff: number;
  };
}

export interface DeploymentConfig {
  branch: string;
  environment: "development" | "staging" | "production";
  autoRollback: boolean;
  notifyOnCompletion: boolean;
  slaTargets?: {
    uptime: number;
    successRate: number;
  };
}

export interface DeploymentEvent {
  type:
    | "deployment.started"
    | "deployment.completed"
    | "deployment.failed"
    | "test.completed"
    | "build.completed"
    | "alert.created";
  timestamp: Date;
  deploymentId?: string;
  data: Record<string, any>;
}
