import { prisma } from "@/lib/prisma";
import { Feature } from "./features";

export interface TrainingConfig {
  modelName: string;
  epochs: number;
  batchSize: number;
  learningRate: number;
  testSplit: number;
  hyperparameters: Record<string, unknown>;
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  rmse?: number;
}

export interface ModelVersion {
  id: string;
  modelName: string;
  version: number;
  metrics: ModelMetrics;
  hyperparameters: Record<string, unknown>;
  trainingDate: Date;
  status: "training" | "active" | "inactive" | "archived";
}

export async function createTrainingJob(
  config: TrainingConfig
): Promise<{ jobId: string; status: string }> {
  const job = await prisma.trainingJob.create({
    data: {
      modelName: config.modelName,
      config: config as unknown as Record<string, unknown>,
      status: "pending",
      startedAt: new Date(),
    },
  });

  return { jobId: job.id, status: "pending" };
}

export function performCrossValidation(
  features: Feature[][],
  labels: number[],
  folds: number = 5
): { meanScore: number; stdDev: number; foldScores: number[] } {
  const foldSize = Math.floor(features.length / folds);
  const foldScores: number[] = [];

  for (let i = 0; i < folds; i++) {
    const testStart = i * foldSize;
    const testEnd = testStart + foldSize;

    const testFeatures = features.slice(testStart, testEnd);
    const testLabels = labels.slice(testStart, testEnd);
    const trainFeatures = [
      ...features.slice(0, testStart),
      ...features.slice(testEnd),
    ];
    const trainLabels = [
      ...labels.slice(0, testStart),
      ...labels.slice(testEnd),
    ];

    const score = evaluateModel(trainFeatures, trainLabels, testFeatures, testLabels);
    foldScores.push(score);
  }

  const meanScore = foldScores.reduce((a, b) => a + b, 0) / folds;
  const variance = foldScores.reduce((sum, score) => sum + Math.pow(score - meanScore, 2), 0) / folds;
  const stdDev = Math.sqrt(variance);

  return { meanScore, stdDev, foldScores };
}

export function hyperparameterTuning(
  features: Feature[][],
  labels: number[],
  paramGrid: Record<string, unknown[]>
): { bestParams: Record<string, unknown>; bestScore: number } {
  const params = Object.entries(paramGrid);
  let bestParams: Record<string, unknown> = {};
  let bestScore = -Infinity;

  function generateCombinations(
    index: number,
    current: Record<string, unknown>
  ): void {
    if (index === params.length) {
      const score = evaluateParams(features, labels, current);
      if (score > bestScore) {
        bestScore = score;
        bestParams = { ...current };
      }
      return;
    }

    const [paramName, paramValues] = params[index]!;
    for (const value of paramValues as unknown[]) {
      generateCombinations(index + 1, { ...current, [paramName]: value });
    }
  }

  generateCombinations(0, {});

  return { bestParams, bestScore };
}

export async function saveModelVersion(
  modelName: string,
  metrics: ModelMetrics,
  hyperparameters: Record<string, unknown>
): Promise<ModelVersion> {
  const latestVersion = await prisma.modelVersion.findFirst({
    where: { modelName },
    orderBy: { version: "desc" },
  });

  const version = (latestVersion?.version ?? 0) + 1;

  const modelVersion = await prisma.modelVersion.create({
    data: {
      modelName,
      version,
      metrics: metrics as unknown as Record<string, unknown>,
      hyperparameters,
      trainingDate: new Date(),
      status: "active",
    },
  });

  return {
    id: modelVersion.id,
    modelName: modelVersion.modelName,
    version: modelVersion.version,
    metrics,
    hyperparameters,
    trainingDate: modelVersion.trainingDate,
    status: "active",
  };
}

export async function getActiveModel(modelName: string): Promise<ModelVersion | null> {
  const model = await prisma.modelVersion.findFirst({
    where: { modelName, status: "active" },
    orderBy: { version: "desc" },
  });

  if (!model) return null;

  return {
    id: model.id,
    modelName: model.modelName,
    version: model.version,
    metrics: model.metrics as unknown as ModelMetrics,
    hyperparameters: model.hyperparameters as unknown as Record<string, unknown>,
    trainingDate: model.trainingDate,
    status: "active",
  };
}

export async function performABTest(
  modelA: ModelVersion,
  modelB: ModelVersion,
  testSize: number = 1000
): Promise<{ winner: string; confidence: number; auc: number }> {
  const aucDiff = Math.abs(modelA.metrics.auc - modelB.metrics.auc);
  const confidence = Math.min(1, aucDiff * 2);
  const winner = modelA.metrics.auc > modelB.metrics.auc ? modelA.id : modelB.id;

  return { winner, confidence, auc: Math.max(modelA.metrics.auc, modelB.metrics.auc) };
}

function evaluateModel(
  trainFeatures: Feature[][],
  trainLabels: number[],
  testFeatures: Feature[][],
  testLabels: number[]
): number {
  let correct = 0;
  for (let i = 0; i < testFeatures.length; i++) {
    const prediction = simplePrediction(testFeatures[i]!);
    if ((prediction > 0.5 ? 1 : 0) === testLabels[i]) {
      correct++;
    }
  }
  return correct / testFeatures.length;
}

function evaluateParams(
  features: Feature[][],
  labels: number[],
  params: Record<string, unknown>
): number {
  const splits = (params.testSplit as number) || 0.2;
  const splitPoint = Math.floor(features.length * (1 - splits));

  const trainFeatures = features.slice(0, splitPoint);
  const trainLabels = labels.slice(0, splitPoint);
  const testFeatures = features.slice(splitPoint);
  const testLabels = labels.slice(splitPoint);

  return evaluateModel(trainFeatures, trainLabels, testFeatures, testLabels);
}

function simplePrediction(features: Feature[]): number {
  const sum = features.reduce((acc, f) => acc + f.value, 0);
  return 1 / (1 + Math.exp(-sum));
}
