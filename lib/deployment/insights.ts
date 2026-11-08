export interface Insight {
  id: string;
  type: "performance" | "reliability" | "security" | "optimization";
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  recommendation: string;
  impact: number;
  estimatedSavings?: number;
  createdAt: Date;
  resolved: boolean;
}

export interface PerformanceReport {
  timestamp: Date;
  avgBuildTime: number;
  avgTestTime: number;
  bundleSizeTrend: number;
  deploymentFrequency: number;
  successRate: number;
  insights: Insight[];
}

const insights: Map<string, Insight> = new Map();
let insightIdCounter = 1;

export function generateInsights(metrics: Record<string, number>): Insight[] {
  const generated: Insight[] = [];

  if (metrics.buildTime && metrics.buildTime > 300) {
    generated.push(
      createInsight(
        "performance",
        "Slow Build Times",
        "Build time exceeds recommended threshold",
        "high",
        "Consider optimizing TypeScript compilation or parallel builds",
        8,
        60
      )
    );
  }

  if (metrics.bundleSize && metrics.bundleSize > 500000) {
    generated.push(
      createInsight(
        "performance",
        "Large Bundle Size",
        "Application bundle size is above optimal",
        "medium",
        "Implement code splitting and lazy loading",
        7,
        120
      )
    );
  }

  if (metrics.testCoverage && metrics.testCoverage < 70) {
    generated.push(
      createInsight(
        "reliability",
        "Low Test Coverage",
        "Test coverage below recommended 80%",
        "medium",
        "Add tests for critical paths",
        6,
        0
      )
    );
  }

  if (metrics.errorRate && metrics.errorRate > 1) {
    generated.push(
      createInsight(
        "reliability",
        "High Error Rate",
        "Error rate above acceptable threshold",
        "critical",
        "Review recent changes and implement error handling",
        9,
        0
      )
    );
  }

  return generated;
}

export function createInsight(
  type: Insight["type"],
  title: string,
  description: string,
  severity: Insight["severity"],
  recommendation: string,
  impact: number,
  estimatedSavings?: number
): Insight {
  const id = `insight-${insightIdCounter++}`;

  const insight: Insight = {
    id,
    type,
    title,
    description,
    severity,
    recommendation,
    impact,
    estimatedSavings,
    createdAt: new Date(),
    resolved: false,
  };

  insights.set(id, insight);
  return insight;
}

export function getInsight(id: string): Insight | null {
  return insights.get(id) || null;
}

export function getAllInsights(resolved: boolean = false): Insight[] {
  let result = Array.from(insights.values());

  if (!resolved) {
    result = result.filter(i => !i.resolved);
  }

  return result.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

export function getInsightsByType(type: Insight["type"]): Insight[] {
  return Array.from(insights.values()).filter(i => i.type === type && !i.resolved);
}

export function resolveInsight(id: string): Insight | null {
  const insight = insights.get(id);
  if (!insight) return null;

  insight.resolved = true;
  return insight;
}

export function getImpactfulInsights(minImpact: number = 7): Insight[] {
  return Array.from(insights.values())
    .filter(i => i.impact >= minImpact && !i.resolved)
    .sort((a, b) => b.impact - a.impact);
}

export function getTotalEstimatedSavings(): number {
  return Array.from(insights.values())
    .filter(i => !i.resolved && i.estimatedSavings)
    .reduce((sum, i) => sum + (i.estimatedSavings || 0), 0);
}

export function generatePerformanceReport(metrics: Record<string, number>): PerformanceReport {
  const generatedInsights = generateInsights(metrics);

  return {
    timestamp: new Date(),
    avgBuildTime: metrics.buildTime || 0,
    avgTestTime: metrics.testTime || 0,
    bundleSizeTrend: metrics.bundleSize || 0,
    deploymentFrequency: metrics.deployments || 0,
    successRate: metrics.successRate || 100,
    insights: generatedInsights,
  };
}

export function getInsightStats() {
  const all = Array.from(insights.values());
  return {
    total: all.length,
    resolved: all.filter(i => i.resolved).length,
    active: all.filter(i => !i.resolved).length,
    critical: all.filter(i => i.severity === "critical" && !i.resolved).length,
    totalPotentialSavings: getTotalEstimatedSavings(),
    topIssues: getImpactfulInsights(8),
  };
}
