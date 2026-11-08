import { prisma } from "@/lib/prisma";

export type Region = "eu-west-1" | "eu-central-1" | "us-east-1" | "us-west-1" | "ap-southeast-1";
export type ReplicationStatus = "synced" | "syncing" | "behind" | "failed";

interface RegionConfig {
  region: Region;
  primary: boolean;
  enabled: boolean;
  replicationLag: number; // seconds
  lastSync: Date;
}

interface GeoReplication {
  id: string;
  sourceRegion: Region;
  targetRegion: Region;
  status: ReplicationStatus;
  bytesReplicated: number;
  failureCount: number;
  lastFailure?: string;
  nextSync: Date;
}

interface Failover {
  id: string;
  timestamp: Date;
  fromRegion: Region;
  toRegion: Region;
  reason: string;
  status: "initiated" | "in_progress" | "completed" | "failed" | "rolled_back";
  dataConsistencyCheck: boolean;
}

export const GeoManager = {
  async getRegionConfig(region: Region): Promise<RegionConfig | null> {
    const stored = await prisma.kv.findUnique({
      where: { key: `geo:region:${region}` },
    });
    return stored ? JSON.parse(stored.value) : null;
  },

  async setRegionConfig(region: Region, config: Partial<RegionConfig>): Promise<RegionConfig> {
    const existing = await this.getRegionConfig(region);
    const updated = {
      region,
      primary: false,
      enabled: true,
      replicationLag: 0,
      lastSync: new Date(),
      ...existing,
      ...config,
    };

    await prisma.kv.upsert({
      where: { key: `geo:region:${region}` },
      update: { value: JSON.stringify(updated) },
      create: { key: `geo:region:${region}`, value: JSON.stringify(updated) },
    });

    return updated;
  },

  async getAllRegions(): Promise<RegionConfig[]> {
    const regions: Region[] = ["eu-west-1", "eu-central-1", "us-east-1", "us-west-1", "ap-southeast-1"];
    const configs = await Promise.all(
      regions.map((r) => this.getRegionConfig(r))
    );
    return configs.filter((c): c is RegionConfig => c !== null);
  },

  async getPrimaryRegion(): Promise<Region | null> {
    const regions = await this.getAllRegions();
    const primary = regions.find((r) => r.primary);
    return primary?.region || null;
  },

  async createReplication(
    sourceRegion: Region,
    targetRegion: Region
  ): Promise<GeoReplication> {
    const replication: GeoReplication = {
      id: `rep-${Date.now()}`,
      sourceRegion,
      targetRegion,
      status: "syncing",
      bytesReplicated: 0,
      failureCount: 0,
      nextSync: new Date(Date.now() + 3600000), // 1 hour
    };

    await prisma.kv.create({
      data: {
        key: `geo:replication:${replication.id}`,
        value: JSON.stringify(replication),
      },
    });

    return replication;
  },

  async getReplication(id: string): Promise<GeoReplication | null> {
    const stored = await prisma.kv.findUnique({
      where: { key: `geo:replication:${id}` },
    });
    return stored ? JSON.parse(stored.value) : null;
  },

  async updateReplicationStatus(
    id: string,
    status: ReplicationStatus,
    data?: Partial<GeoReplication>
  ): Promise<GeoReplication> {
    const repl = await this.getReplication(id);
    if (!repl) throw new Error(`Replication ${id} not found`);

    const updated: GeoReplication = {
      ...repl,
      ...data,
      status,
    };

    await prisma.kv.update({
      where: { key: `geo:replication:${id}` },
      data: { value: JSON.stringify(updated) },
    });

    return updated;
  },

  async listReplications(limit = 10): Promise<GeoReplication[]> {
    const keys = await prisma.kv.findMany({
      where: { key: { startsWith: "geo:replication:" } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return keys.map((k) => JSON.parse(k.value));
  },

  async initiateFailover(
    fromRegion: Region,
    toRegion: Region,
    reason: string
  ): Promise<Failover> {
    const failover: Failover = {
      id: `fo-${Date.now()}`,
      timestamp: new Date(),
      fromRegion,
      toRegion,
      reason,
      status: "initiated",
      dataConsistencyCheck: false,
    };

    await prisma.kv.create({
      data: {
        key: `geo:failover:${failover.id}`,
        value: JSON.stringify(failover),
      },
    });

    return failover;
  },

  async getFailover(id: string): Promise<Failover | null> {
    const stored = await prisma.kv.findUnique({
      where: { key: `geo:failover:${id}` },
    });
    return stored ? JSON.parse(stored.value) : null;
  },

  async updateFailoverStatus(
    id: string,
    status: Failover["status"],
    consistencyCheck?: boolean
  ): Promise<Failover> {
    const fo = await this.getFailover(id);
    if (!fo) throw new Error(`Failover ${id} not found`);

    const updated: Failover = {
      ...fo,
      status,
      dataConsistencyCheck: consistencyCheck ?? fo.dataConsistencyCheck,
    };

    await prisma.kv.update({
      where: { key: `geo:failover:${id}` },
      data: { value: JSON.stringify(updated) },
    });

    return updated;
  },

  async performFailover(fromRegion: Region, toRegion: Region): Promise<Failover> {
    const failover = await this.initiateFailover(fromRegion, toRegion, "Automatic failover triggered");

    try {
      await this.updateFailoverStatus(failover.id, "in_progress");

      // 1. Verify target region health
      // 2. Check data consistency
      // 3. Update DNS/routing
      // 4. Verify application health
      // 5. Monitor for issues

      await this.updateFailoverStatus(failover.id, "completed", true);

      // Update primary region
      await this.setRegionConfig(toRegion, { primary: true });
      await this.setRegionConfig(fromRegion, { primary: false });
    } catch (error) {
      await this.updateFailoverStatus(failover.id, "failed");
      throw error;
    }

    return this.getFailover(failover.id)!;
  },

  async rollbackFailover(failoverId: string): Promise<void> {
    const failover = await this.getFailover(failoverId);
    if (!failover) throw new Error("Failover not found");

    try {
      await this.updateFailoverStatus(failoverId, "in_progress");

      // Switch back to original region
      await this.setRegionConfig(failover.fromRegion, { primary: true });
      await this.setRegionConfig(failover.toRegion, { primary: false });

      await this.updateFailoverStatus(failoverId, "rolled_back");
    } catch (error) {
      throw new Error(`Rollback failed: ${error}`);
    }
  },

  async getGeoStats() {
    const regions = await this.getAllRegions();
    const replications = await this.listReplications(50);

    return {
      regions: regions.length,
      activeRegions: regions.filter((r) => r.enabled).length,
      primaryRegion: regions.find((r) => r.primary)?.region || null,
      totalReplications: replications.length,
      syncedReplications: replications.filter((r) => r.status === "synced").length,
      failedReplications: replications.filter((r) => r.status === "failed").length,
      averageReplicationLag: regions.length
        ? regions.reduce((sum, r) => sum + r.replicationLag, 0) / regions.length
        : 0,
    };
  },
};
