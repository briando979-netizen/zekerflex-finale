import { EventEmitter } from "events";
import { prisma } from "@/lib/prisma";

export interface RealtimeEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: Record<string, unknown>;
  tenantId: string;
}

export interface DashboardSubscription {
  dashboardId: string;
  userId: string;
  metrics: string[];
  refreshInterval: number;
}

// Real-time data store
class RealtimeDataStore extends EventEmitter {
  private subscribers: Map<string, Set<DashboardSubscription>> = new Map();
  private metricCache: Map<string, any> = new Map();
  private updateIntervals: Map<string, NodeJS.Timer> = new Map();

  subscribe(subscription: DashboardSubscription) {
    const key = `${subscription.dashboardId}:${subscription.userId}`;

    if (!this.subscribers.has(subscription.dashboardId)) {
      this.subscribers.set(subscription.dashboardId, new Set());
    }

    this.subscribers.get(subscription.dashboardId)!.add(subscription);

    // Start refresh interval if not already running
    if (!this.updateIntervals.has(subscription.dashboardId)) {
      this.startRefreshInterval(
        subscription.dashboardId,
        subscription.refreshInterval
      );
    }

    return key;
  }

  unsubscribe(dashboardId: string, userId: string) {
    const subscribers = this.subscribers.get(dashboardId);
    if (!subscribers) return;

    const toRemove = Array.from(subscribers).find((s) => s.userId === userId);
    if (toRemove) {
      subscribers.delete(toRemove);
    }

    // Stop refresh if no more subscribers
    if (subscribers.size === 0) {
      this.stopRefreshInterval(dashboardId);
      this.subscribers.delete(dashboardId);
    }
  }

  private startRefreshInterval(dashboardId: string, interval: number) {
    const timer = setInterval(async () => {
      await this.refreshDashboardData(dashboardId);
    }, interval * 1000);

    this.updateIntervals.set(dashboardId, timer);
  }

  private stopRefreshInterval(dashboardId: string) {
    const timer = this.updateIntervals.get(dashboardId);
    if (timer) {
      clearInterval(timer);
      this.updateIntervals.delete(dashboardId);
    }
  }

  private async refreshDashboardData(dashboardId: string) {
    try {
      const dashboard = await prisma.dashboard.findUnique({
        where: { id: dashboardId },
      });

      if (!dashboard) return;

      const updatedData = await this.fetchMetrics(dashboard);
      this.emit("data-update", { dashboardId, data: updatedData });
    } catch (err) {
      console.error("Failed to refresh dashboard data:", err);
    }
  }

  private async fetchMetrics(dashboard: any): Promise<Record<string, any>> {
    const widgets = dashboard.widgets || [];
    const data: Record<string, any> = {};

    for (const widget of widgets) {
      if (widget.type === "metric") {
        data[widget.id] = await this.getMetricValue(widget.config);
      } else if (widget.type === "chart") {
        data[widget.id] = await this.getChartData(widget.config);
      }
    }

    return data;
  }

  private async getMetricValue(config: any): Promise<number> {
    const cacheKey = JSON.stringify(config);

    if (this.metricCache.has(cacheKey)) {
      return this.metricCache.get(cacheKey);
    }

    // Fetch from database based on metric configuration
    // This is a placeholder - real implementation would query actual metrics
    const value = Math.random() * 100;
    this.metricCache.set(cacheKey, value);

    return value;
  }

  private async getChartData(config: any): Promise<any[]> {
    // Placeholder - real implementation would fetch chart data
    return [
      { name: "Jan", value: Math.random() * 100 },
      { name: "Feb", value: Math.random() * 100 },
      { name: "Mar", value: Math.random() * 100 },
    ];
  }

  getSubscriberCount(dashboardId: string): number {
    return this.subscribers.get(dashboardId)?.size || 0;
  }

  getAllSubscriptions(): DashboardSubscription[] {
    const all: DashboardSubscription[] = [];
    for (const subs of this.subscribers.values()) {
      all.push(...Array.from(subs));
    }
    return all;
  }

  clearCache() {
    this.metricCache.clear();
  }

  closeAll() {
    for (const timer of this.updateIntervals.values()) {
      clearInterval(timer);
    }
    this.updateIntervals.clear();
    this.subscribers.clear();
    this.metricCache.clear();
  }
}

// Singleton instance
let dataStore: RealtimeDataStore | null = null;

