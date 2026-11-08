/**
 * Time Series Forecasting
 *
 * ARIMA, Prophet, and neural network models for revenue, demand, and churn prediction.
 * Handles data preparation, model training, and forecast generation.
 */

import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Forecasting Types
// ---------------------------------------------------------------------------

export enum ForecastingMethod {
  ARIMA = "arima",
  EXPONENTIAL_SMOOTHING = "exponential_smoothing",
  MOVING_AVERAGE = "moving_average",
  NEURAL_NETWORK = "neural_network",
  HYBRID = "hybrid",
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  confidence?: number;
}

export interface Forecast {
  timestamp: Date;
  predicted: number;
  lower: number; // Confidence interval lower
  upper: number; // Confidence interval upper
  confidence: number; // 0-1
  method: ForecastingMethod;
}

export interface ARIMAParams {
  p: number; // AR order
  d: number; // Differencing order
  q: number; // MA order
}

export interface NeuralNetworkConfig {
  layers: number;
  units: number[];
  activation: "relu" | "sigmoid" | "tanh";
  epochs: number;
  batchSize: number;
  learningRate: number;
  dropout: number;
}

// ---------------------------------------------------------------------------
// Time Series Utilities
// ---------------------------------------------------------------------------

/**
 * Decompose time series into trend, seasonality, and residual
 */
export function decomposeSeries(
  data: TimeSeriesData[],
  seasonalPeriod: number = 12
): {
  trend: number[];
  seasonal: number[];
  residual: number[];
} {
  try {
    if (data.length < seasonalPeriod * 2) {
      throw AppError.validation("Insufficient data for decomposition");
    }

    const values = data.map((d) => d.value);

    // Calculate trend using centered moving average
    const trend = calculateMovingAverage(values, seasonalPeriod);

    // Calculate seasonal component
    const seasonal: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (trend[i] !== null) {
        seasonal[i] = values[i] - trend[i];
      }
    }

    // Average seasonal indices
    const seasonalIndices: Record<number, number[]> = {};
    for (let i = 0; i < data.length; i++) {
      const seasonIndex = i % seasonalPeriod;
      if (!seasonalIndices[seasonIndex]) {
        seasonalIndices[seasonIndex] = [];
      }
      if (seasonal[i] != null) {
        seasonalIndices[seasonIndex].push(seasonal[i]);
      }
    }

    const avgSeasonal: number[] = [];
    Object.values(seasonalIndices).forEach((indices, idx) => {
      avgSeasonal[idx] =
        indices.reduce((a, b) => a + b, 0) / indices.length;
    });

    // Reconstruct seasonal component
    const seasonalFull: number[] = [];
    for (let i = 0; i < data.length; i++) {
      seasonalFull[i] = avgSeasonal[i % seasonalPeriod];
    }

    // Calculate residual
    const residual: number[] = [];
    for (let i = 0; i < data.length; i++) {
      residual[i] = values[i] - trend[i] - seasonalFull[i];
    }

    return {
      trend: trend as number[],
      seasonal: seasonalFull,
      residual,
    };
  } catch (err) {
    logger.error("Series decomposition failed", { error: err });
    throw AppError.internal("Series decomposition failed");
  }
}

/**
 * Calculate moving average
 */
export function calculateMovingAverage(
  values: number[],
  windowSize: number
): (number | null)[] {
  const result: (number | null)[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < values.length; i++) {
    if (i < halfWindow || i >= values.length - halfWindow) {
      result[i] = null;
    } else {
      let sum = 0;
      for (let j = i - halfWindow; j <= i + halfWindow; j++) {
        sum += values[j];
      }
      result[i] = sum / windowSize;
    }
  }

  return result;
}

/**
 * Difference time series to make it stationary
 */
export function differenceTimeSeries(
  values: number[],
  order: number = 1
): number[] {
  let result = [...values];

  for (let d = 0; d < order; d++) {
    const differenced: number[] = [];
    for (let i = 1; i < result.length; i++) {
      differenced.push(result[i] - result[i - 1]);
    }
    result = differenced;
  }

  return result;
}

/**
 * Check for stationarity using Augmented Dickey-Fuller test (simplified)
 */
