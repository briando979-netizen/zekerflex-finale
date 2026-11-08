interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration?: number; // milliseconds
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  escalationPolicy?: string;
}

interface Alert {
  id: string;
  ruleId: string;
  timestamp: number;
  value: number;
  severity: string;
  message: string;
  resolved?: boolean;
  resolvedAt?: number;
}

const rules: Map<string, AlertRule> = new Map();
const alerts: Alert[] = [];
const generateId = (): string => Math.random().toString(36).substring(2, 15);

export const createAlertRule = (rule: Omit<AlertRule, 'id'>): AlertRule => {
  const id = generateId();
  const fullRule: AlertRule = { ...rule, id };
  rules.set(id, fullRule);
  return fullRule;
};

export const updateAlertRule = (id: string, updates: Partial<AlertRule>): void => {
  const rule = rules.get(id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  Object.assign(rule, updates);
};

export const deleteAlertRule = (id: string): void => {
  rules.delete(id);
};

export const getAlertRules = (): AlertRule[] => Array.from(rules.values());

export const evaluateMetric = (metricName: string, value: number): void => {
  for (const rule of rules.values()) {
    if (!rule.enabled || rule.metric !== metricName) continue;

    const matches = (() => {
      switch (rule.condition) {
        case 'gt':
          return value > rule.threshold;
        case 'lt':
          return value < rule.threshold;
        case 'eq':
          return value === rule.threshold;
        case 'gte':
          return value >= rule.threshold;
        case 'lte':
          return value <= rule.threshold;
        default:
          return false;
      }
    })();

    if (matches) {
      triggerAlert(rule, value);
    }
  }
};

export const triggerAlert = (rule: AlertRule, value: number): void => {
  const alert: Alert = {
    id: generateId(),
    ruleId: rule.id,
    timestamp: Date.now(),
    value,
    severity: rule.severity,
    message: `${rule.name}: ${value} ${rule.condition} ${rule.threshold}`,
  };
  alerts.push(alert);
};

export const resolveAlert = (alertId: string): void => {
  const alert = alerts.find((a) => a.id === alertId);
  if (alert) {
    alert.resolved = true;
    alert.resolvedAt = Date.now();
  }
};

export const getAlerts = (
  filter?: { severity?: string; resolved?: boolean }
): Alert[] => {
  return alerts.filter((a) => {
    if (filter?.severity && a.severity !== filter.severity) return false;
    if (filter?.resolved !== undefined && a.resolved !== filter.resolved) return false;
    return true;
  });
};

export const getActiveAlerts = (): Alert[] => getAlerts({ resolved: false });

export const clearResolvedAlerts = (): void => {
  const index = alerts.findIndex((a) => !a.resolved);
  if (index > 0) alerts.splice(0, index);
};