export function getRealtimeDataStore(): RealtimeDataStore {
  if (!dataStore) {
    dataStore = new RealtimeDataStore();
  }
  return dataStore;
}

// WebSocket handler for live updates
export async function handleRealtimeConnection(
  ws: any,
  dashboardId: string,
  userId: string,
  refreshInterval: number = 5
) {
  const store = getRealtimeDataStore();

  const subscription: DashboardSubscription = {
    dashboardId,
    userId,
    metrics: [],
    refreshInterval,
  };

  const subKey = store.subscribe(subscription);

  // Send initial data
  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
  });

  if (dashboard) {
    ws.send(
      JSON.stringify({
        type: "dashboard-data",
        data: dashboard.widgets,
      })
    );
  }

  // Listen for data updates
  const updateHandler = (event: any) => {
    if (event.dashboardId === dashboardId) {
      ws.send(
        JSON.stringify({
          type: "metrics-update",
          data: event.data,
        })
      );
    }
  };

  store.on("data-update", updateHandler);

  // Handle close
  ws.onclose = () => {
    store.off("data-update", updateHandler);
    store.unsubscribe(dashboardId, userId);
  };

  return subKey;
}

// Stream metrics for export
export async function* streamMetrics(
  reportId: string,
  chunkSize: number = 100
): AsyncGenerator<any[]> {
  try {
    const report = await prisma.customReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    // Placeholder: In real implementation, stream data from database
    let offset = 0;
    while (true) {
      const chunk = [
        // would be real data from database
      ];

      if (chunk.length === 0) break;

      yield chunk;
      offset += chunkSize;
    }
  } catch (err) {
    console.error("Failed to stream metrics:", err);
    throw err;
  }
}

// Real-time alert system
export class RealtimeAlertSystem {
  private intervals: Map<string, NodeJS.Timer> = new Map();

  async startMonitoring(alertRuleId: string, checkInterval: number = 60) {
    try {
      const alertRule = await prisma.alertRule?.findUnique?.({
        where: { id: alertRuleId },
      });

      if (!alertRule || !alertRule.isActive) return;

      const timer = setInterval(async () => {
        await this.checkAlert(alertRuleId);
      }, checkInterval * 1000);

      this.intervals.set(alertRuleId, timer);
    } catch (err) {
      console.error("Failed to start alert monitoring:", err);
    }
  }

  private async checkAlert(alertRuleId: string) {
    try {
      const alertRule = await prisma.alertRule?.findUnique?.({
        where: { id: alertRuleId },
      });

      if (!alertRule) return;

      // Get current metric value
      const metricValue = await this.getMetricValue(alertRule.metric);

      // Check threshold
      let triggered = false;
      switch (alertRule.condition) {
        case "gt":
          triggered = metricValue > alertRule.threshold;
          break;
        case "lt":
          triggered = metricValue < alertRule.threshold;
          break;
        case "eq":
          triggered = metricValue === alertRule.threshold;
          break;
        case "range":
          triggered =
            metricValue >= (alertRule.thresholdMin || 0) &&
            metricValue <= (alertRule.thresholdMax || Infinity);
          break;
      }

      if (triggered) {
        await this.triggerAlert(alertRuleId, metricValue);
      }
    } catch (err) {
      console.error("Failed to check alert:", err);
    }
  }

  private async triggerAlert(alertRuleId: string, value: number) {
    try {
      const alertRule = await prisma.alertRule?.findUnique?.({
        where: { id: alertRuleId },
      });

      if (!alertRule) return;

      // Create alert event
      await prisma.alertEvent?.create?.({
        data: {
          alertRuleId,
          value,
          severity: "warning",
          message: `Alert triggered: ${alertRule.name} (value: ${value})`,
        },
      });

      // Send notifications
      // In production, send email, Slack, etc.
    } catch (err) {
      console.error("Failed to trigger alert:", err);
    }
  }

  private async getMetricValue(metricName: string): Promise<number> {
    // Placeholder: Fetch metric value from database
    return Math.random() * 100;
  }

  stopMonitoring(alertRuleId: string) {
    const timer = this.intervals.get(alertRuleId);
    if (timer) {
      clearInterval(timer);
      this.intervals.delete(alertRuleId);
    }
  }

  stopAll() {
    for (const timer of this.intervals.values()) {
      clearInterval(timer);
    }
    this.intervals.clear();
  }
}

export const alertSystem = new RealtimeAlertSystem();
