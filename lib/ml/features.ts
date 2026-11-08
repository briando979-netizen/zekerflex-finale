export interface Feature {
  name: string;
  value: number;
  type: "numeric" | "categorical" | "boolean";
}

export interface FeatureSet {
  features: Feature[];
  timestamp: Date;
  userId?: string;
}

export function extractNumericFeatures(data: Record<string, unknown>): Feature[] {
  return Object.entries(data)
    .filter(([, v]) => typeof v === "number")
    .map(([name, value]) => ({
      name,
      value: value as number,
      type: "numeric",
    }));
}

export function extractCategoricalFeatures(
  data: Record<string, unknown>
): Feature[] {
  return Object.entries(data)
    .filter(([, v]) => typeof v === "string")
    .map(([name, value]) => ({
      name,
      value: hashString(value as string),
      type: "categorical",
    }));
}

export function extractBooleanFeatures(data: Record<string, unknown>): Feature[] {
  return Object.entries(data)
    .filter(([, v]) => typeof v === "boolean")
    .map(([name, value]) => ({
      name,
      value: (value as boolean) ? 1 : 0,
      type: "boolean",
    }));
}

export function normalizeFeatures(features: Feature[]): Feature[] {
  const numericFeatures = features.filter((f) => f.type === "numeric");

  if (numericFeatures.length === 0) return features;

  const min = Math.min(...numericFeatures.map((f) => f.value));
  const max = Math.max(...numericFeatures.map((f) => f.value));
  const range = max - min || 1;

  return features.map((f) => {
    if (f.type === "numeric") {
      return { ...f, value: (f.value - min) / range };
    }
    return f;
  });
}

export function standardizeFeatures(features: Feature[]): Feature[] {
  const numericFeatures = features.filter((f) => f.type === "numeric");

  if (numericFeatures.length === 0) return features;

  const mean =
    numericFeatures.reduce((sum, f) => sum + f.value, 0) /
    numericFeatures.length;
  const variance =
    numericFeatures.reduce((sum, f) => sum + Math.pow(f.value - mean, 2), 0) /
    numericFeatures.length;
  const stdDev = Math.sqrt(variance) || 1;

  return features.map((f) => {
    if (f.type === "numeric") {
      return { ...f, value: (f.value - mean) / stdDev };
    }
    return f;
  });
}

export function selectTopFeatures(
  features: Feature[],
  topK: number = 10
): Feature[] {
  return features
    .sort(
      (a, b) =>
        Math.abs(b.value) - Math.abs(a.value) ||
        (a.name < b.name ? -1 : 1)
    )
    .slice(0, topK);
}

export function createTimeSeriesFeatures(
  values: number[],
  window: number = 7
): Feature[] {
  const features: Feature[] = [];

  if (values.length >= window) {
    const recent = values.slice(-window);
    const mean = recent.reduce((a, b) => a + b, 0) / window;
    features.push({ name: `rolling_mean_${window}`, value: mean, type: "numeric" });

    const variance = recent.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / window;
    features.push({ name: `rolling_variance_${window}`, value: variance, type: "numeric" });
  }

  if (values.length >= 2) {
    const trend = values[values.length - 1]! - values[values.length - 2]!;
    features.push({ name: "trend", value: trend, type: "numeric" });
  }

  const volatility = Math.max(...values) - Math.min(...values);
  features.push({ name: "volatility", value: volatility, type: "numeric" });

  return features;
}

export function createStatisticalFeatures(values: number[]): Feature[] {
  if (values.length === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mode = getMostCommon(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const skewness = calculateSkewness(values, mean, stdDev);
  const kurtosis = calculateKurtosis(values, mean, stdDev);

  return [
    { name: "mean", value: mean, type: "numeric" },
    { name: "median", value: median, type: "numeric" },
    { name: "mode", value: mode, type: "numeric" },
    { name: "stddev", value: stdDev, type: "numeric" },
    { name: "skewness", value: skewness, type: "numeric" },
    { name: "kurtosis", value: kurtosis, type: "numeric" },
  ];
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash) / 2147483647;
}

function getMostCommon(values: number[]): number {
  const counts: Record<number, number> = {};
  let maxCount = 0;
  let mostCommon = values[0] ?? 0;

  for (const v of values) {
    counts[v] = (counts[v] ?? 0) + 1;
    if (counts[v]! > maxCount) {
      maxCount = counts[v]!;
      mostCommon = v;
    }
  }

  return mostCommon;
}

function calculateSkewness(
  values: number[],
  mean: number,
  stdDev: number
): number {
  if (stdDev === 0 || values.length === 0) return 0;
  const m3 = values.reduce((sum, v) => sum + Math.pow(v - mean, 3), 0) / values.length;
  return m3 / Math.pow(stdDev, 3);
}

function calculateKurtosis(
  values: number[],
  mean: number,
  stdDev: number
): number {
  if (stdDev === 0 || values.length === 0) return 0;
  const m4 = values.reduce((sum, v) => sum + Math.pow(v - mean, 4), 0) / values.length;
  return m4 / Math.pow(stdDev, 4) - 3;
}
