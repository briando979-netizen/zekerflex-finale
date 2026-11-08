/**
 * Feature Engineering Pipeline
 *
 * Automated feature selection, dimensionality reduction, and data preprocessing.
 * Handles missing values, scaling, encoding, and feature selection strategies.
 */

import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Feature Engineering Types
// ---------------------------------------------------------------------------

export enum FeatureType {
  NUMERIC = "numeric",
  CATEGORICAL = "categorical",
  TEMPORAL = "temporal",
  GEOSPATIAL = "geospatial",
  TEXT = "text",
  BINARY = "binary",
}

export enum EncodingStrategy {
  ONE_HOT = "one_hot",
  LABEL = "label",
  TARGET = "target",
  FREQUENCY = "frequency",
  ORDINAL = "ordinal",
}

export enum ScalingStrategy {
  STANDARD = "standard",
  MIN_MAX = "min_max",
  ROBUST = "robust",
  LOG = "log",
  NONE = "none",
}

export interface FeatureDefinition {
  name: string;
  type: FeatureType;
  nullable: boolean;
  cardinality?: number; // For categorical features
  range?: [number, number]; // For numeric features
  encoding?: EncodingStrategy;
  scaling?: ScalingStrategy;
  weight?: number; // Feature importance weight
}

export interface FeatureSet {
  id: string;
  name: string;
  version: number;
  features: FeatureDefinition[];
  createdAt: Date;
  updatedAt: Date;
  stats?: FeatureSetStats;
}

export interface FeatureSetStats {
  totalFeatures: number;
  numericFeatures: number;
  categoricalFeatures: number;
  missingDataPercentage: Record<string, number>;
  correlationMatrix?: number[][];
}

export interface PreprocessingConfig {
  handleMissing: "mean" | "median" | "forward_fill" | "drop";
  scaling: ScalingStrategy;
  removeOutliers: boolean;
  outlierThreshold: number; // Standard deviations
  dimensionalityReduction?: {
    method: "pca" | "tsne" | "umap";
    targetDimensions: number;
  };
}

// ---------------------------------------------------------------------------
// Feature Engineering Pipeline
// ---------------------------------------------------------------------------

/**
 * Extract and calculate features from raw data
 */
export function extractFeatures(
  data: Record<string, unknown>[],
  definitions: FeatureDefinition[]
): Record<string, unknown>[] {
  try {
    return data.map((row) => {
      const features: Record<string, unknown> = {};

      for (const def of definitions) {
        const value = row[def.name];

        if (def.type === FeatureType.TEMPORAL) {
          features[def.name] = extractTemporalFeatures(value as string | Date);
        } else if (def.type === FeatureType.NUMERIC) {
          features[def.name] = extractNumericFeatures(value as number, def);
        } else if (def.type === FeatureType.CATEGORICAL) {
          features[def.name] = value;
        } else {
          features[def.name] = value;
        }
      }

      return features;
    });
  } catch (err) {
    logger.error("Feature extraction failed", { error: err });
    throw AppError.internal("Feature extraction failed");
  }
}

/**
 * Extract temporal features from a date/time value
 */
export function extractTemporalFeatures(
  value: string | Date
): Record<string, unknown> {
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    if (isNaN(date.getTime())) {
      return {};
    }

    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      dayOfWeek: date.getDay(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      quarter: Math.floor((date.getMonth() + 1) / 4),
      dayOfYear: Math.floor(
        (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
          86400000
      ),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isHoliday: isHoliday(date),
    };
  } catch (err) {
    logger.error("Temporal feature extraction failed", { error: err });
    return {};
  }
}

/**
 * Extract numeric features and statistics
 */
export function extractNumericFeatures(
  value: number,
  definition: FeatureDefinition
): Record<string, unknown> {
  if (typeof value !== "number" || isNaN(value)) {
    return { isNull: true };
  }

  const features: Record<string, unknown> = {
    value,
    isNull: false,
  };

  if (definition.range) {
    features.normalized =
      (value - definition.range[0]) / (definition.range[1] - definition.range[0]);
  }

  return features;
}

