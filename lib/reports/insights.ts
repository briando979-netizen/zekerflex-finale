import { z } from "zod";

export const PredictiveInsightSchema = z.object({
  type: z.enum(["anomaly", "trend", "forecast", "recommendation", "alert"]),
  metric: z.string(),
  current: z.number(),
  expected: z.number(),
  deviation: z.number(),
  confidence: z.number(),
  message: z.string(),
  suggestedAction: z.string().optional(),
});

export type PredictiveInsight = z.infer<typeof PredictiveInsightSchema>;

export function detectAnomalies(
  data: Array<{ date: string; value: number }>
): PredictiveInsight[] {
  const insights: PredictiveInsight[] = [];
  const values = data.map((d) => d.value);
  const mean = values.reduce((a, b) => a + b) / values.length;
  const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2)) / values.length);

  data.forEach((point, i) => {
    const zScore = Math.abs((point.value - mean) / stdDev);
    if (zScore > 2.5) {
      insights.push({
        type: "anomaly",
        metric: "value",
        current: point.value,
        expected: mean,
        deviation: ((point.value - mean) / mean) * 100,
        confidence: Math.min(0.95, zScore / 3),
        message: `Anomaly detected on ${point.date}: ${point.value.toFixed(2)} (${((point.value - mean) / mean * 100).toFixed(1)}% deviation)`,
        suggestedAction: `Review data for ${point.date}`,
      });
    }
  });

  return insights;
}

export function forecastTrend(
  data: Array<{ date: string; value: number }>,
  periods: number = 7
): Array<{ date: string; value: number; confidence: number }> {
  const values = data.map((d) => d.value);
  const n = values.length;

  // Simple linear regression
  const sumX = (n * (n + 1)) / 2;
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = values.reduce((sum, v, i) => sum + v * (i + 1), 0);
  const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const forecast = Array.from({ length: periods }, (_, i) => {
    const x = n + i + 1;
    const value = intercept + slope * x;
    const confidence = Math.max(0.5, 1 - (i + 1) / periods);
    return { value: Math.max(0, value), confidence };
  });

  // Add dates
  const lastDate = new Date(data[n - 1].date);
  return forecast.map((f, i) => {
    const date = new Date(lastDate);
    date.setDate(date.getDate() + i + 1);
    return {
      date: date.toISOString().split("T")[0],
      value: f.value,
      confidence: f.confidence,
    };
  });
}

export function generateRecommendations(
  metrics: Record<string, number>,
  targets: Record<string, number>
): PredictiveInsight[] {
  const recommendations: PredictiveInsight[] = [];

  Object.entries(metrics).forEach(([key, value]) => {
    const target = targets[key];
    if (target) {
      const deviation = ((value - target) / target) * 100;

      if (deviation < -20) {
        recommendations.push({
          type: "recommendation",
          metric: key,
          current: value,
          expected: target,
          deviation,
          confidence: 0.8,
          message: `${key} is ${Math.abs(deviation).toFixed(1)}% below target`,
          suggestedAction: `Consider strategies to increase ${key}`,
        });
      } else if (deviation > 30) {
        recommendations.push({
          type: "recommendation",
          metric: key,
          current: value,
          expected: target,
          deviation,
          confidence: 0.8,
          message: `${key} is ${deviation.toFixed(1)}% above target`,
          suggestedAction: `Monitor ${key} to ensure sustainability`,
        });
      }
    }
  });

  return recommendations;
}

export function compareMetrics(
  current: Record<string, number>,
  previous: Record<string, number>
): PredictiveInsight[] {
  const insights: PredictiveInsight[] = [];

  Object.entries(current).forEach(([key, value]) => {
    const prevValue = previous[key];
    if (prevValue) {
      const changePercent = ((value - prevValue) / prevValue) * 100;
      if (Math.abs(changePercent) > 5) {
        insights.push({
          type: "trend",
          metric: key,
          current: value,
          expected: prevValue,
          deviation: changePercent,
          confidence: 0.85,
          message: `${key} ${changePercent > 0 ? "increased" : "decreased"} by ${Math.abs(changePercent).toFixed(1)}%`,
        });
      }
    }
  });

  return insights;
}

export function projectGrowth(
  data: Array<{ date: string; value: number }>,
  metric: string
): PredictiveInsight {
  const forecast = forecastTrend(data, 30);
  const currentTrend = forecast[forecast.length - 1].value;
  const baseline = data[0].value;
  const growthRate = ((currentTrend - baseline) / baseline) * 100;

  return {
    type: "forecast",
    metric,
    current: data[data.length - 1].value,
    expected: currentTrend,
    deviation: growthRate,
    confidence: 0.7,
    message: `${metric} projected to reach ${currentTrend.toFixed(0)} (${growthRate.toFixed(1)}% growth) in 30 days`,
  };
}
