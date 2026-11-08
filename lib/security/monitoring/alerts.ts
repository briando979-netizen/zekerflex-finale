import { Prisma } from "@prisma/client";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertChannel = "email" | "slack" | "sms" | "pagerduty" | "webhook";

export interface SecurityAlert {
  id: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  details: Record<string, any>;
  createdAt: Date;
  resolvedAt?: Date;
  channels: AlertChannel[];
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string; // e.g., "failed_login_attempts > 5"
  threshold: number;
  windowMs: number;
  severity: AlertSeverity;
  channels: AlertChannel[];
  enabled: boolean;
  evaluationInterval: number; // seconds
}

export class SecurityMonitoringSystem {
  private alerts: Map<string, SecurityAlert> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private metrics: Map<string, number> = new Map();

  createAlert(
    type: string,
    severity: AlertSeverity,
    message: string,
    details: Record<string, any>,
    channels: AlertChannel[]
  ): SecurityAlert {
    const alert: SecurityAlert = {
      id: `alert-${Date.now()}`,
      type,
      severity,
      message,
      details,
      createdAt: new Date(),
      channels,
      acknowledged: false,
    };

    this.alerts.set(alert.id, alert);

    // Send via configured channels
    if (severity === "critical") {
      this.escalateAlert(alert);
    } else {
      this.sendAlert(alert);
    }

    return alert;
  }

  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    return true;
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.resolvedAt = new Date();
    return true;
  }

  createRule(
    name: string,
    condition: string,
    threshold: number,
    severity: AlertSeverity,
    channels: AlertChannel[]
  ): AlertRule {
    const rule: AlertRule = {
      id: `rule-${Date.now()}`,
      name,
      condition,
      threshold,
      windowMs: 60000, // 1 minute window
      severity,
      channels,
      enabled: true,
      evaluationInterval: 30, // Check every 30 seconds
    };

    this.rules.set(rule.id, rule);
    return rule;
  }

  recordMetric(key: string, value: number): void {
    this.metrics.set(key, value);

    // Evaluate rules against metric
    for (const rule of this.rules.values()) {
      this.evaluateRule(rule);
    }
  }

  private evaluateRule(rule: AlertRule): void {
    // Parse rule condition and evaluate
    // Example: "failed_login_attempts > 5"

    const metric = this.metrics.get(rule.condition.split(" ")[0]);
    if (!metric) return;

    const operator = rule.condition.split(" ")[1];
    const threshold = rule.threshold;

    let triggered = false;
    switch (operator) {
      case ">":
        triggered = metric > threshold;
        break;
      case "<":
        triggered = metric < threshold;
        break;
      case ">=":
        triggered = metric >= threshold;
        break;
      case "<=":
        triggered = metric <= threshold;
        break;
      case "==":
        triggered = metric === threshold;
        break;
    }

    if (triggered) {
      this.createAlert(
        `rule:${rule.name}`,
        rule.severity,
        `Rule triggered: ${rule.name}`,
        { rule: rule.id, metric, threshold },
        rule.channels
      );
    }
  }

  private sendAlert(alert: SecurityAlert): void {
    // Send alert via configured channels
    if (alert.channels.includes("email")) {
      // Send email alert
    }
    if (alert.channels.includes("slack")) {
      // Send Slack notification
    }
    if (alert.channels.includes("sms")) {
      // Send SMS alert
    }
    if (alert.channels.includes("webhook")) {
      // Send webhook
    }
  }

  private escalateAlert(alert: SecurityAlert): void {
    // For critical alerts, escalate immediately
    // - Send to on-call engineer
    // - Page via PagerDuty
    // - Send SMS
    // - Notify management
  }

  getUnresolvedAlerts(): SecurityAlert[] {
    return Array.from(this.alerts.values()).filter((a) => !a.resolvedAt);
  }

  getAlertsBySeverity(severity: AlertSeverity): SecurityAlert[] {
    return Array.from(this.alerts.values()).filter((a) => a.severity === severity);
  }

  getOpenAlerts(hoursSince: number = 24): SecurityAlert[] {
    const cutoffTime = new Date(Date.now() - hoursSince * 60 * 60 * 1000);
    return Array.from(this.alerts.values()).filter(
      (a) => a.createdAt >= cutoffTime && !a.acknowledgedAt
    );
  }

  async setupAnomalyDetection(): Promise<void> {
    // Use machine learning to detect unusual patterns
    // - Failed login attempts spike
    // - Unusual API access patterns
    // - Database query anomalies
    // - Network traffic anomalies
  }

  async generateAlertReport(timeRange: { start: Date; end: Date }): Promise<any> {
    const alertsInRange = Array.from(this.alerts.values()).filter(
      (a) => a.createdAt >= timeRange.start && a.createdAt <= timeRange.end
    );

    return {
      period: timeRange,
      totalAlerts: alertsInRange.length,
      critical: alertsInRange.filter((a) => a.severity === "critical").length,
      warning: alertsInRange.filter((a) => a.severity === "warning").length,
      info: alertsInRange.filter((a) => a.severity === "info").length,
      avgResolutionTime: this.calculateAvgResolutionTime(alertsInRange),
    };
  }

  private calculateAvgResolutionTime(alerts: SecurityAlert[]): number {
    const resolved = alerts.filter((a) => a.resolvedAt && a.acknowledgedAt);
    if (resolved.length === 0) return 0;

    const totalTime = resolved.reduce((sum, a) => {
      if (!a.acknowledgedAt || !a.resolvedAt) return sum;
      return sum + (a.resolvedAt.getTime() - a.acknowledgedAt.getTime());
    }, 0);

    return totalTime / resolved.length / 1000 / 60; // in minutes
  }

  setupSLATracking(): void {
    // Track SLA compliance
    // Critical: response < 15 minutes, resolution < 1 hour
    // High: response < 1 hour, resolution < 4 hours
    // Medium: response < 4 hours, resolution < 24 hours
  }
}

export const securityMonitoring = new SecurityMonitoringSystem();

// Pre-configured rules
export const defaultRules = [
  {
    name: "Excessive failed logins",
    threshold: 5,
    severity: "high" as AlertSeverity,
  },
  {
    name: "Bulk data export",
    threshold: 10000, // rows
    severity: "warning" as AlertSeverity,
  },
  {
    name: "Database connection spike",
    threshold: 100,
    severity: "warning" as AlertSeverity,
  },
  {
    name: "API rate limit exceeded",
    threshold: 1000, // requests
    severity: "info" as AlertSeverity,
  },
  {
    name: "Privilege escalation attempt",
    threshold: 1,
    severity: "critical" as AlertSeverity,
  },
];