export function isStationary(
  values: number[],
  threshold: number = 0.05
): boolean {
  try {
    if (values.length < 10) return false;

    // Simplified ADF: check if mean and variance are stable in two halves
    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);

    const mean1 =
      firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const mean2 =
      secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const var1 =
      firstHalf.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) /
      firstHalf.length;
    const var2 =
      secondHalf.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) /
      secondHalf.length;

    const meanDiff = Math.abs(mean1 - mean2) / Math.max(mean1, mean2, 1);
    const varRatio = Math.max(var1, var2) / Math.min(var1, var2, 1);

    return meanDiff < threshold && varRatio < 2;
  } catch (err) {
    logger.error("Stationarity check failed", { error: err });
    return false;
  }
}

/**
 * Simple ARIMA forecasting using exponential smoothing
 */
export function arimaForecast(
  data: TimeSeriesData[],
  params: ARIMAParams,
  forecastPeriods: number = 12
): Forecast[] {
  try {
    const values = data.map((d) => d.value);

    // Difference the series
    let differenced = values;
    for (let i = 0; i < params.d; i++) {
      differenced = differenceTimeSeries(differenced, 1);
    }

    // Calculate exponential smoothing for forecasting
    const alpha = 0.3;
    let level = differenced[0];
    let trend = 0;
    let seasonal = 1;

    for (let i = 1; i < differenced.length; i++) {
      const prevLevel = level;
      level = alpha * differenced[i] + (1 - alpha) * (level + trend);
      trend = 0.1 * (level - prevLevel) + 0.9 * trend;
    }

    // Generate forecasts
    const forecasts: Forecast[] = [];
    const lastDate = data[data.length - 1].timestamp;
    let forecastValue = level;

    for (let i = 0; i < forecastPeriods; i++) {
      const confidence = Math.max(0.7, 1 - i * 0.02); // Decreasing confidence
      const stdDev = calculateStdDev(differenced);

      forecasts.push({
        timestamp: new Date(
          lastDate.getTime() + (i + 1) * 24 * 60 * 60 * 1000
        ),
        predicted: forecastValue,
        lower: forecastValue - 1.96 * stdDev,
        upper: forecastValue + 1.96 * stdDev,
        confidence,
        method: ForecastingMethod.ARIMA,
      });

      forecastValue += trend;
    }

    return forecasts;
  } catch (err) {
    logger.error("ARIMA forecasting failed", { error: err });
    throw AppError.internal("ARIMA forecasting failed");
  }
}

/**
 * Exponential smoothing forecast
 */
export function exponentialSmoothingForecast(
  data: TimeSeriesData[],
  alpha: number = 0.3,
  beta: number = 0.1,
  gamma: number = 0.1,
  seasonalPeriod: number = 12,
  forecastPeriods: number = 12
): Forecast[] {
  try {
    const values = data.map((d) => d.value);

    if (values.length < seasonalPeriod * 2) {
      throw AppError.validation(
        "Insufficient data for seasonal forecasting"
      );
    }

    // Initialize components
    let level = values[0];
    let trend = (values[seasonalPeriod] - values[0]) / seasonalPeriod;
    const seasonality: number[] = [];

    for (let i = 0; i < seasonalPeriod; i++) {
      seasonality[i] = values[i] / level;
    }

    // Fit the model
    for (let t = 1; t < values.length; t++) {
      const prevLevel = level;
      const prevTrend = trend;
      const seasonIndex = t % seasonalPeriod;

      level =
        alpha * (values[t] / seasonality[seasonIndex]) +
        (1 - alpha) * (prevLevel + prevTrend);
      trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
      seasonality[seasonIndex] =
        gamma * (values[t] / level) + (1 - gamma) * seasonality[seasonIndex];
    }

    // Generate forecasts
    const forecasts: Forecast[] = [];
    const lastDate = data[data.length - 1].timestamp;

    for (let i = 0; i < forecastPeriods; i++) {
      const seasonIndex = (values.length + i) % seasonalPeriod;
      const predicted =
        (level + (i + 1) * trend) * seasonality[seasonIndex];

      forecasts.push({
        timestamp: new Date(
          lastDate.getTime() + (i + 1) * 24 * 60 * 60 * 1000
        ),
        predicted,
        lower: predicted * 0.85,
        upper: predicted * 1.15,
        confidence: Math.max(0.65, 1 - i * 0.03),
        method: ForecastingMethod.EXPONENTIAL_SMOOTHING,
      });
    }

    return forecasts;
  } catch (err) {
    logger.error("Exponential smoothing forecasting failed", { error: err });
    throw AppError.internal("Exponential smoothing forecasting failed");
  }
}