/**
 * Encode categorical variables
 */
export function encodeCategorical(
  data: Record<string, unknown>[],
  feature: string,
  strategy: EncodingStrategy
): Record<string, unknown>[] {
  try {
    const uniqueValues = [...new Set(data.map((row) => row[feature]))];

    if (strategy === EncodingStrategy.ONE_HOT) {
      return data.map((row) => {
        const encoded: Record<string, unknown> = { ...row };
        uniqueValues.forEach((value) => {
          encoded[`${feature}_${value}`] = row[feature] === value ? 1 : 0;
        });
        delete encoded[feature];
        return encoded;
      });
    } else if (strategy === EncodingStrategy.LABEL) {
      const labelMap = Object.fromEntries(
        uniqueValues.map((val, idx) => [val, idx])
      );
      return data.map((row) => ({
        ...row,
        [feature]: labelMap[row[feature] as string | number],
      }));
    } else if (strategy === EncodingStrategy.FREQUENCY) {
      const freqMap = Object.fromEntries(
        uniqueValues.map((val) => [
          val,
          data.filter((r) => r[feature] === val).length,
        ])
      );
      return data.map((row) => ({
        ...row,
        [feature]: freqMap[row[feature] as string | number],
      }));
    }

    return data;
  } catch (err) {
    logger.error("Categorical encoding failed", { error: err });
    throw AppError.internal("Categorical encoding failed");
  }
}

/**
 * Scale numeric features
 */
export function scaleFeatures(
  data: Record<string, number>[],
  feature: string,
  strategy: ScalingStrategy
): Record<string, number>[] {
  try {
    const values = data
      .map((row) => row[feature] as number)
      .filter((v) => typeof v === "number" && !isNaN(v));

    if (values.length === 0) return data;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(
      values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length
    );
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (strategy === ScalingStrategy.STANDARD) {
      return data.map((row) => ({
        ...row,
        [feature]: std === 0 ? 0 : (row[feature] - mean) / std,
      }));
    } else if (strategy === ScalingStrategy.MIN_MAX) {
      const range = max - min;
      return data.map((row) => ({
        ...row,
        [feature]: range === 0 ? 0 : (row[feature] - min) / range,
      }));
    } else if (strategy === ScalingStrategy.ROBUST) {
      const q1 = values.sort((a, b) => a - b)[Math.floor(values.length * 0.25)];
      const q3 = values.sort((a, b) => a - b)[Math.floor(values.length * 0.75)];
      const iqr = q3 - q1;
      return data.map((row) => ({
        ...row,
        [feature]: iqr === 0 ? 0 : (row[feature] - mean) / iqr,
      }));
    } else if (strategy === ScalingStrategy.LOG) {
      return data.map((row) => ({
        ...row,
        [feature]: row[feature] > 0 ? Math.log(row[feature]) : 0,
      }));
    }

    return data;
  } catch (err) {
    logger.error("Feature scaling failed", { error: err });
    throw AppError.internal("Feature scaling failed");
  }
}

/**
 * Remove or impute missing values
 */
export function handleMissingValues(
  data: Record<string, unknown>[],
  column: string,
  strategy: "mean" | "median" | "forward_fill" | "drop"
): Record<string, unknown>[] {
  try {
    const numericValues = data
      .map((row) => row[column] as number)
      .filter((v) => typeof v === "number" && !isNaN(v));

    if (numericValues.length === 0) {
      if (strategy === "drop") {
        return data.filter((row) => row[column] != null);
      }
      return data;
    }

    let fillValue: number | undefined;

    if (strategy === "mean") {
      fillValue = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    } else if (strategy === "median") {
      const sorted = numericValues.sort((a, b) => a - b);
      fillValue =
        numericValues.length % 2 === 0
          ? (sorted[numericValues.length / 2 - 1] +
              sorted[numericValues.length / 2]) /
            2
          : sorted[Math.floor(numericValues.length / 2)];
    }

    if (strategy === "forward_fill") {
      let lastValue: unknown = null;
      return data.map((row) => {
        if (row[column] != null) {
          lastValue = row[column];
          return row;
        }
        return { ...row, [column]: lastValue };
      });
    } else if (strategy === "drop") {
      return data.filter((row) => row[column] != null);
    } else {
      return data.map((row) =>
        row[column] == null ? { ...row, [column]: fillValue } : row
      );
    }
  } catch (err) {
    logger.error("Missing value handling failed", { error: err });
    throw AppError.internal("Missing value handling failed");
  }
}

