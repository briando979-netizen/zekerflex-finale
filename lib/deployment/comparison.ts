export interface DeploymentDiff {
  field: string;
  oldValue: any;
  newValue: any;
  type: "added" | "removed" | "changed";
}

export interface DeploymentComparison {
  id: string;
  deploymentA: {
    id: string;
    version: string;
    timestamp: Date;
  };
  deploymentB: {
    id: string;
    version: string;
    timestamp: Date;
  };
  diffs: DeploymentDiff[];
  metrics: {
    buildTimeDiff: number;
    testTimeDiff: number;
    bundleSizeDiff: number;
    successRateDiff: number;
  };
  createdAt: Date;
}

export function compareDeployments(
  depA: Record<string, any>,
  depB: Record<string, any>
): DeploymentDiff[] {
  const diffs: DeploymentDiff[] = [];

  const allKeys = new Set([...Object.keys(depA), ...Object.keys(depB)]);

  for (const key of allKeys) {
    const oldValue = depA[key];
    const newValue = depB[key];

    if (!(key in depA)) {
      diffs.push({ field: key, oldValue: undefined, newValue, type: "added" });
    } else if (!(key in depB)) {
      diffs.push({ field: key, oldValue, newValue: undefined, type: "removed" });
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      diffs.push({ field: key, oldValue, newValue, type: "changed" });
    }
  }

  return diffs;
}

export function calculateMetricsDiff(
  metricsA: Record<string, number>,
  metricsB: Record<string, number>
): Record<string, number> {
  return {
    buildTimeDiff: (metricsB.buildTime || 0) - (metricsA.buildTime || 0),
    testTimeDiff: (metricsB.testTime || 0) - (metricsA.testTime || 0),
    bundleSizeDiff: (metricsB.bundleSize || 0) - (metricsA.bundleSize || 0),
    successRateDiff: (metricsB.successRate || 0) - (metricsA.successRate || 0),
  };
}

export function createComparison(
  deploymentAId: string,
  deploymentAVersion: string,
  deploymentATimestamp: Date,
  deploymentBId: string,
  deploymentBVersion: string,
  deploymentBTimestamp: Date,
  diffs: DeploymentDiff[],
  metrics: Record<string, number>
): DeploymentComparison {
  return {
    id: `comp-${Date.now()}`,
    deploymentA: {
      id: deploymentAId,
      version: deploymentAVersion,
      timestamp: deploymentATimestamp,
    },
    deploymentB: {
      id: deploymentBId,
      version: deploymentBVersion,
      timestamp: deploymentBTimestamp,
    },
    diffs,
    metrics: {
      buildTimeDiff: metrics.buildTimeDiff || 0,
      testTimeDiff: metrics.testTimeDiff || 0,
      bundleSizeDiff: metrics.bundleSizeDiff || 0,
      successRateDiff: metrics.successRateDiff || 0,
    },
    createdAt: new Date(),
  };
}

export function generateComparisonReport(comparison: DeploymentComparison): string {
  const lines: string[] = [];

  lines.push("DEPLOYMENT COMPARISON REPORT");
  lines.push("============================\n");

  lines.push(`Deployment A: ${comparison.deploymentA.version} (${comparison.deploymentA.timestamp.toISOString()})`);
  lines.push(`Deployment B: ${comparison.deploymentB.version} (${comparison.deploymentB.timestamp.toISOString()})\n`);

  lines.push("METRICS CHANGES:");
  lines.push(`- Build Time: ${comparison.metrics.buildTimeDiff > 0 ? "+" : ""}${comparison.metrics.buildTimeDiff}ms`);
  lines.push(`- Test Time: ${comparison.metrics.testTimeDiff > 0 ? "+" : ""}${comparison.metrics.testTimeDiff}ms`);
  lines.push(`- Bundle Size: ${comparison.metrics.bundleSizeDiff > 0 ? "+" : ""}${comparison.metrics.bundleSizeDiff}bytes`);
  lines.push(`- Success Rate: ${comparison.metrics.successRateDiff > 0 ? "+" : ""}${comparison.metrics.successRateDiff.toFixed(2)}%\n`);

  const added = comparison.diffs.filter(d => d.type === "added");
  const removed = comparison.diffs.filter(d => d.type === "removed");
  const changed = comparison.diffs.filter(d => d.type === "changed");

  if (added.length > 0) {
    lines.push(`ADDED (${added.length}):`);
    for (const diff of added) {
      lines.push(`+ ${diff.field}: ${JSON.stringify(diff.newValue)}`);
    }
    lines.push("");
  }

  if (removed.length > 0) {
    lines.push(`REMOVED (${removed.length}):`);
    for (const diff of removed) {
      lines.push(`- ${diff.field}: ${JSON.stringify(diff.oldValue)}`);
    }
    lines.push("");
  }

  if (changed.length > 0) {
    lines.push(`CHANGED (${changed.length}):`);
    for (const diff of changed) {
      lines.push(`~ ${diff.field}:`);
      lines.push(`  Old: ${JSON.stringify(diff.oldValue)}`);
      lines.push(`  New: ${JSON.stringify(diff.newValue)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function analyzeDeploymentChanges(comparison: DeploymentComparison): {
  riskLevel: "low" | "medium" | "high";
  recommendations: string[];
  issues: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (comparison.metrics.buildTimeDiff > 50) {
    issues.push("Build time increased significantly");
    recommendations.push("Review build optimization opportunities");
  }

  if (comparison.metrics.bundleSizeDiff > 100000) {
    issues.push("Bundle size increased substantially");
    recommendations.push("Check for new dependencies or code duplication");
  }

  if (comparison.metrics.successRateDiff < -5) {
    issues.push("Success rate decreased");
    recommendations.push("Investigate failed deployments and tests");
  }

  if (comparison.diffs.length > 20) {
    recommendations.push("Large number of changes, verify compatibility");
  }

  let riskLevel: "low" | "medium" | "high" = "low";
  if (issues.length > 2 || comparison.metrics.successRateDiff < -10) {
    riskLevel = "high";
  } else if (issues.length > 0) {
    riskLevel = "medium";
  }

  return { riskLevel, recommendations, issues };
}
