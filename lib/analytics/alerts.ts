import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { type Prisma } from "@prisma/client";

/**
 * Alerts & Thresholds — KPI monitoring, anomaly detection, breach notifications.
 */

export interface AlertRuleConfig {
  name: string;
  metric: string; // "shift_application_rate", "avg_worker_rating", etc.
  condition: "gt" | "lt" | "eq" | "range";
  threshold: number;
  thresholdMin?: number;
  thresholdMax?: number;
  checkFrequency: "realtime" | "hourly" | "daily";
  notifyVia: ("email" | "push" | "webhook" | "slack")[];
  recipients: string[];
}

export interface MetricValue {
  metric: string;
  value: number;
  timestamp: Date;
  dimensions?: Record<string, string>;
}

/**
 * Create an alert rule.
 */
export async function createAlertRule(
  tenantId: string,
  userId: string,
  config: AlertRuleConfig,
): Promise<string> {
  try {
    const rule = await prisma.alertRule.create({
      data: {
        tenantId,
        createdByUserId: userId,
        name: config.name,
        metric: config.metric,
        condition: config.condition,
        threshold: config.threshold,
        thresholdMin: config.thresholdMin,
        thresholdMax: config.thresholdMax,
        checkFrequency: config.checkFrequency,
        notifyVia: config.notifyVia,
        recipients: config.recipients,
      },
    });

    logger.info(`Alert rule created: ${config.name}`, {
      ruleId: rule.id,
      metric: config.metric,
      condition: config.condition,
    });
    return rule.id;
  } catch (err) {
    logger.error("Failed to create alert rule", {
      error: (err as Error).message,
      name: config.name,
    });
    throw err;
  }
}

/**
 * Update an alert rule.
 */
export async function updateAlertRule(
  ruleId: string,
  updates: Partial<AlertRuleConfig>,
): Promise<void> {
  try {
    await prisma.alertRule.update({
      where: { id: ruleId },
      data: {
        name: updates.name,
        metric: updates.metric,
        condition: updates.condition,
        threshold: updates.threshold,
        thresholdMin: updates.thresholdMin,
        thresholdMax: updates.thresholdMax,
        checkFrequency: updates.checkFrequency,
        notifyVia: updates.notifyVia,
        recipients: updates.recipients,
      },
    });

    logger.info(`Alert rule updated: ${ruleId}`);
  } catch (err) {
    logger.error("Failed to update alert rule", {
      error: (err as Error).message,
      ruleId,
    });
    throw err;
  }
}

/**
 * Disable/enable an alert rule.
 */
export async function setAlertRuleActive(ruleId: string, isActive: boolean): Promise<void> {
  try {
    await prisma.alertRule.update({
      where: { id: ruleId },
      data: { isActive },
    });

    logger.info(`Alert rule ${isActive ? "enabled" : "disabled"}: ${ruleId}`);
  } catch (err) {
    logger.error("Failed to update alert rule status", {
      error: (err as Error).message,
      ruleId,
    });
    throw err;
  }
}

/**
 * Check if a metric value breaches an alert rule.
 */
export function checkThreshold(rule: AlertRuleConfig, value: number): boolean {
  switch (rule.condition) {
    case "gt":
      return value > rule.threshold;
    case "lt":
      return value < rule.threshold;
    case "eq":
      return value === rule.threshold;
    case "range":
      return value >= (rule.thresholdMin ?? 0) && value <= (rule.thresholdMax ?? 999999);
    default:
      return false;
  }
}

/**
 * Evaluate a metric against all active rules and trigger alerts.
 */
export async function evaluateMetric(metricValue: MetricValue): Promise<void> {
  try {
    // In a real system, fetch active rules for this metric
    // For now, fetch all active rules (filtered by metric in the db query)
    const rules = await prisma.alertRule.findMany({
      where: {
        isActive: true,
        metric: metricValue.metric,
      },
    });

    for (const rule of rules) {
      const ruleConfig: AlertRuleConfig = {
        name: rule.name,
        metric: rule.metric,
        condition: rule.condition as "gt" | "lt" | "eq" | "range",
        threshold: rule.threshold,
        thresholdMin: rule.thresholdMin ?? undefined,
        thresholdMax: rule.thresholdMax ?? undefined,
        checkFrequency: rule.checkFrequency as "realtime" | "hourly" | "daily",
        notifyVia: rule.notifyVia as ("email" | "push" | "webhook" | "slack")[],
        recipients: rule.recipients,
      };

      if (checkThreshold(ruleConfig, metricValue.value)) {
        // Trigger alert
        await triggerAlert(rule.id, metricValue, ruleConfig);
      }
    }
  } catch (err) {
    logger.error("Failed to evaluate metric", {
      error: (err as Error).message,
      metric: metricValue.metric,
    });
  }
}

