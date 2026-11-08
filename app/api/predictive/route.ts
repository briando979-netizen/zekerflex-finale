/**
 * Predictive Analytics API
 *
 * Endpoints for model management, predictions, and monitoring
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ModelType } from "@prisma/client";
import * as forecasting from "@/lib/predictive/forecasting";
import * as anomaly from "@/lib/predictive/anomaly-detection";
import * as recommendations from "@/lib/predictive/recommendations";
import * as propensity from "@/lib/predictive/propensity";
import * as models from "@/lib/predictive/models";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const createModelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["FORECASTING", "ANOMALY", "RECOMMENDATION", "PROPENSITY", "FEATURE_ENG"]),
  hyperparameters: z.record(z.unknown()).optional(),
  featureSet: z.array(z.string()),
});

const startTrainingSchema = z.object({
  modelId: z.string(),
  dataSize: z.number().int().positive(),
  trainTestSplit: z.number().min(0.5).max(0.95),
  hyperparameters: z.record(z.unknown()).optional(),
});

const predictChurnSchema = z.object({
  userId: z.string(),
  engagementScore: z.number().min(0).max(100),
  activityFrequency: z.number().min(0),
  totalSpend: z.number().min(0),
  averageOrderValue: z.number().min(0),
  supportTickets: z.number().int().min(0),
  complaints: z.number().int().min(0),
  nps: z.number().min(-100).max(100),
  contractLength: z.number().int().positive(),
  daysUntilRenewal: z.number().int(),
  joinDate: z.string().datetime(),
  lastActivityDate: z.string().datetime(),
});

const detectAnomalySchema = z.object({
  entityId: z.string(),
  entityType: z.string(),
  values: z.array(
    z.object({
      timestamp: z.string().datetime(),
      value: z.number(),
    })
  ),
  method: z.enum(["statistical", "isolation_forest", "moving_average", "mahalanobis"]).optional(),
});

const forecastSchema = z.object({
  entityId: z.string(),
  entityType: z.string(),
  data: z.array(
    z.object({
      timestamp: z.string().datetime(),
      value: z.number(),
    })
  ),
  forecastPeriods: z.number().int().min(1).max(365).optional(),
  method: z.enum(["arima", "exponential_smoothing", "moving_average", "hybrid"]).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/predictive
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const action = request.nextUrl.searchParams.get("action");

    if (action === "list-models") {
      const models = await prisma.predictionModel.findMany({
        include: {
          trainingRuns: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          metrics: {
            orderBy: { period: "desc" },
            take: 10,
          },
        },
      });

      return NextResponse.json({ models });
    }

    if (action === "model") {
      const modelId = request.nextUrl.searchParams.get("id");
      if (!modelId) {
        throw AppError.validation("Model ID required");
      }

      const model = await models.getModel(modelId);
      return NextResponse.json({ model });
    }

    if (action === "check-drift") {
      const modelId = request.nextUrl.searchParams.get("modelId");
      if (!modelId) {
        throw AppError.validation("Model ID required");
      }

      const drift = await models.detectModelDrift(modelId);
      return NextResponse.json(drift);
    }

    if (action === "should-retrain") {
      const modelId = request.nextUrl.searchParams.get("modelId");
      if (!modelId) {
        throw AppError.validation("Model ID required");
      }

      const result = await models.shouldRetrain(modelId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// ---------------------------------------------------------------------------
// POST /api/predictive
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const body = await request.json();
    const action = request.nextUrl.searchParams.get("action");

    if (action === "create-model") {
      const validated = createModelSchema.parse(body);
      const modelId = await models.createModel({
        name: validated.name,
        type: validated.type as ModelType,
        hyperparameters: validated.hyperparameters || {},
        featureSet: validated.featureSet,
      });

      return NextResponse.json({ modelId }, { status: 201 });
    }

    if (action === "start-training") {
      const validated = startTrainingSchema.parse(body);
      const trainingRunId = await models.startTrainingRun(
        validated.modelId,
        {
          modelId: validated.modelId,
          dataSize: validated.dataSize,
          trainTestSplit: validated.trainTestSplit,
          validationSplit: 0.1,
          hyperparameters: validated.hyperparameters || {},
          features: [],
          targetVariable: "target",
          maxIterations: 100,
        }
      );

      return NextResponse.json({ trainingRunId }, { status: 201 });
    }

    if (action === "predict-churn") {
      const validated = predictChurnSchema.parse(body);
      const churnScore = propensity.predictChurnProbability({
        userId: validated.userId,
        engagementScore: validated.engagementScore,
        activityFrequency: validated.activityFrequency,
        totalSpend: validated.totalSpend,
        averageOrderValue: validated.averageOrderValue,
        supportTickets: validated.supportTickets,
        complaints: validated.complaints,
        nps: validated.nps,
        contractLength: validated.contractLength,
        daysUntilRenewal: validated.daysUntilRenewal,
        joinDate: new Date(validated.joinDate),
        lastActivityDate: new Date(validated.lastActivityDate),
      });

      return NextResponse.json({ churnScore });
    }

    if (action === "predict-upsell") {
      const validated = predictChurnSchema.parse(body);
      const upsellScore = propensity.predictUpsellOpportunity({
        userId: validated.userId,
        engagementScore: validated.engagementScore,
        activityFrequency: validated.activityFrequency,
        totalSpend: validated.totalSpend,
        averageOrderValue: validated.averageOrderValue,
        supportTickets: validated.supportTickets,
        complaints: validated.complaints,
        nps: validated.nps,
        contractLength: validated.contractLength,
        daysUntilRenewal: validated.daysUntilRenewal,
        joinDate: new Date(validated.joinDate),
        lastActivityDate: new Date(validated.lastActivityDate),
      });

      return NextResponse.json({ upsellScore });
    }

    if (action === "predict-renewal") {
      const validated = predictChurnSchema.parse(body);
      const renewalScore = propensity.predictRenewalProbability({
        userId: validated.userId,
        engagementScore: validated.engagementScore,
        activityFrequency: validated.activityFrequency,
        totalSpend: validated.totalSpend,
        averageOrderValue: validated.averageOrderValue,
        supportTickets: validated.supportTickets,
        complaints: validated.complaints,
        nps: validated.nps,
        contractLength: validated.contractLength,
        daysUntilRenewal: validated.daysUntilRenewal,
        joinDate: new Date(validated.joinDate),
        lastActivityDate: new Date(validated.lastActivityDate),
      });

      return NextResponse.json({ renewalScore });
    }

    if (action === "detect-anomaly") {
      const validated = detectAnomalySchema.parse(body);
      const data = validated.values.map((v) => ({
        timestamp: new Date(v.timestamp),
        value: v.value,
      }));

      const method = (validated.method || "statistical") as anomaly.AnomalyDetectionMethod;

      let scores: anomaly.AnomalyScore[];
      if (method === "statistical") {
        scores = anomaly.statisticalAnomalyDetection(data);
      } else if (method === "moving_average") {
        scores = anomaly.movingAverageAnomalyDetection(data);
      } else if (method === "mahalanobis") {
        scores = anomaly.mahalanobisAnomalyDetection(data);
      } else {
        scores = anomaly.ensembleAnomalyDetection(data);
      }

      // Create alerts for anomalies
      const alerts = scores
        .filter((s) => s.isAnomaly)
        .map((s, idx) => {
          const dataPoint = data[idx];
          return anomaly.generateAnomalyAlert(
            dataPoint,
            s,
            validated.entityId,
            validated.entityType
          );
        });

      return NextResponse.json({ scores, alerts });
    }

    if (action === "forecast") {
      const validated = forecastSchema.parse(body);
      const data = validated.data.map((d) => ({
        timestamp: new Date(d.timestamp),
        value: d.value,
      }));

      const method = (validated.method || "exponential_smoothing") as forecasting.ForecastingMethod;
      const periods = validated.forecastPeriods || 12;

      let forecasts: forecasting.Forecast[];
      if (method === "arima") {
        forecasts = forecasting.arimaForecast(
          data,
          { p: 1, d: 1, q: 1 },
          periods
        );
      } else if (method === "moving_average") {
        forecasts = forecasting.movingAverageForecast(data, 12, periods);
      } else if (method === "hybrid") {
        const arima = forecasting.arimaForecast(
          data,
          { p: 1, d: 1, q: 1 },
          periods
        );
        const exp = forecasting.exponentialSmoothingForecast(
          data,
          0.3,
          0.1,
          0.1,
          12,
          periods
        );
        forecasts = forecasting.ensembleForecasts([arima, exp], [0.5, 0.5]);
      } else {
        forecasts = forecasting.exponentialSmoothingForecast(
          data,
          0.3,
          0.1,
          0.1,
          12,
          periods
        );
      }

      return NextResponse.json({ forecasts });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/predictive
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const body = await request.json();
    const action = request.nextUrl.searchParams.get("action");

    if (action === "complete-training") {
      const schema = z.object({
        trainingRunId: z.string(),
        trainAccuracy: z.number().min(0).max(1),
        testAccuracy: z.number().min(0).max(1),
        validationAccuracy: z.number().min(0).max(1),
        precision: z.number().min(0).max(1),
        recall: z.number().min(0).max(1),
        f1Score: z.number().min(0).max(1),
        trainingTime: z.number().positive(),
      });

      const validated = schema.parse(body);
      await models.completeTrainingRun(validated.trainingRunId, {
        trainAccuracy: validated.trainAccuracy,
        testAccuracy: validated.testAccuracy,
        validationAccuracy: validated.validationAccuracy,
        precision: validated.precision,
        recall: validated.recall,
        f1Score: validated.f1Score,
        trainingTime: validated.trainingTime,
      });

      return NextResponse.json({ success: true });
    }

    if (action === "record-metrics") {
      const schema = z.object({
        modelId: z.string(),
        predictionsCount: z.number().int().positive(),
        correctPredictions: z.number().int().min(0),
        precision: z.number().min(0).max(1),
        recall: z.number().min(0).max(1),
        f1Score: z.number().min(0).max(1),
      });

      const validated = schema.parse(body);
      await models.recordModelMetrics(validated.modelId, {
        predictionsCount: validated.predictionsCount,
        correctPredictions: validated.correctPredictions,
        precision: validated.precision,
        recall: validated.recall,
        f1Score: validated.f1Score,
      });

      return NextResponse.json({ success: true });
    }

    if (action === "promote-model") {
      const schema = z.object({
        modelId: z.string(),
        version: z.number().int().positive(),
      });

      const validated = schema.parse(body);
      await models.promoteModel(validated.modelId, validated.version);

      return NextResponse.json({ success: true });
    }

    if (action === "schedule-retraining") {
      const schema = z.object({
        modelId: z.string(),
        intervalDays: z.number().int().positive().optional(),
      });

      const validated = schema.parse(body);
      await models.scheduleRetraining(
        validated.modelId,
        validated.intervalDays || 30
      );

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
