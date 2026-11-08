/**
 * MLOps API Routes
 * - Training, Registry, Deployment, Features, Monitoring, Explainability
 */

import { NextRequest, NextResponse } from "next/server";
import * as training from "@/lib/mlops/training";
import * as registry from "@/lib/mlops/registry";
import * as deployment from "@/lib/mlops/deployment";
import * as features from "@/lib/mlops/features";
import * as monitoring from "@/lib/mlops/monitoring";
import * as explainability from "@/lib/mlops/explainability";
import { AppError } from "@/lib/api/error";

/**
 * POST /api/mlops
 * Route handler for MLOps operations
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { action, payload } = body;

    if (!action || typeof action !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid action" },
        { status: 400 }
      );
    }

    // ========================================================================
    // Training Operations
    // ========================================================================

    if (action === "training.startRun") {
      const result = await training.startTrainingRun(
        payload as training.TrainingConfig
      );
      return NextResponse.json(result);
    }

    if (action === "training.getStatus") {
      const result = await training.getTrainingStatus(
        payload as unknown as string
      );
      return NextResponse.json(result);
    }

    if (action === "training.cancel") {
      await training.cancelTrainingRun(payload as unknown as string);
      return NextResponse.json({ success: true });
    }

    if (action === "training.complete") {
      const { trainingRunId, result } = payload as {
        trainingRunId: string;
        result: Omit<training.TrainingResult, "trainingRunId">;
      };
      const res = await training.completeTrainingRun(trainingRunId, result);
      return NextResponse.json(res);
    }

    if (action === "training.startTune") {
      const result = await training.startHyperparameterTune(
        payload as training.HyperparameterTuneJob
      );
      return NextResponse.json(result);
    }

    if (action === "training.validatePerformance") {
      const { versionId, metrics } = payload as {
        versionId: string;
        metrics: Record<string, number>;
      };
      const result = await training.validateModelPerformance(versionId, metrics);
      return NextResponse.json(result);
    }

    // ========================================================================
    // Model Registry Operations
    // ========================================================================

    if (action === "registry.register") {
      const { name, description, tenantId } = payload as {
        name: string;
        description: string;
        tenantId: string;
      };
      const result = await registry.registerModel(name, description, tenantId);
      return NextResponse.json(result);
    }

    if (action === "registry.get") {
      const result = await registry.getModelRegistry(payload as unknown as string);
      return NextResponse.json(result);
    }

    if (action === "registry.getVersion") {
      const result = await registry.getVersionMetadata(payload as unknown as string);
      return NextResponse.json(result);
    }

    if (action === "registry.listVersions") {
      const result = await registry.listModelVersions(payload as unknown as string);
      return NextResponse.json(result);
    }

    if (action === "registry.tag") {
      const { versionId, tags } = payload as {
        versionId: string;
        tags: string[];
      };
      await registry.tagModelVersion(versionId, tags);
      return NextResponse.json({ success: true });
    }

    if (action === "registry.promote") {
      await registry.promoteVersion(payload as unknown as string);
      return NextResponse.json({ success: true });
    }

    if (action === "registry.rollback") {
      const { modelId, targetVersionId } = payload as {
        modelId: string;
        targetVersionId: string;
      };
      await registry.rollbackVersion(modelId, targetVersionId);
      return NextResponse.json({ success: true });
    }

    if (action === "registry.compare") {
      const { versionId1, versionId2 } = payload as {
        versionId1: string;
        versionId2: string;
      };
      const result = await registry.compareVersions(versionId1, versionId2);
      return NextResponse.json(result);
    }

    if (action === "registry.archive") {
      await registry.archiveVersion(payload as unknown as string);
      return NextResponse.json({ success: true });
    }

    if (action === "registry.lineage") {
      const result = await registry.getModelLineage(payload as unknown as string);
      return NextResponse.json(result);
    }

    // ========================================================================
    // Deployment Operations
    // ========================================================================

    if (action === "deployment.deploy") {
      const result = await deployment.deployModel(
        payload as deployment.DeploymentConfig
      );
      return NextResponse.json(result);
    }

    if (action === "deployment.getStatus") {
      const result = await deployment.getDeploymentStatus(
        payload as unknown as string
      );
      return NextResponse.json(result);
    }

    if (action === "deployment.scale") {
      const { deploymentId, replicas } = payload as {
        deploymentId: string;
        replicas: number;
      };
      await deployment.scaleDeployment(deploymentId, replicas);
      return NextResponse.json({ success: true });
    }

    if (action === "deployment.startABTest") {
      const result = await deployment.startABTest(
        payload as deployment.ABTestConfig
      );
      return NextResponse.json(result);
    }

    if (action === "deployment.getABTestResults") {
      const result = await deployment.getABTestResults(payload as unknown as string);
      return NextResponse.json(result);
    }

    if (action === "deployment.recordABTestPrediction") {
      const { testId, versionId, actual, predicted } = payload as {
        testId: string;
        versionId: string;
        actual: number;
        predicted: number;
      };
      await deployment.recordABTestPrediction(
        testId,
        versionId,
        actual,
        predicted
      );
      return NextResponse.json({ success: true });
    }

    if (action === "deployment.completeABTest") {
      const result = await deployment.completeABTest(payload as unknown as string);
      return NextResponse.json(result);
    }

    if (action === "deployment.startCanary") {
      const result = await deployment.startCanaryRelease(
        payload as deployment.CanaryReleaseConfig
      );
      return NextResponse.json(result);
    }

    if (action === "deployment.getCanaryStatus") {
      const result = await deployment.getCanaryStatus(payload as unknown as string);
      return NextResponse.json(result);
    }

    if (action === "deployment.completeCanary") {
      await deployment.completeCanaryRelease(payload as unknown as string);
      return NextResponse.json({ success: true });
    }

    if (action === "deployment.rollbackCanary") {
      await deployment.rollbackCanaryRelease(payload as unknown as string);
      return NextResponse.json({ success: true });
    }

    // ========================================================================
    // Feature Store Operations
    // ========================================================================

    if (action === "features.register") {
      const { definition, tenantId } = payload as {
        definition: features.FeatureDefinition;
        tenantId: string;
      };
      const result = await features.registerFeature(definition, tenantId);
      return NextResponse.json(result);
    }

    if (action === "features.getMetadata") {
      const result = await features.getFeatureMetadata(payload as unknown as string);
      return NextResponse.json(result);
    }

    if (action === "features.list") {
      const { tenantId, filter } = payload as {
        tenantId: string;
        filter?: { tags?: string[]; status?: string };
      };
      const result = await features.listFeatures(tenantId, filter);
      return NextResponse.json(result);
    }

    if (action === "features.storeValues") {
      const result = await features.storeFeatureValues(
        payload as features.FeatureValue[]
      );
      return NextResponse.json(result);
    }

    if (action === "features.getEntityFeatures") {
      const { entityId, featureIds } = payload as {
        entityId: string;
        featureIds?: string[];
      };
      const result = await features.getEntityFeatures(entityId, featureIds);
      return NextResponse.json(result);
    }

    if (action === "features.getStats") {
      const { featureId, hours } = payload as {
        featureId: string;
        hours?: number;
      };
      const result = await features.getFeatureStats(featureId, hours);
      return NextResponse.json(result);
    }

    if (action === "features.getUsage") {
      const result = await features.getFeatureUsage(payload as unknown as string);
      return NextResponse.json(result);
    }

    if (action === "features.version") {
      const { featureId, transformCode } = payload as {
        featureId: string;
        transformCode?: string;
      };
      const result = await features.versionFeature(featureId, transformCode);
      return NextResponse.json(result);
    }

    // ========================================================================
    // Monitoring Operations
    // ========================================================================

    if (action === "monitoring.recordPrediction") {
      const { versionId, entityId, prediction, actual, latency } = payload as {
        versionId: string;
        entityId: string;
        prediction: number;
        actual?: number;
        latency?: number;
      };
      const result = await monitoring.recordPrediction(
        versionId,
        entityId,
        prediction,
        actual,
        latency
      );
      return NextResponse.json(result);
    }

    if (action === "monitoring.detectDrift") {
      const result = await monitoring.detectDrift(
        payload as monitoring.DriftDetectionConfig
      );
      return NextResponse.json(result);
    }

    if (action === "monitoring.checkDegradation") {
      const { versionId, hours } = payload as {
        versionId: string;
        hours?: number;
      };
      const result = await monitoring.checkPerformanceDegradation(versionId, hours);
      return NextResponse.json(result);
    }

    if (action === "monitoring.recordMetric") {
      const result = await monitoring.recordModelMetric(
        payload as monitoring.ModelMetric
      );
      return NextResponse.json(result);
    }

    if (action === "monitoring.getMetricsTimeseries") {
      const { versionId, metricName, hours } = payload as {
        versionId: string;
        metricName: string;
        hours?: number;
      };
      const result = await monitoring.getModelMetricsTimeseries(
        versionId,
        metricName,
        hours
      );
      return NextResponse.json(result);
    }

    if (action === "monitoring.getHealth") {
      const result = await monitoring.getModelHealthSummary(
        payload as unknown as string
      );
      return NextResponse.json(result);
    }

    // ========================================================================
    // Explainability Operations
    // ========================================================================

    if (action === "explainability.calculateImportance") {
      const { versionId, method } = payload as {
        versionId: string;
        method?: "permutation" | "shap" | "tree";
      };
      const result = await explainability.calculateFeatureImportance(
        versionId,
        method
      );
      return NextResponse.json(result);
    }

    if (action === "explainability.generateSHAP") {
      const result = await explainability.generateSHAPExplanation(
        payload as unknown as string
      );
      return NextResponse.json(result);
    }

    if (action === "explainability.getDecisionPath") {
      const result = await explainability.getDecisionPath(
        payload as unknown as string
      );
      return NextResponse.json(result);
    }

    if (action === "explainability.analyzeInteractions") {
      const result = await explainability.analyzeFeatureInteractions(
        payload as unknown as string
      );
      return NextResponse.json(result);
    }

    if (action === "explainability.getReport") {
      const result = await explainability.getExplainabilityReport(
        payload as unknown as string
      );
      return NextResponse.json(result);
    }

    if (action === "explainability.getPredictionExplanation") {
      const result = await explainability.getPredictionExplanation(
        payload as unknown as string
      );
      return NextResponse.json(result);
    }

    // Unknown action
    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    const err = error as Error;
    console.error("MLOps API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mlops
 * Health check & status endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: "operational",
    subsystems: [
      "training",
      "registry",
      "deployment",
      "features",
      "monitoring",
      "explainability",
    ],
    version: "1.0.0",
  });
}
