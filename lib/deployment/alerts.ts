export type AlertLevel = "info" | "warning" | "critical";
export type AlertChannel = "email" | "slack" | "webhook" | "dashboard";

export interface Alert {
  id: string;
  deploymentId?: string;
  level: AlertLevel;
  title: string;
  message: string;
  channels: AlertChannel[];
  createdAt: Date;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  channels: AlertChannel[];
  enabled: boolean;
  createdAt: Date;
}

const alerts: Map<string, Alert> = new Map();
const rules: Map<string, AlertRule> = new Map();
let alertIdCounter = 1;
let ruleIdCounter = 1;

export function createAlert(
  level: AlertLevel,
  title: string,
  message: string,
  channels: AlertChannel[] = ["dashboard"],
  deploymentId?: string,
  metadata?: Record<string, any>
): Alert {
  const id = `alert-${alertIdCounter++}`;

  const alert: Alert = {
    id,
    deploymentId,
    level,
    title,
    message,
    channels,
    createdAt: new Date(),
    metadata,
  };

  alerts.set(id, alert);
  triggerNotifications(alert);

  return alert;
}

export function getAlert(id: string): Alert | null {
  return alerts.get(id) || null;
}

export function getAllAlerts(
  resolved: boolean = false,
  level?: AlertLevel
): Alert[] {
  let result = Array.from(alerts.values());

  if (!resolved) {
    result = result.filter(a => !a.resolvedAt);
  }

  if (level) {
    result = result.filter(a => a.level === level);
  }

  return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function resolveAlert(id: string): Alert | null {
  const alert = alerts.get(id);
  if (!alert) return null;

  alert.resolvedAt = new Date();
  return alert;
}

export function getDeploymentAlerts(deploymentId: string): Alert[] {
  return Array.from(alerts.values()).filter(a => a.deploymentId === deploymentId);
}

export function createAlertRule(
  name: string,
  condition: string,
  threshold: number,
  channels: AlertChannel[] = ["dashboard"]
): AlertRule {
  const id = `rule-${ruleIdCounter++}`;

  const rule: AlertRule = {
    id,
    name,
    condition,
    threshold,
    channels,
    enabled: true,
    createdAt: new Date(),
  };

  rules.set(id, rule);
  return rule;
}

export function getRule(id: string): AlertRule | null {
  return rules.get(id) || null;
}

export function listRules(): AlertRule[] {
  return Array.from(rules.values()).filter(r => r.enabled);
}

export function toggleRule(id: string): AlertRule | null {
  const rule = rules.get(id);
  if (!rule) return null;

  rule.enabled = !rule.enabled;
  return rule;
}

export function deleteRule(id: string): boolean {
  return rules.delete(id);
}

export function evaluateAlertRules(metrics: Record<string, number>): Alert[] {
  const triggered: Alert[] = [];

  for (const rule of listRules()) {
    const isTriggered = evaluateCondition(rule.condition, metrics, rule.threshold);

    if (isTriggered) {
      const alert = createAlert(
        "warning",
        rule.name,
        `Alert rule "${rule.name}" triggered`,
        rule.channels,
        undefined,
        { rule: rule.id, metrics }
      );
      triggered.push(alert);
    }
  }

  return triggered;
}

function evaluateCondition(condition: string, metrics: Record<string, number>, threshold: number): boolean {
  try {
    const value = metrics[condition] || 0;
    return value > threshold;
  } catch {
    return false;
  }
}

function triggerNotifications(alert: Alert): void {
  if (alert.channels.includes("email")) {
    sendEmailNotification(alert);
  }
  if (alert.channels.includes("slack")) {
    sendSlackNotification(alert);
  }
  if (alert.channels.includes("webhook")) {
    sendWebhookNotification(alert);
  }

  console.log(`[ALERT] ${alert.level.toUpperCase()}: ${alert.title} - ${alert.message}`);
}

function sendEmailNotification(alert: Alert): void {
  console.log(`Email alert: ${alert.title}`);
}

function sendSlackNotification(alert: Alert): void {
  console.log(`Slack alert: ${alert.title}`);
}

function sendWebhookNotification(alert: Alert): void {
  console.log(`Webhook alert: ${alert.title}`);
}

export function getAlertStats() {
  const allAlerts = Array.from(alerts.values());
  return {
    totalAlerts: allAlerts.length,
    activeAlerts: allAlerts.filter(a => !a.resolvedAt).length,
    criticalAlerts: allAlerts.filter(a => a.level === "critical" && !a.resolvedAt).length,
    rules: Array.from(rules.values()).filter(r => r.enabled).length,
  };
}

export function resolveAlertsByDeployment(deploymentId: string): number {
  const deployment = Array.from(alerts.values()).filter(
    a => a.deploymentId === deploymentId && !a.resolvedAt
  );

  for (const alert of deployment) {
    alert.resolvedAt = new Date();
  }

  return deployment.length;
}
