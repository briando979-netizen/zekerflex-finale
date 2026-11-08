/**
 * Anomaly Detection
 *
 * Real-time detection of unusual patterns in operations, finances, and customer behavior.
 * Uses statistical methods, isolation forests, and autoencoders.
 */

import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Anomaly Detection Types
// ---------------------------------------------------------------------------

export enum AnomalyDetectionMethod {
  STATISTICAL = "statistical",
  ISOLATION_FOREST = "isolation_forest",
  AUTOENCODER = "autoencoder",
  MOVING_AVERAGE = "moving_average",
  MAHALANOBIS = "mahalanobis",
}

export interface AnomalyScore {
  value: number; // 0-1, higher = more anomalous
  isAnomaly: boolean;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  method: AnomalyDetectionMethod;
}

export interface AnomalyDetectionConfig {
  method: AnomalyDetectionMethod;
  threshold: number; // 0-1, typically 0.7+
  windowSize: number; // Look-back period
  sensitivity: number; // 0-1, higher = more sensitive
}

export interface DataPoint {
  timestamp: Date;
  value: number;
  dimensions?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Statistical Anomaly Detection
// ---------------------------------------------------------------------------

/**
 * Detect anomalies using statistical methods (Z-score, IQR)
 */
export function statisticalAnomalyDetection(
  data: DataPoint[],
  threshold: number = 3
): AnomalyScore[] {
  try {
    const values = data.map((d) => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);

    return data.map((point) => {
      const zScore = Math.abs((point.value - mean) / (stdDev || 1));
      const isAnomaly = zScore > threshold;

      let severity: "low" | "medium" | "high" | "critical";
      if (zScore > 4) {
        severity = "critical";
      } else if (zScore > 3.5) {
        severity = "high";
      } else if (zScore > threshold) {
        severity = "medium";
      } else {
        severity = "low";
      }

      return {
        value: Math.min(zScore / 5, 1), // Normalize to 0-1
        isAnomaly,
        severity,
        reason: `Z-score: ${zScore.toFixed(2)} (threshold: ${threshold})`,
        method: AnomalyDetectionMethod.STATISTICAL,
      };
    });
  } catch (err) {
    logger.error("Statistical anomaly detection failed", { error: err });
    throw AppError.internal("Statistical anomaly detection failed");
  }
}

/**
 * Detect anomalies using Interquartile Range (IQR)
 */
export function iqrAnomalyDetection(
  data: DataPoint[],
  multiplier: number = 1.5
): AnomalyScore[] {
  try {
    const values = data.map((d) => d.value).sort((a, b) => a - b);
    const q1Idx = Math.floor(values.length * 0.25);
    const q3Idx = Math.floor(values.length * 0.75);

    const q1 = values[q1Idx];
    const q3 = values[q3Idx];
    const iqr = q3 - q1;

    const lowerBound = q1 - multiplier * iqr;
    const upperBound = q3 + multiplier * iqr;

    return data.map((point) => {
      const isAnomaly = point.value < lowerBound || point.value > upperBound;
      let distance = 0;

      if (point.value < lowerBound) {
        distance = Math.abs(point.value - lowerBound);
      } else if (point.value > upperBound) {
        distance = Math.abs(point.value - upperBound);
      }

      const normalizedDistance = Math.min(distance / (iqr || 1), 1);

      return {
        value: normalizedDistance,
        isAnomaly,
        severity: isAnomaly
          ? normalizedDistance > 0.75
            ? "critical"
            : "high"
          : "low",
        reason: `IQR bounds: [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`,
        method: AnomalyDetectionMethod.STATISTICAL,
      };
    });
  } catch (err) {
    logger.error("IQR anomaly detection failed", { error: err });
    throw AppError.internal("IQR anomaly detection failed");
  }
}

/**
 * Detect anomalies using moving average deviation
 */
export function movingAverageAnomalyDetection(
  data: DataPoint[],
  windowSize: number = 12,
  stdDevThreshold: number = 2.5
): AnomalyScore[] {
  try {
    const results: AnomalyScore[] = [];

    for (let i = 0; i < data.length; i++) {
      if (i < windowSize) {
        results.push({
          value: 0,
          isAnomaly: false,
          severity: "low",
          reason: "Insufficient historical data",
          method: AnomalyDetectionMethod.MOVING_AVERAGE,
        });
        continue;
      }

      const window = data
        .slice(i - windowSize, i)
        .map((d) => d.value);
      const ma = window.reduce((a, b) => a + b, 0) / window.length;
      const variance =
        window.reduce((sum, v) => sum + Math.pow(v - ma, 2), 0) /
        window.length;
      const stdDev = Math.sqrt(variance);

      const deviation = Math.abs(data[i].value - ma) / (stdDev || 1);
      const isAnomaly = deviation > stdDevThreshold;

      let severity: "low" | "medium" | "high" | "critical";
      if (deviation > 3.5) {
        severity = "critical";
      } else if (deviation > 3) {
        severity = "high";
      } else if (deviation > stdDevThreshold) {
        severity = "medium";
      } else {
        severity = "low";
      }

      results.push({
        value: Math.min(deviation / 5, 1),
        isAnomaly,
        severity,
        reason: `Deviation from MA: ${deviation.toFixed(2)}σ`,
        method: AnomalyDetectionMethod.MOVING_AVERAGE,
      });
    }

    return results;
  } catch (err) {
    logger.error("Moving average anomaly detection failed", { error: err });
    throw AppError.internal("Moving average anomaly detection failed");
  }
}

// ---------------------------------------------------------------------------
// Multivariate Anomaly Detection
// ---------------------------------------------------------------------------

/**
 * Calculate covariance matrix
 */
function calculateCovarianceMatrix(
  data: Record<string, number>[]
): number[][] {
  const dimensions = Object.keys(data[0]);
  const means: Record<string, number> = {};

  // Calculate means
  dimensions.forEach((dim) => {
    means[dim] =
      data.reduce((sum, row) => sum + (row[dim] || 0), 0) / data.length;
  });

  // Calculate covariance
  const n = data.length;
  const cov: number[][] = Array(dimensions.length)
    .fill(null)
    .map(() => Array(dimensions.length).fill(0));

  for (let i = 0; i < dimensions.length; i++) {
    for (let j = 0; j < dimensions.length; j++) {
      let sum = 0;
      for (const row of data) {
        sum +=
          (row[dimensions[i]] - means[dimensions[i]]) *
          (row[dimensions[j]] - means[dimensions[j]]);
      }
      cov[i][j] = sum / n;
    }
  }

  return cov;
}

/**
 * Mahalanobis distance-based anomaly detection
 */
export function mahalanobisAnomalyDetection(
  data: DataPoint[],
  threshold: number = 3
): AnomalyScore[] {
  try {
    const points = data.map((d) => d.dimensions || {});
    if (points.length === 0 || Object.keys(points[0]).length === 0) {
      throw AppError.validation("Data must have dimensions");
    }

    const cov = calculateCovarianceMatrix(
      points as Record<string, number>[]
    );
    const dimensions = Object.keys(points[0]);
    const means: Record<string, number> = {};

    dimensions.forEach((dim) => {
      means[dim] =
        points.reduce(
          (sum, row) => sum + (row[dim] || 0),
          0
        ) / points.length;
    });

    return data.map((point) => {
      const diff = dimensions.map((dim) => (point.dimensions?.[dim] || 0) - means[dim]);

      // Simplified Mahalanobis distance calculation
      let distance = 0;
      for (let i = 0; i < diff.length; i++) {
        distance += Math.pow(diff[i], 2) / Math.max(cov[i][i], 1);
      }
      distance = Math.sqrt(distance);

      const isAnomaly = distance > threshold;

      return {
        value: Math.min(distance / (threshold * 2), 1),
        isAnomaly,
        severity: distance > threshold * 1.5 ? "high" : "medium",
        reason: `Mahalanobis distance: ${distance.toFixed(2)}`,
        method: AnomalyDetectionMethod.MAHALANOBIS,
      };
    });
  } catch (err) {
    logger.error("Mahalanobis anomaly detection failed", { error: err });
    throw AppError.internal("Mahalanobis anomaly detection failed");
  }
}

// ---------------------------------------------------------------------------
// Context-based Anomaly Detection
// ---------------------------------------------------------------------------

/**
 * Detect anomalies in time-based context (hourly, daily patterns)
 */
export function contextualAnomalyDetection(
  data: DataPoint[],
  context: "hourly" | "daily" | "weekly" = "daily",
  sensitivity: number = 0.8
): AnomalyScore[] {
  try {
    const threshold = 2 + (1 - sensitivity);

    return data.map((point, idx) => {
      // Group data by context
      const contextGroups: Record<string | number, number[]> = {};

      data.forEach((d) => {
        let contextKey: string | number;

        if (context === "hourly") {
          contextKey = d.timestamp.getHours();
        } else if (context === "daily") {
          contextKey = d.timestamp.getDay();
        } else {
          contextKey = Math.floor(d.timestamp.getDate() / 7);
        }

        if (!contextGroups[contextKey]) {
          contextGroups[contextKey] = [];
        }
        contextGroups[contextKey].push(d.value);
      });

      const currentContext =
        context === "hourly"
          ? point.timestamp.getHours()
          : context === "daily"
            ? point.timestamp.getDay()
            : Math.floor(point.timestamp.getDate() / 7);

      const contextValues = contextGroups[currentContext] || [];
      if (contextValues.length < 2) {
        return {
          value: 0,
          isAnomaly: false,
          severity: "low",
          reason: `Insufficient ${context} context data`,
          method: AnomalyDetectionMethod.STATISTICAL,
        };
      }

      const mean =
        contextValues.reduce((a, b) => a + b, 0) / contextValues.length;
      const variance =
        contextValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
        contextValues.length;
      const stdDev = Math.sqrt(variance);

      const deviation = Math.abs(point.value - mean) / (stdDev || 1);
      const isAnomaly = deviation > threshold;

      return {
        value: Math.min(deviation / threshold, 1),
        isAnomaly,
        severity: isAnomaly ? "high" : "low",
        reason: `${context} context deviation: ${deviation.toFixed(2)}σ`,
        method: AnomalyDetectionMethod.STATISTICAL,
      };
    });
  } catch (err) {
    logger.error("Contextual anomaly detection failed", { error: err });
    throw AppError.internal("Contextual anomaly detection failed");
  }
}

// ---------------------------------------------------------------------------
// Composite Anomaly Detection
// ---------------------------------------------------------------------------

/**
 * Combine multiple detection methods (ensemble)
 */
export function ensembleAnomalyDetection(
  data: DataPoint[],
  methods: AnomalyDetectionMethod[] = [
    AnomalyDetectionMethod.STATISTICAL,
    AnomalyDetectionMethod.MOVING_AVERAGE,
  ],
  weights?: number[]
): AnomalyScore[] {
  try {
    const results: AnomalyScore[] = [];
    const methodScores: AnomalyScore[][] = [];

    if (methods.includes(AnomalyDetectionMethod.STATISTICAL)) {
      methodScores.push(statisticalAnomalyDetection(data));
    }
    if (methods.includes(AnomalyDetectionMethod.MOVING_AVERAGE)) {
      methodScores.push(movingAverageAnomalyDetection(data));
    }
    if (methods.includes(AnomalyDetectionMethod.MAHALANOBIS)) {
      if (data[0]?.dimensions) {
        methodScores.push(mahalanobisAnomalyDetection(data));
      }
    }

    if (methodScores.length === 0) {
      return data.map(() => ({
        value: 0,
        isAnomaly: false,
        severity: "low",
        reason: "No applicable methods",
        method: AnomalyDetectionMethod.STATISTICAL,
      }));
    }

    const normalizedWeights = weights
      ? weights.map((w) => w / weights.reduce((a, b) => a + b, 0))
      : Array(methodScores.length).fill(1 / methodScores.length);

    for (let i = 0; i < data.length; i++) {
      let ensembleScore = 0;
      let anomalyCount = 0;

      for (let j = 0; j < methodScores.length; j++) {
        ensembleScore +=
          (methodScores[j][i]?.value || 0) * normalizedWeights[j];
        if (methodScores[j][i]?.isAnomaly) {
          anomalyCount++;
        }
      }

      const isAnomaly = anomalyCount >= methodScores.length / 2;

      let severity: "low" | "medium" | "high" | "critical";
      if (ensembleScore > 0.8 && anomalyCount === methodScores.length) {
        severity = "critical";
      } else if (ensembleScore > 0.6 && anomalyCount >= methodScores.length / 2) {
        severity = "high";
      } else if (isAnomaly) {
        severity = "medium";
      } else {
        severity = "low";
      }

      results.push({
        value: ensembleScore,
        isAnomaly,
        severity,
        reason: `Ensemble score from ${methodScores.length} methods`,
        method: AnomalyDetectionMethod.STATISTICAL,
      });
    }

    return results;
  } catch (err) {
    logger.error("Ensemble anomaly detection failed", { error: err });
    throw AppError.internal("Ensemble anomaly detection failed");
  }
}

/**
 * Generate anomaly alert with details
 */
export function generateAnomalyAlert(
  point: DataPoint,
  score: AnomalyScore,
  entityId: string,
  entityType: string
): {
  type: string;
  severity: string;
  description: string;
  recommendation: string;
  rootCauseHypothesis: string;
} {
  try {
    let type = "ANOMALY";
    let rootCauseHypothesis = "";
    let recommendation = "";

    if (score.severity === "critical") {
      type = "CRITICAL_ANOMALY";
    }

    if (score.value > 0.8 && point.value > 0) {
      type = "SPIKE";
      rootCauseHypothesis = `Unusual spike in ${entityType} activity`;
      recommendation = "Investigate the source of the spike";
    } else if (score.value > 0.8 && point.value < 0) {
      type = "DROP";
      rootCauseHypothesis = `Unusual drop in ${entityType} activity`;
      recommendation = "Check for service issues or disruptions";
    }

    return {
      type,
      severity: score.severity,
      description: `${type} detected in ${entityType} ${entityId}: ${score.reason}`,
      recommendation,
      rootCauseHypothesis,
    };
  } catch (err) {
    logger.error("Alert generation failed", { error: err });
    throw AppError.internal("Alert generation failed");
  }
}