/**
 * Detect and remove outliers using standard deviation
 */
export function removeOutliers(
  data: Record<string, number>[],
  column: string,
  threshold: number = 3
): Record<string, number>[] {
  try {
    const values = data
      .map((row) => row[column])
      .filter((v) => typeof v === "number" && !isNaN(v)) as number[];

    if (values.length === 0) return data;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(
      values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length
    );

    return data.filter((row) => {
      const value = row[column];
      if (typeof value !== "number" || isNaN(value)) return true;
      return Math.abs((value - mean) / std) <= threshold;
    });
  } catch (err) {
    logger.error("Outlier removal failed", { error: err });
    throw AppError.internal("Outlier removal failed");
  }
}

/**
 * Calculate feature statistics and correlations
 */
export function calculateFeatureStats(
  data: Record<string, number>[],
  features: FeatureDefinition[]
): FeatureSetStats {
  try {
    const numericFeatures = features.filter(
      (f) => f.type === FeatureType.NUMERIC
    );
    const categoricalFeatures = features.filter(
      (f) => f.type === FeatureType.CATEGORICAL
    );

    const missingDataPercentage: Record<string, number> = {};
    features.forEach((f) => {
      const missingCount = data.filter((row) => row[f.name] == null).length;
      missingDataPercentage[f.name] = (missingCount / data.length) * 100;
    });

    // Calculate correlation matrix for numeric features
    const correlationMatrix: number[][] = [];
    for (let i = 0; i < numericFeatures.length; i++) {
      correlationMatrix[i] = [];
      for (let j = 0; j < numericFeatures.length; j++) {
        if (i === j) {
          correlationMatrix[i][j] = 1;
        } else {
          correlationMatrix[i][j] = calculateCorrelation(
            data.map((row) => row[numericFeatures[i].name] as number),
            data.map((row) => row[numericFeatures[j].name] as number)
          );
        }
      }
    }

    return {
      totalFeatures: features.length,
      numericFeatures: numericFeatures.length,
      categoricalFeatures: categoricalFeatures.length,
      missingDataPercentage,
      correlationMatrix,
    };
  } catch (err) {
    logger.error("Feature statistics calculation failed", { error: err });
    throw AppError.internal("Feature statistics calculation failed");
  }
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }

  const denominator = Math.sqrt(sumSqX * sumSqY);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Check if a date is a Dutch holiday
 */
function isHoliday(date: Date): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const dutchHolidays = [
    [1, 1], // New Year
    [4, 27], // King's Day
    [12, 25], // Christmas
    [12, 26], // Second Day of Christmas
  ];

  return dutchHolidays.some(([m, d]) => m === month && d === day);
}

/**
 * Select top features by importance
 */
export function selectTopFeatures(
  stats: FeatureSetStats,
  targetCount: number = 20
): string[] {
  try {
    // Features with lower missing data percentage are selected
    const sortedFeatures = Object.entries(stats.missingDataPercentage)
      .sort(([, aVal], [, bVal]) => aVal - bVal)
      .slice(0, targetCount)
      .map(([name]) => name);

    return sortedFeatures;
  } catch (err) {
    logger.error("Feature selection failed", { error: err });
    throw AppError.internal("Feature selection failed");
  }
}
