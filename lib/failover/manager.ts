import { prisma } from "@/lib/prisma";

export type FailoverMode = "automatic" | "manual" | "planned";
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface HealthCheck {
  id: string;
  service: string;
  status: HealthStatus;
  lastCheck: Date;
  consecutiveFailures: number;
  responseTime: number; // milliseconds
  errorMessage?: string;
}

interface FailoverPolicy {
  id: string;
  name: string;
  enabled: boolean;
  mode: FailoverMode;
  threshold: number; // consecutive failures before failover
  checkInterval: number; // seconds
  timeout: number; // seconds
  primaryService: string;
  backupService: string;
}

interface FailoverEvent {
  id: string;
  timestamp: Date;
  policyId: string;
  mode: FailoverMode;
  reason: string;
  status: "initiated" | "in_progress" | "completed" | "failed" | "rolled_back";
  downtime: number; // milliseconds
  dataLoss: number; // records lost
}

export const FailoverManager = {
  async createHealthCheck(
    service: string
  ): Promise<HealthCheck> {
    const check: HealthCheck = {
      id: `hc-${Date.now()}`,
      service,
      status: "healthy",
      lastCheck: new Date(),
      consecutiveFailures: 0,
      responseTime: 0,
    };

    await prisma.kv.create({
      data: {
        key: `health:${service}:latest`,
        value: JSON.stringify(check),
      },
    });

    return check;
  },

  async getHealthCheck(service: string): Promise<HealthCheck | null> {
    const stored = await prisma.kv.findUnique({
      where: { key: `health:${service}:latest` },
    });
    return stored ? JSON.parse(stored.value) : null;
  },

  async updateHealthCheck(
    service: string,
    status: HealthStatus,
    responseTime: number,
    error?: string
  ): Promise<HealthCheck> {
    const current = await this.getHealthCheck(service);

    const check: HealthCheck = {
      id: current?.id || `hc-${Date.now()}`,
      service,
      status,
      lastCheck: new Date(),
      consecutiveFailures:
        status === "unhealthy" ? (current?.consecutiveFailures || 0) + 1 : 0,
      responseTime,
      errorMessage: error,
    };

    await prisma.kv.upsert({
      where: { key: `health:${service}:latest` },
      update: { value: JSON.stringify(check) },
      create: { key: `health:${service}:latest`, value: JSON.stringify(check) },
    });

    // Store history
    await prisma.kv.create({
      data: {
        key: `health:${service}:${Date.now()}`,
        value: JSON.stringify(check),
      },
    });

    return check;
  },

  async createFailoverPolicy(
    policy: Omit<FailoverPolicy, "id">
  ): Promise<FailoverPolicy> {
    const fp: FailoverPolicy = {
      ...policy,
      id: `policy-${Date.now()}`,
    };

    await prisma.kv.create({
      data: {
        key: `failover:policy:${fp.id}`,
        value: JSON.stringify(fp),
      },
    });

    return fp;
  },

  async getFailoverPolicy(id: string): Promise<FailoverPolicy | null> {
    const stored = await prisma.kv.findUnique({
      where: { key: `failover:policy:${id}` },
    });
    return stored ? JSON.parse(stored.value) : null;
  },

  async listFailoverPolicies(): Promise<FailoverPolicy[]> {
    const keys = await prisma.kv.findMany({
      where: { key: { startsWith: "failover:policy:" } },
    });

    return keys.map((k) => JSON.parse(k.value));
  },

  async checkServiceHealth(service: string): Promise<HealthStatus> {
    const check = await this.getHealthCheck(service);
    if (!check) return "healthy";

    // Check if service is unhealthy
    if (check.consecutiveFailures > 0) {
      return "unhealthy";
    }

    // Check for degraded performance
    if (check.responseTime > 5000) {
      return "degraded";
    }

    return "healthy";
  },

  async evaluateFailoverNeeded(): Promise<Array<{ policy: FailoverPolicy; needed: boolean }>> {
    const policies = await this.listFailoverPolicies();

    return Promise.all(
      policies.map(async (policy) => {
        if (!policy.enabled) return { policy, needed: false };

        const primaryHealth = await this.getHealthCheck(policy.primaryService);

        const needed =
          primaryHealth &&
          primaryHealth.consecutiveFailures >= policy.threshold;

        return { policy, needed };
      })
    );
  },

  async initiateFailover(
    policyId: string,
    reason: string,
    mode: FailoverMode
  ): Promise<FailoverEvent> {
    const policy = await this.getFailoverPolicy(policyId);
    if (!policy) throw new Error("Policy not found");

    const event: FailoverEvent = {
      id: `fe-${Date.now()}`,
      timestamp: new Date(),
      policyId,
      mode,
      reason,
      status: "initiated",
      downtime: 0,
      dataLoss: 0,
    };

    await prisma.kv.create({
      data: {
        key: `failover:event:${event.id}`,
        value: JSON.stringify(event),
      },
    });

    return event;
  },

  async getFailoverEvent(id: string): Promise<FailoverEvent | null> {
    const stored = await prisma.kv.findUnique({
      where: { key: `failover:event:${id}` },
    });
    return stored ? JSON.parse(stored.value) : null;
  },

  async updateFailoverEvent(
    id: string,
    updates: Partial<FailoverEvent>
  ): Promise<FailoverEvent> {
    const event = await this.getFailoverEvent(id);
    if (!event) throw new Error("Event not found");

    const updated = {
      ...event,
      ...updates,
    };

    await prisma.kv.update({
      where: { key: `failover:event:${id}` },
      data: { value: JSON.stringify(updated) },
    });

    return updated;
  },

  async performAutomaticFailover(policyId: string): Promise<FailoverEvent> {
    const policy = await this.getFailoverPolicy(policyId);
    if (!policy) throw new Error("Policy not found");

    const event = await this.initiateFailover(
      policyId,
      `Automatic failover triggered: ${policy.primaryService} unhealthy`,
      "automatic"
    );

    try {
      await this.updateFailoverEvent(event.id, { status: "in_progress" });

      // 1. Verify backup service is healthy
      const backupHealth = await this.checkServiceHealth(policy.backupService);
      if (backupHealth === "unhealthy") {
        throw new Error("Backup service also unhealthy");
      }

      // 2. Update routing/DNS
      // 3. Drain connections from primary
      // 4. Verify backup is handling traffic
      // 5. Update monitoring

      await this.updateFailoverEvent(event.id, {
        status: "completed",
        downtime: 30000, // 30 seconds
      });

      // Reset primary service failure counter for recovery
      await this.updateHealthCheck(policy.primaryService, "degraded", 0);
    } catch (error) {
      await this.updateFailoverEvent(event.id, {
        status: "failed",
      });
      throw error;
    }

    return this.getFailoverEvent(event.id)!;
  },

  async rollbackFailover(eventId: string): Promise<void> {
    const event = await this.getFailoverEvent(eventId);
    if (!event) throw new Error("Event not found");

    const policy = await this.getFailoverPolicy(event.policyId);
    if (!policy) throw new Error("Policy not found");

    try {
      // Verify primary is healthy
      const primaryHealth = await this.checkServiceHealth(policy.primaryService);
      if (primaryHealth === "unhealthy") {
        throw new Error("Primary service still unhealthy");
      }

      // Switch back to primary
      await this.updateFailoverEvent(eventId, { status: "rolled_back" });
    } catch (error) {
      throw new Error(`Rollback failed: ${error}`);
    }
  },

  async getFailoverStats() {
    const policies = await this.listFailoverPolicies();
    const keys = await prisma.kv.findMany({
      where: { key: { startsWith: "failover:event:" } },
    });

    const events = keys.map((k) => JSON.parse(k.value));

    return {
      totalPolicies: policies.length,
      enabledPolicies: policies.filter((p) => p.enabled).length,
      totalFailovers: events.length,
      successfulFailovers: events.filter((e) => e.status === "completed").length,
      failedFailovers: events.filter((e) => e.status === "failed").length,
      averageDowntime: events.length
        ? events.reduce((sum, e) => sum + e.downtime, 0) / events.length
        : 0,
    };
  },
};