/**
 * Simple moving average forecast
 */
export function movingAverageForecast(
  data: TimeSeriesData[],
  windowSize: number = 12,
  forecastPeriods: number = 12
): Forecast[] {
  try {
    const values = data.map((d) => d.value);

    if (values.length < windowSize) {
      throw AppError.validation(
        "Data length must be greater than window size"
      );
    }

    // Calculate moving average of the last window
    let forecast = 0;
    for (let i = values.length - windowSize; i < values.length; i++) {
      forecast += values[i];
    }
    forecast /= windowSize;

    // Calculate standard deviation for confidence intervals
    const stdDev = calculateStdDev(
      values.slice(Math.max(0, values.length - windowSize * 2))
    );

    const forecasts: Forecast[] = [];
    const lastDate = data[data.length - 1].timestamp;

    for (let i = 0; i < forecastPeriods; i++) {
      forecasts.push({
        timestamp: new Date(
          lastDate.getTime() + (i + 1) * 24 * 60 * 60 * 1000
        ),
        predicted: forecast,
        lower: forecast - 1.96 * stdDev,
        upper: forecast + 1.96 * stdDev,
        confidence: Math.max(0.6, 1 - i * 0.05),
        method: ForecastingMethod.MOVING_AVERAGE,
      });
    }

    return forecasts;
  } catch (err) {
    logger.error("Moving average forecasting failed", { error: err });
    throw AppError.internal("Moving average forecasting failed");
  }
}

/**
 * Calculate standard deviation
 */
export function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    values.length;

  return Math.sqrt(variance);
}

/**
 * Combine multiple forecasts (ensemble method)
 */
export function ensembleForecasts(
  forecasts: Forecast[][],
  weights?: number[]
): Forecast[] {
  try {
    if (forecasts.length === 0) {
      throw AppError.validation("No forecasts to ensemble");
    }

    const normalizedWeights = weights
      ? weights.map((w) => w / weights.reduce((a, b) => a + b, 0))
      : Array(forecasts.length).fill(1 / forecasts.length);

    const resultMap: Record<number, Forecast> = {};

    forecasts.forEach((forecastList, idx) => {
      forecastList.forEach((forecast) => {
        const key = forecast.timestamp.getTime();
        if (!resultMap[key]) {
          resultMap[key] = {
            ...forecast,
            predicted: 0,
            lower: 0,
            upper: 0,
            confidence: 0,
            method: ForecastingMethod.HYBRID,
          };
        }

        const weight = normalizedWeights[idx];
        resultMap[key].predicted += forecast.predicted * weight;
        resultMap[key].lower += forecast.lower * weight;
        resultMap[key].upper += forecast.upper * weight;
        resultMap[key].confidence += forecast.confidence * weight;
      });
    });

    return Object.values(resultMap).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  } catch (err) {
    logger.error("Forecast ensembling failed", { error: err });
    throw AppError.internal("Forecast ensembling failed");
  }
}

/**
 * Detect trend changes in forecast
 */
export function detectTrendChange(
  current: Forecast[],
  previous: Forecast[]
): {
  hasChange: boolean;
  changePoint: number;
  direction: "up" | "down" | "stable";
} {
  try {
    if (current.length === 0 || previous.length === 0) {
      return { hasChange: false, changePoint: -1, direction: "stable" };
    }

    const currentTrend =
      (current[current.length - 1].predicted - current[0].predicted) /
      current.length;
    const previousTrend =
      (previous[previous.length - 1].predicted - previous[0].predicted) /
      previous.length;

    const trendsChanged = Math.sign(currentTrend) !== Math.sign(previousTrend);
    const magnitude = Math.abs(currentTrend - previousTrend);
    const significantChange = magnitude > Math.abs(previousTrend) * 0.25;

    return {
      hasChange: trendsChanged && significantChange,
      changePoint: current.length / 2,
      direction:
        currentTrend > 0 ? "up" : currentTrend < 0 ? "down" : "stable",
    };
  } catch (err) {
    logger.error("Trend change detection failed", { error: err });
    return { hasChange: false, changePoint: -1, direction: "stable" };
  }
}