/**
 * Trigger an alert and record the event.
 */
export async function triggerAlert(
  ruleId: string,
  metricValue: MetricValue,
  rule: AlertRuleConfig,
): Promise<string> {
  try {
    const severity = determineSeverity(rule, metricValue.value);
    const message = buildAlertMessage(rule, metricValue);

    const alert = await prisma.alertEvent.create({
      data: {
        alertRuleId: ruleId,
        severity,
        value: metricValue.value,
        message,
      },
    });

    // Update rule's trigger count
    await prisma.alertRule.update({
      where: { id: ruleId },
      data: {
        triggeredCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    });

    // Send notifications (email, push, etc.)
    await sendAlertNotifications(rule, severity, message);

    logger.info(`Alert triggered: ${rule.name}`, {
      alertId: alert.id,
      ruleId,
      severity,
      value: metricValue.value,
    });

    return alert.id;
  } catch (err) {
    logger.error("Failed to trigger alert", {
      error: (err as Error).message,
      ruleId,
    });
    throw err;
  }
}

/**
 * Resolve an alert.
 */
export async function resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
  try {
    await prisma.alertEvent.update({
      where: { id: alertId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy,
      },
    });

    logger.info(`Alert resolved: ${alertId}`);
  } catch (err) {
    logger.error("Failed to resolve alert", {
      error: (err as Error).message,
      alertId,
    });
    throw err;
  }
}

/**
 * List active/recent alerts for a rule.
 */
export async function listAlerts(
  ruleId: string,
  includeResolved = false,
  offset = 0,
  limit = 50,
): Promise<Array<{ id: string; severity: string; message: string; createdAt: Date }>> {
  try {
    const alerts = await prisma.alertEvent.findMany({
      where: {
        alertRuleId: ruleId,
        ...(includeResolved ? {} : { isResolved: false }),
      },
      select: {
        id: true,
        severity: true,
        message: true,
        createdAt: true,
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return alerts;
  } catch (err) {
    logger.error("Failed to list alerts", {
      error: (err as Error).message,
      ruleId,
    });
    return [];
  }
}

/**
 * Delete an alert rule and its events.
 */
export async function deleteAlertRule(ruleId: string): Promise<void> {
  try {
    await prisma.alertEvent.deleteMany({
      where: { alertRuleId: ruleId },
    });

    await prisma.alertRule.delete({
      where: { id: ruleId },
    });

    logger.info(`Alert rule deleted: ${ruleId}`);
  } catch (err) {
    logger.error("Failed to delete alert rule", {
      error: (err as Error).message,
      ruleId,
    });
    throw err;
  }
}

// === Helpers ===

function determineSeverity(rule: AlertRuleConfig, value: number): string {
  // Simple severity logic: could be more sophisticated based on breach magnitude
  if (rule.condition === "gt" && value > rule.threshold * 1.5) {
    return "critical";
  }
  if (rule.condition === "lt" && value < rule.threshold * 0.5) {
    return "critical";
  }
  return "warning";
}

function buildAlertMessage(rule: AlertRuleConfig, metricValue: MetricValue): string {
  let message = `${rule.name}: `;

  switch (rule.condition) {
    case "gt":
      message += `value ${metricValue.value} exceeds threshold ${rule.threshold}`;
      break;
    case "lt":
      message += `value ${metricValue.value} falls below threshold ${rule.threshold}`;
      break;
    case "eq":
      message += `value ${metricValue.value} equals threshold ${rule.threshold}`;
      break;
    case "range":
      message += `value ${metricValue.value} outside range [${rule.thresholdMin}, ${rule.thresholdMax}]`;
      break;
  }

  return message;
}

async function sendAlertNotifications(
  rule: AlertRuleConfig,
  severity: string,
  message: string,
): Promise<void> {
  // In a real system, send emails, push notifications, webhook calls, etc.
  logger.info("Would send alert notifications", {
    rule: rule.name,
    severity,
    channels: rule.notifyVia,
    recipients: rule.recipients.length,
  });

  // Placeholder for actual notification implementation
  // Examples:
  // - if (rule.notifyVia.includes('email')) { await sendEmail(...); }
  // - if (rule.notifyVia.includes('slack')) { await postToSlack(...); }
}
